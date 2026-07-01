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
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { downloadExcel, downloadPdf } from "@/lib/gestion/exports";

export const Route = createFileRoute("/_app/gestion/reportes/diario")({
  component: ReporteDiarioPage,
});

function ReporteDiarioPage() {
  const { sucursalId, sucursalNombre } = useSucursalActiva();
  const [fecha, setFecha] = useState(format(new Date(), "yyyy-MM-dd"));
  const [obraSocialId, setObraSocialId] = useState<string>("all");
  const [odontologoId, setOdontologoId] = useState<string>("all");

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
    queryKey: ["reporte-diario", fecha, sucursalId, obraSocialId, odontologoId],
    queryFn: () =>
      listPrestaciones({
        data: {
          desde: fecha,
          hasta: fecha,
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
    return {
      cantidad: r.length,
      pacientes: new Set(r.map((x: any) => x.atencion_id)).size,
      ars: r.reduce((s: number, x: any) => s + Number(x.monto || 0), 0),
      usd: r.reduce((s: number, x: any) => s + Number(x.monto_usd || 0), 0),
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
    Cantidad: r.cantidad,
    MontoARS: Number(r.monto),
    MontoUSD: r.monto_usd ? Number(r.monto_usd) : "",
  }));

  const onExcel = () => downloadExcel(`reporte-diario-${fecha}.xlsx`, "Diario", exportRows);

  const onPdf = () => {
    downloadPdf(
      `reporte-diario-${fecha}.pdf`,
      `Reporte diario — ${format(new Date(fecha + "T00:00"), "dd/MM/yyyy")}`,
      `Sucursal: ${sucursalNombre} · Obra social: ${obraNombre} · Odontólogo: ${odontologoNombre}`,
      [
        "Odontólogo",
        "Paciente",
        "DNI",
        "Obra social",
        "Código",
        "Descripción",
        "Cant.",
        "Monto ARS",
      ],
      (rows ?? []).map((r: any) => [
        r.odontologos?.nombre ?? "",
        r.paciente,
        r.dni,
        r.obras_sociales?.nombre ?? "",
        r.nomencladores?.codigo ?? r.codigo_manual ?? "",
        r.nomencladores?.descripcion ?? r.descripcion_manual ?? "",
        r.cantidad,
        fmt(Number(r.monto)),
      ]),
      `Total: ${total.pacientes} pacientes · ${total.cantidad} prestaciones · ${fmt(total.ars)}${total.usd ? ` · U$D ${total.usd.toLocaleString("es-AR")}` : ""}`,
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reporte diario</h1>
        <p className="text-sm text-muted-foreground">
          Agrupado por odontólogo. Exportable a Excel y PDF.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
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
          <div className="md:col-span-3 flex gap-2 justify-end">
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
        <Kpi label="Pacientes" value={total.pacientes} />
        <Kpi label="Prestaciones" value={total.cantidad} />
        <Kpi label="Facturado ARS" value={fmt(total.ars)} />
        <Kpi label="Facturado USD" value={`U$D ${total.usd.toLocaleString("es-AR")}`} />
      </div>

      {grupos.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Sin prestaciones para esta fecha.
          </CardContent>
        </Card>
      )}

      {grupos.map(([odo, items]) => {
        const subtotal = items.reduce((s, x: any) => s + Number(x.monto || 0), 0);
        return (
          <Card key={odo}>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b flex justify-between items-center bg-muted/40">
                <div className="font-semibold">{odo}</div>
                <div className="text-sm text-muted-foreground">
                  {items.length} prestaciones ·{" "}
                  <span className="font-medium text-foreground">{fmt(subtotal)}</span>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>DNI</TableHead>
                    <TableHead>Obra social</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{r.paciente}</TableCell>
                      <TableCell>{r.dni}</TableCell>
                      <TableCell>{r.obras_sociales?.nombre}</TableCell>
                      <TableCell>{r.nomencladores?.codigo ?? r.codigo_manual}</TableCell>
                      <TableCell className="text-xs">
                        {r.nomencladores?.descripcion ?? r.descripcion_manual}
                      </TableCell>
                      <TableCell className="text-right">{r.cantidad}</TableCell>
                      <TableCell className="text-right font-medium">
                        {fmt(Number(r.monto))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
