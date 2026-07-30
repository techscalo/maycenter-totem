import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { getPacienteByDni, getPacienteHistorial } from "@/lib/gestion/data.server";
import { montoLinea, esFacturable } from "@/lib/gestion/reportes";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Sparkles } from "lucide-react";

import { PermissionGate } from "@/components/gestion/PermissionGate";

export const Route = createFileRoute("/_app/gestion/pacientes/$dni")({
  component: () => (
    <PermissionGate resource="pacientes">
      <PacienteFicha />
    </PermissionGate>
  ),
});

function PacienteFicha() {
  const { dni } = Route.useParams();

  const { data: paciente } = useQuery({
    queryKey: ["paciente", dni],
    queryFn: () => getPacienteByDni({ data: { dni } }),
  });

  const { data: historial = [], isLoading } = useQuery({
    queryKey: ["paciente-historial", dni],
    queryFn: () => getPacienteHistorial({ data: { dni } }),
  });

  const fmt = (n: number) =>
    n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

  const resumen = useMemo(() => {
    const visitas = new Set(historial.map((h: any) => h.atencion_id)).size;
    const facturado = historial
      .filter(esFacturable)
      .reduce((s: number, h: any) => s + montoLinea(h), 0);
    const ultima = historial[0]?.fecha ?? null;
    return { visitas, facturado, ultima };
  }, [historial]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link
          to="/gestion/pacientes"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Pacientes
        </Link>
        <h1 className="text-2xl font-bold mt-2">{paciente?.nombre ?? "Paciente"}</h1>
        <p className="text-sm text-muted-foreground">DNI {dni}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Kpi label="Visitas" value={resumen.visitas} />
        <Kpi label="Facturado histórico" value={fmt(resumen.facturado)} />
        <Kpi
          label="Última visita"
          value={resumen.ultima ? format(new Date(resumen.ultima + "T00:00"), "dd/MM/yyyy") : "—"}
        />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="px-4 py-3 border-b bg-muted/40 font-semibold">
            Historial de atenciones
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Obra social</TableHead>
                <TableHead>Odontólogo</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Prestación</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Precio unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Cargando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && historial.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Sin atenciones registradas.
                  </TableCell>
                </TableRow>
              )}
              {historial.map((h: any) => (
                <TableRow key={h.id} className={h.facturable === false ? "opacity-60" : ""}>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(h.fecha + "T00:00"), "dd/MM/yyyy")}
                    {h.primera_vez && <Sparkles className="inline h-3 w-3 ml-1 text-primary" />}
                  </TableCell>
                  <TableCell>{h.sucursal_nombre}</TableCell>
                  <TableCell>{h.obra_nombre}</TableCell>
                  <TableCell>{h.odo_nombre}</TableCell>
                  <TableCell>{h.codigo}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{h.descripcion}</TableCell>
                  <TableCell className="text-right">{h.cantidad}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fmt(Number(h.monto))}
                  </TableCell>
                  <TableCell className="text-right font-medium">{fmt(montoLinea(h))}</TableCell>
                </TableRow>
              ))}
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
