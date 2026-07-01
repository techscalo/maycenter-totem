import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { listObrasSociales, listPrestaciones } from "@/lib/gestion/data.server";
import { useSucursalActiva } from "@/lib/gestion/sucursal-activa";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileSpreadsheet, FileText } from "lucide-react";
import { downloadExcel, downloadPdf } from "@/lib/gestion/exports";
import { esPlacaMio, esIncrustacion } from "@/lib/gestion/codigos";

const codeOf = (r: any) => r.nomencladores?.codigo ?? r.codigo_manual ?? "";
const descOf = (r: any) => r.nomencladores?.descripcion ?? r.descripcion_manual ?? "";

export const Route = createFileRoute("/_app/gestion/reportes/ioma")({
  component: ReporteIomaPage,
});

function ReporteIomaPage() {
  const now = new Date();
  const { sucursalId } = useSucursalActiva();
  const [desde, setDesde] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [hasta, setHasta] = useState(format(endOfMonth(now), "yyyy-MM-dd"));

  const { data: ioma } = useQuery({
    queryKey: ["obra-ioma"],
    queryFn: async () => {
      const obras = await listObrasSociales();
      return obras.find((o) => o.nombre.toLowerCase().includes("ioma")) ?? null;
    },
  });

  const { data: rows } = useQuery({
    enabled: !!ioma?.id && !!sucursalId,
    queryKey: ["reporte-ioma", desde, hasta, sucursalId, ioma?.id],
    queryFn: () =>
      listPrestaciones({
        data: {
          desde,
          hasta,
          obraSocialId: ioma!.id,
          sucursalId,
          limit: 2000,
        },
      }),
  });

  const total = useMemo(() => {
    const r = rows ?? [];
    return {
      cantidad: r.length,
      ars: r.reduce((s: number, x: any) => s + Number(x.monto || 0), 0),
      pacientes: new Set(r.map((x: any) => x.dni)).size,
    };
  }, [rows]);

  // Análisis específicos del reporte IOMA (Marcelo + Lucas)
  const analisis = useMemo(() => {
    const r = rows ?? [];
    const primeras = new Map<string, any>();
    const placas = { impresion: 0, entrega: 0, reimpresion: 0, sinEstado: 0 };
    const incrPorOdo = new Map<string, number>();
    const porOdo = new Map<string, { prestaciones: number; ars: number }>();
    const noFact = new Map<string, { cantidad: number; detalles: Map<string, number> }>();
    let incrustaciones = 0;

    r.forEach((x: any) => {
      const cod = codeOf(x);
      const desc = descOf(x);
      const odo = x.odontologos?.nombre ?? "—";

      if (x.primera_vez && !primeras.has(x.atencion_id)) {
        primeras.set(x.atencion_id, { fecha: x.fecha, paciente: x.paciente, odontologo: odo });
      }

      if (esPlacaMio(cod, desc)) {
        const e = x.estado_placa as string | null;
        if (e === "impresion") placas.impresion++;
        else if (e === "entrega") placas.entrega++;
        else if (e === "reimpresion") placas.reimpresion++;
        else placas.sinEstado++;
      }

      if (esIncrustacion(cod, desc)) {
        incrustaciones++;
        incrPorOdo.set(odo, (incrPorOdo.get(odo) ?? 0) + 1);
      }

      const a = porOdo.get(odo) ?? { prestaciones: 0, ars: 0 };
      a.prestaciones++;
      a.ars += Number(x.monto || 0);
      porOdo.set(odo, a);

      if (x.facturable === false) {
        const nf = noFact.get(odo) ?? { cantidad: 0, detalles: new Map<string, number>() };
        nf.cantidad++;
        const k = desc || cod || "—";
        nf.detalles.set(k, (nf.detalles.get(k) ?? 0) + 1);
        noFact.set(odo, nf);
      }
    });

    return {
      primeras: [...primeras.values()],
      placas,
      incrustaciones,
      incrPorOdo: [...incrPorOdo.entries()].sort((a, b) => b[1] - a[1]),
      porOdo: [...porOdo.entries()]
        .map(([nombre, v]) => ({ nombre, ...v }))
        .sort((a, b) => b.ars - a.ars),
      noFact: [...noFact.entries()]
        .map(([nombre, v]) => ({
          nombre,
          cantidad: v.cantidad,
          detalles: [...v.detalles.entries()],
        }))
        .sort((a, b) => b.cantidad - a.cantidad),
    };
  }, [rows]);

  const fmt = (n: number) =>
    n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

  const exportRows = (rows ?? []).map((r: any) => ({
    Fecha: r.fecha,
    Sucursal: r.sucursales?.nombre ?? "",
    Odontologo: r.odontologos?.nombre ?? "",
    NroOD: r.odontologos?.numero_od ?? "",
    Paciente: r.paciente,
    DNI: r.dni,
    Codigo: r.nomencladores?.codigo ?? r.codigo_manual ?? "",
    Descripcion: r.nomencladores?.descripcion ?? r.descripcion_manual ?? "",
    Cantidad: r.cantidad,
    Monto: Number(r.monto),
  }));

  const onExcel = () => downloadExcel(`ioma-${desde}_${hasta}.xlsx`, "IOMA", exportRows);

  const onPdf = () => {
    downloadPdf(
      `ioma-${desde}_${hasta}.pdf`,
      `Reporte IOMA — ${format(new Date(desde + "T00:00"), "dd/MM/yyyy")} al ${format(new Date(hasta + "T00:00"), "dd/MM/yyyy")}`,
      `Maycenter · Primeras consultas: ${analisis.primeras.length} · Incrustaciones: ${analisis.incrustaciones} · Placas MIO impresas/entregadas: ${analisis.placas.impresion}/${analisis.placas.entrega}`,
      [
        "Fecha",
        "Odontólogo",
        "Nº OD",
        "Paciente",
        "DNI",
        "Código",
        "Descripción",
        "Cant.",
        "Monto",
      ],
      (rows ?? []).map((r: any) => [
        format(new Date(r.fecha + "T00:00"), "dd/MM/yyyy"),
        r.odontologos?.nombre ?? "",
        r.odontologos?.numero_od ?? "",
        r.paciente,
        r.dni,
        r.nomencladores?.codigo ?? r.codigo_manual ?? "",
        r.nomencladores?.descripcion ?? r.descripcion_manual ?? "",
        r.cantidad,
        fmt(Number(r.monto)),
      ]),
      `Total: ${total.cantidad} prestaciones · ${total.pacientes} pacientes · ${fmt(total.ars)}`,
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reporte IOMA</h1>
        <p className="text-sm text-muted-foreground">
          Prestaciones de IOMA en el período. Exportable a Excel y PDF.
        </p>
      </div>

      {!ioma && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No hay una obra social llamada <span className="font-semibold">IOMA</span> cargada.
            Creala desde Administración → Obras sociales.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label>Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <Label>Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <Button variant="outline" onClick={onExcel} disabled={!rows?.length}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
            </Button>
            <Button onClick={onPdf} disabled={!rows?.length}>
              <FileText className="h-4 w-4 mr-2" /> PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Kpi label="Prestaciones" value={total.cantidad} />
        <Kpi label="Pacientes" value={total.pacientes} />
        <Kpi label="Facturado" value={fmt(total.ars)} />
      </div>

      {/* Análisis para Marcelo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi label="Primeras consultas" value={analisis.primeras.length} />
        <Kpi label="Incrustaciones" value={analisis.incrustaciones} />
        <Kpi
          label="Placas MIO (impresas / entregadas)"
          value={`${analisis.placas.impresion} / ${analisis.placas.entrega}`}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold">Placas MIO</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Código 806 = 2 sesiones por placa entregada.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="Impresiones" value={analisis.placas.impresion} />
            <MiniStat label="Entregas" value={analisis.placas.entrega} />
            <MiniStat label="Reimpresiones" value={analisis.placas.reimpresion} />
            <MiniStat label="Sesiones entregadas" value={analisis.placas.entrega * 2} />
          </div>
          {analisis.placas.sinEstado > 0 && (
            <p className="text-xs text-amber-600 mt-3">
              {analisis.placas.sinEstado} placa(s) sin estado cargado — completá impresión/entrega
              al cargar la prestación.
            </p>
          )}
        </CardContent>
      </Card>

      {analisis.primeras.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b bg-muted/40 font-semibold">
              Primeras consultas ({analisis.primeras.length})
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Odontólogo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analisis.primeras.map((p: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{format(new Date(p.fecha + "T00:00"), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{p.paciente}</TableCell>
                    <TableCell>{p.odontologo}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b bg-muted/40 font-semibold">
            Actividades por odontólogo
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Odontólogo</TableHead>
                <TableHead className="text-right">Prestaciones</TableHead>
                <TableHead className="text-right">Incrustaciones</TableHead>
                <TableHead className="text-right">Facturado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analisis.porOdo.map((o, i) => {
                const incr = analisis.incrPorOdo.find(([n]) => n === o.nombre)?.[1] ?? 0;
                return (
                  <TableRow key={i}>
                    <TableCell>{o.nombre}</TableCell>
                    <TableCell className="text-right">{o.prestaciones}</TableCell>
                    <TableCell className="text-right">{incr || ""}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(o.ars)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Análisis para Lucas */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b bg-muted/40">
            <span className="font-semibold">Trabajos no facturables</span>
            <span className="text-sm text-muted-foreground"> — rendimiento por odontólogo</span>
          </div>
          {analisis.noFact.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              Sin trabajos no facturables en el período.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Odontólogo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analisis.noFact.map((o, i) => (
                  <TableRow key={i}>
                    <TableCell className="align-top">{o.nombre}</TableCell>
                    <TableCell className="text-right align-top font-medium">{o.cantidad}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.detalles.map(([d, c]) => `${d}${c > 1 ? ` ×${c}` : ""}`).join(" · ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Odontólogo</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>DNI</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((r: any, i) => (
                <TableRow key={i}>
                  <TableCell>{format(new Date(r.fecha + "T00:00"), "dd/MM/yyyy")}</TableCell>
                  <TableCell>{r.odontologos?.nombre}</TableCell>
                  <TableCell>{r.paciente}</TableCell>
                  <TableCell>{r.dni}</TableCell>
                  <TableCell>{r.nomencladores?.codigo ?? r.codigo_manual}</TableCell>
                  <TableCell className="text-xs">
                    {r.nomencladores?.descripcion ?? r.descripcion_manual}
                  </TableCell>
                  <TableCell className="text-right">{r.cantidad}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(Number(r.monto))}</TableCell>
                </TableRow>
              ))}
              {(rows ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Sin prestaciones de IOMA en este período.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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

function MiniStat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
    </div>
  );
}
