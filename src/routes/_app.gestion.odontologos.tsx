import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useUserContext } from "@/lib/gestion/use-auth";
import {
  listSucursales,
  listPisosAll,
  listOdontologos,
  createOdontologo,
  deleteOdontologo,
} from "@/lib/gestion/data.server";

export const Route = createFileRoute("/_app/gestion/odontologos")({
  component: OdontologosPage,
});

function OdontologosPage() {
  const qc = useQueryClient();
  const { isAdmin } = useUserContext();
  const [busqueda, setBusqueda] = useState("");
  const [sucursalFiltro, setSucursalFiltro] = useState("");

  const { data: odontologos = [], isLoading } = useQuery({
    queryKey: ["odontologos", "page"],
    queryFn: () => listOdontologos({ data: {} }),
  });
  const { data: sucursales = [] } = useQuery({ queryKey: ["sucursales"], queryFn: () => listSucursales() });
  const { data: pisos = [] } = useQuery({ queryKey: ["pisos", "admin"], queryFn: () => listPisosAll() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["odontologos"] });

  const [form, setForm] = useState({ nombre: "", numero_od: "", sucursal_id: "", piso_id: "" });
  const create = useMutation({
    mutationFn: () =>
      createOdontologo({
        data: {
          nombre: form.nombre.trim(),
          numeroOd: form.numero_od.trim() || null,
          sucursalId: form.sucursal_id,
          pisoId: form.piso_id || null,
        },
      }),
    onSuccess: () => {
      toast.success("Odontólogo creado");
      setForm({ nombre: "", numero_od: "", sucursal_id: "", piso_id: "" });
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteOdontologo({ data: { id } }),
    onSuccess: () => { toast.success("Eliminado"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const pisosFiltrados = pisos.filter((p: any) => p.sucursalId === form.sucursal_id);

  const filtered = useMemo(() => {
    return (odontologos as any[]).filter((o) => {
      if (sucursalFiltro && o.sucursalId !== sucursalFiltro) return false;
      if (!busqueda) return true;
      const b = busqueda.toLowerCase();
      return (
        o.nombre?.toLowerCase().includes(b) ||
        (o.numeroOd ?? "").toLowerCase().includes(b)
      );
    });
  }, [odontologos, busqueda, sucursalFiltro]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Odontólogos</h1>
        <p className="text-sm text-muted-foreground">Listado de todos los odontólogos de la clínica.</p>
      </div>

      {isAdmin && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="font-semibold text-sm">Nuevo odontólogo</div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
              <div>
                <Label>Sucursal</Label>
                <select
                  className="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
                  value={form.sucursal_id}
                  onChange={(e) => setForm({ ...form, sucursal_id: e.target.value, piso_id: "" })}
                >
                  <option value="">…</option>
                  {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <Label>Piso</Label>
                <select
                  className="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
                  value={form.piso_id}
                  disabled={!form.sucursal_id}
                  onChange={(e) => setForm({ ...form, piso_id: e.target.value })}
                >
                  <option value="">—</option>
                  {pisosFiltrados.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div><Label>Nombre</Label><Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
              <div><Label>Nº OD</Label><Input value={form.numero_od} onChange={(e) => setForm({ ...form, numero_od: e.target.value })} /></div>
              <Button onClick={() => form.nombre.trim() && form.sucursal_id && create.mutate()} disabled={!form.nombre.trim() || !form.sucursal_id}>
                <Plus className="h-4 w-4 mr-1" />Agregar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Nombre o Nº OD…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Sucursal</Label>
              <select className="h-10 w-full rounded-md border bg-transparent px-3 text-sm" value={sucursalFiltro} onChange={(e) => setSucursalFiltro(e.target.value)}>
                <option value="">Todas</option>
                {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Nº OD</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Piso</TableHead>
                <TableHead>Estado</TableHead>
                {isAdmin && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin odontólogos.</TableCell></TableRow>
              )}
              {filtered.map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.nombre}</TableCell>
                  <TableCell>{o.numeroOd ?? "—"}</TableCell>
                  <TableCell>{o.sucursalNombre ?? "—"}</TableCell>
                  <TableCell>{o.pisoNombre ?? "—"}</TableCell>
                  <TableCell>{o.activo ? "Activo" : "Inactivo"}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => confirm("¿Eliminar?") && del.mutate(o.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
