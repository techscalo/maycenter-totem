import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditLog, listAuditActores } from "@/lib/gestion/audit.server";
import { useUserContext } from "@/lib/gestion/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/gestion/registro")({
  component: RegistroPage,
});

const RESOURCES = [
  ["prestacion", "Prestaciones"],
  ["precio", "Precios"],
  ["usuario", "Usuarios"],
  ["odontologo", "Odontólogos"],
  ["obra_social", "Obras sociales"],
  ["sucursal", "Sucursales"],
  ["piso", "Pisos"],
  ["asistencia", "Asistencias"],
] as const;

const ACCION_META: Record<string, { label: string; icon: typeof Plus; cls: string }> = {
  create: { label: "Alta", icon: Plus, cls: "text-success" },
  update: { label: "Edición", icon: Pencil, cls: "text-muted-foreground" },
  delete: { label: "Baja", icon: Trash2, cls: "text-destructive" },
};

const TODOS = "__all__";

function RegistroPage() {
  const { can, isLoading } = useUserContext();
  const puedeVer = can("registro", "view");
  const [actor, setActor] = useState<string>(TODOS);
  const [resource, setResource] = useState<string>(TODOS);
  const [accion, setAccion] = useState<string>(TODOS);
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");
  const [limit, setLimit] = useState(100);

  const { data: actores = [] } = useQuery({
    queryKey: ["audit-actores"],
    queryFn: () => listAuditActores(),
  });

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["audit-log", actor, resource, accion, desde, hasta, limit],
    queryFn: () =>
      listAuditLog({
        data: {
          actorUserId: actor === TODOS ? undefined : actor,
          resource: resource === TODOS ? undefined : resource,
          action: accion === TODOS ? undefined : (accion as "create" | "update" | "delete"),
          desde: desde ? new Date(`${desde}T00:00:00-03:00`).toISOString() : undefined,
          hasta: hasta ? new Date(`${hasta}T23:59:59-03:00`).toISOString() : undefined,
          limit,
        },
      }),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (!puedeVer) return <Navigate to="/gestion" />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Registro de cambios</h1>
        <p className="text-sm text-muted-foreground">
          Quién creó, editó o borró cada dato del sistema.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Usuario</Label>
            <Select value={actor} onValueChange={setActor}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {actores.map((a) => (
                  <SelectItem key={a.user_id} value={a.user_id}>
                    {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sección</Label>
            <Select value={resource} onValueChange={setResource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {RESOURCES.map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Acción</Label>
            <Select value={accion} onValueChange={setAccion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                <SelectItem value="create">Altas</SelectItem>
                <SelectItem value="update">Ediciones</SelectItem>
                <SelectItem value="delete">Bajas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead className="w-28">Acción</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead>Sucursal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const meta = ACCION_META[r.action] ?? ACCION_META.update;
                const Icon = meta.icon;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="font-medium">{r.actor_nombre ?? "—"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs ${meta.cls}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{r.resumen ?? r.resource}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.sucursal_nombre ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {isFetching ? "Cargando…" : "Sin registros para los filtros elegidos."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {rows.length >= limit && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + 100)} disabled={isFetching}>
            Cargar más
          </Button>
        </div>
      )}
    </div>
  );
}
