import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Plus, Search, Pencil, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { useUserContext } from "@/lib/gestion/use-auth";
import {
  listSucursales,
  listPisosAll,
  listOdontologos,
  createOdontologo,
  updateOdontologo,
  deleteOdontologo,
} from "@/lib/gestion/data.server";

export const Route = createFileRoute("/_app/gestion/odontologos")({
  component: OdontologosPage,
});

type SortKey = "nombre" | "numeroOd" | "sucursalNombre" | "pisoNombre" | "activo";
type SortDir = "asc" | "desc";

type Editing = {
  id: string;
  nombre: string;
  numero_od: string;
  sucursal_id: string;
  piso_id: string;
  activo: boolean;
};

const selCls = "h-10 w-full rounded-md border bg-transparent px-3 text-sm";

function OdontologosPage() {
  const qc = useQueryClient();
  const { isAdmin } = useUserContext();
  const [busqueda, setBusqueda] = useState("");
  const [sucursalFiltro, setSucursalFiltro] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nombre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editing, setEditing] = useState<Editing | null>(null);

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
  const update = useMutation({
    mutationFn: (e: Editing) =>
      updateOdontologo({
        data: {
          id: e.id,
          nombre: e.nombre.trim(),
          numeroOd: e.numero_od.trim() || null,
          sucursalId: e.sucursal_id,
          pisoId: e.piso_id || null,
          activo: e.activo,
        },
      }),
    onSuccess: () => { toast.success("Actualizado"); setEditing(null); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const pisosForm = pisos.filter((p: any) => p.sucursalId === form.sucursal_id);
  const pisosEdit = editing ? pisos.filter((p: any) => p.sucursalId === editing.sucursal_id) : [];

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const rows = useMemo(() => {
    let arr = (odontologos as any[]).filter((o) => {
      if (sucursalFiltro && o.sucursalId !== sucursalFiltro) return false;
      if (!busqueda) return true;
      const b = busqueda.toLowerCase();
      return o.nombre?.toLowerCase().includes(b) || (o.numeroOd ?? "").toLowerCase().includes(b);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    arr = [...arr].sort((a, b) => {
      let va: any = a[sortKey];
      let vb: any = b[sortKey];
      if (sortKey === "activo") { va = va ? 1 : 0; vb = vb ? 1 : 0; return (va - vb) * dir; }
      va = (va ?? "").toString().toLowerCase();
      vb = (vb ?? "").toString().toLowerCase();
      return va.localeCompare(vb, "es", { numeric: true }) * dir;
    });
    return arr;
  }, [odontologos, busqueda, sucursalFiltro, sortKey, sortDir]);

  const SortHeader = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => {
    const Icon = sortKey !== k ? ChevronsUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {label}
          <Icon className={`h-3.5 w-3.5 ${sortKey === k ? "text-foreground" : "text-muted-foreground/50"}`} />
        </button>
      </TableHead>
    );
  };

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
                  className={selCls}
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
                  className={selCls}
                  value={form.piso_id}
                  disabled={!form.sucursal_id}
                  onChange={(e) => setForm({ ...form, piso_id: e.target.value })}
                >
                  <option value="">—</option>
                  {pisosForm.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
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
              <select className={selCls} value={sucursalFiltro} onChange={(e) => setSucursalFiltro(e.target.value)}>
                <option value="">Todas</option>
                {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="Nombre" k="nombre" />
                <SortHeader label="Nº OD" k="numeroOd" />
                <SortHeader label="Sucursal" k="sucursalNombre" />
                <SortHeader label="Piso" k="pisoNombre" />
                <SortHeader label="Estado" k="activo" />
                {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin odontólogos.</TableCell></TableRow>
              )}
              {rows.map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.nombre}</TableCell>
                  <TableCell>{o.numeroOd ?? "—"}</TableCell>
                  <TableCell>{o.sucursalNombre ?? "—"}</TableCell>
                  <TableCell>{o.pisoNombre ?? "—"}</TableCell>
                  <TableCell>{o.activo ? "Activo" : "Inactivo"}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setEditing({
                              id: o.id,
                              nombre: o.nombre ?? "",
                              numero_od: o.numeroOd ?? "",
                              sucursal_id: o.sucursalId ?? "",
                              piso_id: o.pisoId ?? "",
                              activo: !!o.activo,
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => confirm("¿Eliminar?") && del.mutate(o.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar odontólogo</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nombre</Label>
                  <Input value={editing.nombre} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} />
                </div>
                <div>
                  <Label>Nº OD</Label>
                  <Input value={editing.numero_od} onChange={(e) => setEditing({ ...editing, numero_od: e.target.value })} />
                </div>
                <div>
                  <Label>Sucursal</Label>
                  <select
                    className={selCls}
                    value={editing.sucursal_id}
                    onChange={(e) => setEditing({ ...editing, sucursal_id: e.target.value, piso_id: "" })}
                  >
                    {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Piso</Label>
                  <select
                    className={selCls}
                    value={editing.piso_id}
                    onChange={(e) => setEditing({ ...editing, piso_id: e.target.value })}
                  >
                    <option value="">—</option>
                    {pisosEdit.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={editing.activo}
                  onChange={(e) => setEditing({ ...editing, activo: e.target.checked })}
                />
                Activo
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              onClick={() => editing && editing.nombre.trim() && editing.sucursal_id && update.mutate(editing)}
              disabled={update.isPending}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
