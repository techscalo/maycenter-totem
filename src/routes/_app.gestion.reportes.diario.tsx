import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { listObrasSociales, listOdontologos, listPrestaciones } from "@/lib/gestion/data.server";
import { useSucursalActiva } from "@/lib/gestion/sucursal-activa";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Wallet,
  Stethoscope,
  Users,
  ListChecks,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { downloadExcel, downloadPdf } from "@/lib/gestion/exports";
import {
  montoLinea,
  montoUsdLinea,
  esFacturable,
  copagoLinea,
  facturacionOsLinea,
} from "@/lib/gestion/reportes";
import { SUBTIPO_LABEL } from "@/lib/gestion/codigos";

import { PermissionGate } from "@/components/gestion/PermissionGate";

export const Route = createFileRoute("/_app/gestion/reportes/diario")({
  component: () => (
    <PermissionGate resource="reporte_diario">
      <ReporteDiarioPage />
    </PermissionGate>
  ),
});

const subTipo = (r: { estado_placa?: string | null }) =>
  r.estado_placa ? (SUBTIPO_LABEL[r.estado_placa] ?? r.estado_placa) : "";

function ReporteDiarioPage() {
  const { sucursalId, sucursalNombre } = useSucursalActiva();
  const hoy = format(new Date(), "yyyy-MM-dd");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [obraSocialId, setObraSocialId] = useState<string>("all");
  const [odontologoId, setOdontologoId] = useState<string>("all");
  const rangoLabel = desde === hasta ? desde : `${desde}_a_${hasta}`;

  const { data: obrasSociales } = useQuery({
    queryKey: ["obras-sociales"],
    queryFn: () => listObrasSociales(),
  });

  const { data: odontologos } = useQuery({
    enabled: !!sucursalId,
    queryKey: ["odontologos", sucursalId],
    queryFn: () => listOdontologos({ data: { sucursalId } }),
  });

  const { data: rows } = useQuery({
    enabled: !!sucursalId,
    queryKey: ["reporte-diario", desde, hasta, sucursalId, obraSocialId, odontologoId],
    queryFn: () =>
      listPrestaciones({
        data: {
          desde,
          hasta,
          sucursalId,
          ...(obraSocialId !== "all" ? { obraSocialId } : {}),
          ...(odontologoId !== "all" ? { odontologoId } : {}),
          limit: 2000,
        },
      }),
  });

  const grupos = useMemo(() => {
    const map = new Map<string, any[]>();
    (rows ?? []).forEach((r: any) => {
      const k = r.odontologos?.nombre ?? "—";
      (map.get(k) ?? map.set(k, []).get(k)!).push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const total = useMemo(() => {
    const r = rows ?? [];
    const fact = r.filter(esFacturable);
    return {
      cantidad: r.length,
      pacientes: new Set(r.map((x: any) => x.atencion_id)).size,
      ars: fact.reduce((s: number, x: any) => s + montoLinea(x), 0),
      usd: fact.reduce((s: number, x: any) => s + montoUsdLinea(x), 0),
      produccion: r.reduce((s: number, x: any) => s + montoLinea(x), 0),
      copago: fact.reduce((s: number, x: any) => s + copagoLinea(x), 0),
      facturacionOs: fact.reduce((s: number, x: any) => s + facturacionOsLinea(x), 0),
    };
  }, [rows]);

  const fmt = (n: number) =>
    n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

  const obraNombre =
    obraSocialId === "all"
      ? "Todas"
      : (obrasSociales?.find((o) => o.id === obraSocialId)?.nombre ?? "");
  const odontologoNombre =
    odontologoId === "all"
      ? "Todos"
      : (odontologos?.find((o) => o.id === odontologoId)?.nombre ?? "");

  const exportRows = (rows ?? []).map((r: any) => ({
    Fecha: r.fecha,
    Sucursal: r.sucursales?.nombre ?? "",
    Piso: r.pisos?.nombre ?? "",
    Odontologo: r.odontologos?.nombre ?? "",
    NroOD: r.odontologos?.numero_od ?? "",
    Paciente: r.paciente,
    DNI: r.dni,
    ObraSocial: r.obras_sociales?.nombre ?? "",
    Codigo: r.nomencladores?.codigo ?? r.codigo_manual ?? "",
    Descripcion: r.nomencladores?.descripcion ?? r.descripcion_manual ?? "",
    SubTipo: subTipo(r),
    Cantidad: r.cantidad,
    MontoUnitARS: Number(r.monto),
    MontoTotalARS: montoLinea(r),
    Copago: copagoLinea(r),
    FacturacionOS: facturacionOsLinea(r),
    MontoUSD: r.monto_usd ? Number(r.monto_usd) : "",
    Facturable: r.facturable === false ? "No" : "Sí",
    Observaciones: r.observaciones ?? "",
  }));

  const onExcel = () => downloadExcel(`reporte-${rangoLabel}.xlsx`, "Prestaciones", exportRows);

  const onPdf = () => {
    const tituloRango =
      desde === hasta
        ? format(new Date(desde + "T00:00"), "dd/MM/yyyy")
        : `${format(new Date(desde + "T00:00"), "dd/MM/yyyy")} — ${format(new Date(hasta + "T00:00"), "dd/MM/yyyy")}`;
    downloadPdf(
      `reporte-${rangoLabel}.pdf`,
      `Reporte de prestaciones — ${tituloRango}`,
      `Sucursal: ${sucursalNombre} · Obra social: ${obraNombre} · Odontólogo: ${odontologoNombre}`,
      [
        "Odontólogo",
        "Paciente",
        "DNI",
        "Obra social",
        "Código",
        "Descripción",
        "Cant.",
        "Fact.",
        "Total ARS",
      ],
      (rows ?? []).map((r: any) => [
        r.odontologos?.nombre ?? "",
        r.paciente,
        r.dni,
        r.obras_sociales?.nombre ?? "",
        r.nomencladores?.codigo ?? r.codigo_manual ?? "",
        r.nomencladores?.descripcion ?? r.descripcion_manual ?? "",
        r.cantidad,
        r.facturable === false ? "No" : "Sí",
        fmt(montoLinea(r)),
      ]),
      `Facturado: ${fmt(total.ars)} · Producción: ${fmt(total.produccion)} · ${total.pacientes} pacientes · ${total.cantidad} prestaciones${total.usd ? ` · U$D ${total.usd.toLocaleString("es-AR")}` : ""}`,
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reporte diario</h1>
        <p className="text-sm text-muted-foreground">
          Por día o rango de fechas. Agrupado por odontólogo. Exportable a Excel y PDF.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDesde(hoy);
                setHasta(hoy);
              }}
            >
              Hoy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 6);
                setDesde(format(d, "yyyy-MM-dd"));
                setHasta(hoy);
              }}
            >
              Últimos 7
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date();
                setDesde(format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd"));
                setHasta(hoy);
              }}
            >
              Este mes
            </Button>
          </div>
          <div>
            <Label>Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <Label>Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div>
            <Label>Obra social</Label>
            <Select value={obraSocialId} onValueChange={setObraSocialId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(obrasSociales ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Odontólogo</Label>
            <Select value={odontologoId} onValueChange={setOdontologoId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(odontologos ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={onExcel} disabled={!rows?.length}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
            </Button>
            <Button onClick={onPdf} disabled={!rows?.length}>
              <FileText className="h-4 w-4 mr-2" /> PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Pacientes" value={total.pacientes} icon={<Users className="h-4 w-4" />} />
        <Kpi
          label="Prestaciones"
          value={total.cantidad}
          icon={<ListChecks className="h-4 w-4" />}
        />
        <Kpi
          label="Facturado ARS"
          value={fmt(total.ars)}
          icon={<Wallet className="h-4 w-4" />}
          hint="Lo que se factura (solo prestaciones facturables)"
        />
        <Kpi
          label="Producción ARS"
          value={fmt(total.produccion)}
          icon={<Stethoscope className="h-4 w-4" />}
          hint="Todo el trabajo realizado (incluye no facturables)"
        />
        {total.copago > 0 && (
          <Kpi
            label="Copago (paciente)"
            value={fmt(total.copago)}
            icon={<Wallet className="h-4 w-4" />}
            hint="A cargo del afiliado"
          />
        )}
        {total.copago > 0 && (
          <Kpi
            label="Facturación a OS"
            value={fmt(total.facturacionOs)}
            icon={<Wallet className="h-4 w-4" />}
            hint="A cargo de la obra social (arancel − copago)"
          />
        )}
        {total.usd > 0 && (
          <Kpi label="Facturado USD" value={`U$D ${total.usd.toLocaleString("es-AR")}`} />
        )}
      </div>

      {grupos.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Sin prestaciones para el período seleccionado.
          </CardContent>
        </Card>
      )}

      {grupos.map(([odo, items]) => (
        <GrupoOdontologo key={odo} odo={odo} items={items} fmt={fmt} />
      ))}
    </div>
  );
}

function GrupoOdontologo({
  odo,
  items,
  fmt,
}: {
  odo: string;
  items: any[];
  fmt: (n: number) => string;
}) {
  const [abierto, setAbierto] = useState(true);
  const facturado = items.filter(esFacturable).reduce((s, x: any) => s + montoLinea(x), 0);
  const produccion = items.reduce((s, x: any) => s + montoLinea(x), 0);
  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="w-full px-4 py-3 border-b flex justify-between items-center bg-muted/40 hover:bg-muted/60 transition-colors text-left"
        >
          <div className="flex items-center gap-2 font-semibold">
            {abierto ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            {odo}
          </div>
          <div className="text-sm text-muted-foreground">
            {items.length} prestaciones · Facturado{" "}
            <span className="font-medium text-foreground">{fmt(facturado)}</span>
            {produccion !== facturado && <> · Producción {fmt(produccion)}</>}
          </div>
        </button>
        {abierto && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>DNI</TableHead>
                <TableHead>Obra social</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r: any, i: number) => (
                <TableRow key={i} className={r.facturable === false ? "opacity-60" : ""}>
                  <TableCell>{r.paciente}</TableCell>
                  <TableCell>{r.dni}</TableCell>
                  <TableCell>{r.obras_sociales?.nombre}</TableCell>
                  <TableCell>{r.nomencladores?.codigo ?? r.codigo_manual}</TableCell>
                  <TableCell className="text-xs">
                    {r.nomencladores?.descripcion ?? r.descripcion_manual}
                    {subTipo(r) && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-sky-600">
                        · {subTipo(r)}
                      </span>
                    )}
                    {r.facturable === false && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-600">
                        · no facturable
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{r.cantidad}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fmt(Number(r.monto))}
                  </TableCell>
                  <TableCell className="text-right font-medium">{fmt(montoLinea(r))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: any;
  icon?: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-1 leading-tight">{hint}</div>}
      </CardContent>
    </Card>
  );
}
