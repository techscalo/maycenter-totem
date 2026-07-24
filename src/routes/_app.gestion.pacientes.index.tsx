import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPacientes } from "@/lib/gestion/data.server";
import { useSucursalActiva } from "@/lib/gestion/sucursal-activa";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/gestion/pacientes/")({
  component: PacientesList,
});

function PacientesList() {
  const { sucursalId, sucursalNombre } = useSucursalActiva();
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    enabled: !!sucursalId,
    queryKey: ["pacientes", q, sucursalId],
    queryFn: () => listPacientes({ data: { q: q.trim() || undefined, sucursalId } }),
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pacientes</h1>
        <p className="text-sm text-muted-foreground">
          Pacientes de <span className="font-medium text-foreground">{sucursalNombre}</span>. Se
          completa sola al cargar atenciones.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <Label className="text-xs">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Nombre o DNI…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>DNI</TableHead>
                <TableHead>Obra social</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Cargando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {q.trim() ? "Sin resultados." : "Sin pacientes cargados todavía."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell>{p.dni}</TableCell>
                  <TableCell>{p.obra_nombre ?? "—"}</TableCell>
                  <TableCell>{p.telefono ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      to="/gestion/pacientes/$dni"
                      params={{ dni: p.dni }}
                      className="inline-flex items-center text-sm text-primary hover:underline"
                    >
                      Ver ficha <ChevronRight className="h-4 w-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
