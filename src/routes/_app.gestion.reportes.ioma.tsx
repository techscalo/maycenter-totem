import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { listSucursales, listObrasSociales, listPrestaciones } from "@/lib/gestion/data.server";
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
import { FileSpreadsheet, FileText } from "lucide-react";
import { downloadExcel, downloadPdf } from "@/lib/gestion/exports";

export const Route = createFileRoute("/_app/gestion/reportes/ioma")({
  component: ReporteIomaPage,
});

function ReporteIomaPage() {
  const now = new Date();
  const [desde, setDesde] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [hasta, setHasta] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [sucursalId, setSucursalId] = useState<string>("all");

  const { data: sucursales } = useQuery({
    queryKey: ["sucursales"],
    queryFn: () => listSucursales(),
  });

  const { data: ioma } = useQuery({
    queryKey: ["obra-ioma"],
    queryFn: async () => {
      const obras = await listObrasSociales();
      return obras.find((o) => o.nombre.toLowerCase().includes("ioma")) ?? null;
    },
  });

  const { data: rows } = useQuery({
    enabled: !!ioma?.id,
    queryKey: ["reporte-ioma", desde, hasta, sucursalId, ioma?.id],
    queryFn: () =>
      listPrestaciones({
        data: {
          desde,
          hasta,
          obraSocialId: ioma!.id,
          ...(sucursalId !== "all" ? { sucursalId } : {}),
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

  const onExcel = () =>
    downloadExcel(`ioma-${desde}_${hasta}.xlsx`, "IOMA", exportRows);

  const onPdf = () => {
    downloadPdf(
      `ioma-${desde}_${hasta}.pdf`,
      `Reporte IOMA — ${format(new Date(desde + "T00:00"), "dd/MM/yyyy")} al ${format(new Date(hasta + "T00:00"), "dd/MM/yyyy")}`,
      `Maycenter`,
      ["Fecha", "Odontólogo", "Nº OD", "Paciente", "DNI", "Código", "Descripción", "Cant.", "Monto"],
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
        <p className="text-sm text-muted-foreground">Prestaciones de IOMA en el período. Exportable a Excel y PDF.</p>
      </div>

      {!ioma && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No hay una obra social llamada <span className="font-semibold">IOMA</span> cargada. Creala desde Administración → Obras sociales.
        </CardContent></Card>
      )}

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <Label>Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <Label>Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div>
            <Label>Sucursal</Label>
            <Select value={sucursalId} onValueChange={setSucursalId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(sucursales ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  <TableCell className="text-xs">{r.nomencladores?.descripcion ?? r.descripcion_manual}</TableCell>
                  <TableCell className="text-right">{r.cantidad}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(Number(r.monto))}</TableCell>
                </TableRow>
              ))}
              {(rows ?? []).length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin prestaciones de IOMA en este período.</TableCell></TableRow>
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