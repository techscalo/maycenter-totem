import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Plus, Search, Pencil, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { useUserContext } from "@/lib/gestion/use-auth";
import {
  listObrasSociales,
  listNomencladoresAdmin,
  createNomenclador,
  updateNomenclador,
  deleteNomenclador,
} from "@/lib/gestion/data.server";

export const Route = createFileRoute("/_app/gestion/precios")({
  component: PreciosPage,
});

type SortKey = "plan" | "codigo" | "descripcion" | "monto";
type SortDir = "asc" | "desc";

type Editing = {
  id: string;
  plan: string;
  codigo: string;
  descripcion: string;
  monto: string;
  montoPaciente: string;
  activo: boolean;
};

const ars = (v: any) => (v == null ? "—" : "$ " + Number(v).toLocaleString("es-AR"));

function PreciosPage() {
  const qc = useQueryClient();
  const { isAdmin } = useUserContext();
  const [obraId, setObraId] = useState("");
  const [planFiltro, setPlanFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("codigo");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editing, setEditing] = useState<Editing | null>(null);

  const { data: obras = [] } = useQuery({
    queryKey: ["obras_sociales", "precios"],
    queryFn: () => listObrasSociales(),
  });
  const { data: nomencladores = [], isLoading } = useQuery({
    queryKey: ["nomencladores_admin", obraId],
    enabled: !!obraId,
    queryFn: () => listNomencladoresAdmin({ data: { obraSocialId: obraId } }),
  });

  const planes = useMemo(
    () => [...new Set((nomencladores as any[]).map((n) => n.plan).filter(Boolean))],
    [nomencladores],
  );
  const dual = useMemo(
    () => (nomencladores as any[]).some((n) => n.montoPaciente != null),
    [nomencladores],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["nomencladores_admin", obraId] });

  const [form, setForm] = useState({ plan: "", codigo: "", descripcion: "", monto: "", montoPaciente: "" });
  const create = useMutation({
    mutationFn: () =>
      createNomenclador({
        data: {
          obraSocialId: obraId,
          plan: form.plan.trim() || null,
          codigo: form.codigo.trim(),
          descripcion: form.descripcion.trim(),
          monto: Number(form.monto) || 0,
          montoPaciente: form.montoPaciente === "" ? null : Number(form.montoPaciente),
        },
      }),
    onSuccess: () => {
      toast.success("Prestación agregada");
      setForm({ plan: "", codigo: "", descripcion: "", monto: "", montoPaciente: "" });
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteNomenclador({ data: { id } }),
    onSuccess: () => { toast.success("Eliminada"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const update = useMutation({
    mutationFn: (e: Editing) =>
      updateNomenclador({
        data: {
          id: e.id,
          plan: e.plan.trim() || null,
          codigo: e.codigo.trim(),
          descripcion: e.descripcion.trim(),
          monto: Number(e.monto) || 0,
          montoPaciente: e.montoPaciente === "" ? null : Number(e.montoPaciente),
          activo: e.activo,
        },
      }),
    onSuccess: () => { toast.success("Actualizada"); setEditing(null); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const rows = useMemo(() => {
    let arr = (nomencladores as any[]).filter((n) => {
      if (planFiltro && n.plan !== planFiltro) return false;
      if (!busqueda) return true;
      const b = busqueda.toLowerCase();
      return n.codigo?.toLowerCase().includes(b) || n.descripcion?.toLowerCase().includes(b);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    arr = [...arr].sort((a, b) => {
      if (sortKey === "monto") return (Number(a.monto) - Number(b.monto)) * dir;
      const va = (a[sortKey] ?? "").toString().toLowerCase();
      const vb = (b[sortKey] ?? "").toString().toLowerCase();
      return va.localeCompare(vb, "es", { numeric: true }) * dir;
    });
    return arr;
  }, [nomencladores, planFiltro, busqueda, sortKey, sortDir]);

  const SortHeader = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => {
    const Icon = sortKey !== k ? ChevronsUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className}>
        <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
          {label}
          <Icon className={`h-3.5 w-3.5 ${sortKey === k ? "text-foreground" : "text-muted-foreground/50"}`} />
        </button>
      </TableHead>
    );
  };

  const colCount = 3 + (planes.length ? 1 : 0) + (dual ? 1 : 0) + (isAdmin ? 1 : 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Precios por obra social</h1>
        <p className="text-sm text-muted-foreground">
          Revisá y editá los aranceles de cada obra social (y plan). Los precios se usan en Nueva prestación.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Obra social</Label>
              <Combobox
                options={(obras as any[]).map((o) => ({
                  value: o.id,
                  label: `${o.nombre}${o.esParticular ? " (particular USD)" : ""}`,
                }))}
                value={obraId}
                onChange={(v) => { setObraId(v); setPlanFiltro(""); }}
                searchPlaceholder="Buscar obra social…"
              />
            </div>
            {planes.length > 0 && (
              <div>
                <Label className="text-xs">Plan</Label>
                <Combobox
                  options={[{ value: "", label: "Todos los planes" }, ...planes.map((p) => ({ value: p, label: p }))]}
                  value={planFiltro}
                  onChange={setPlanFiltro}
                  placeholder="Todos los planes"
                />
              </div>
            )}
            <div className={planes.length > 0 ? "" : "md:col-span-2"}>
              <Label className="text-xs">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Código o descripción…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} disabled={!obraId} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && obraId && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="font-semibold text-sm">Nueva prestación</div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
              <div><Label>Plan</Label><Input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} placeholder="opcional" /></div>
              <div><Label>Código</Label><Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Descripción</Label><Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
              <div><Label>Monto ARS</Label><Input type="number" min={0} value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} /></div>
              <Button onClick={() => form.codigo.trim() && form.descripcion.trim() && create.mutate()} disabled={!form.codigo.trim() || !form.descripcion.trim() || create.isPending}>
                <Plus className="h-4 w-4 mr-1" />Agregar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          {!obraId ? (
            <p className="text-center py-10 text-muted-foreground">Elegí una obra social para ver sus precios.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {planes.length > 0 && <SortHeader label="Plan" k="plan" />}
                  <SortHeader label="Código" k="codigo" />
                  <SortHeader label="Prestación" k="descripcion" />
                  <SortHeader label="Monto" k="monto" className="text-right" />
                  {dual && <TableHead className="text-right">Paciente</TableHead>}
                  {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={colCount} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>}
                {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={colCount} className="text-center py-8 text-muted-foreground">Sin prestaciones.</TableCell></TableRow>}
                {rows.map((n: any) => (
                  <TableRow key={n.id} className={n.activo ? "" : "opacity-50"}>
                    {planes.length > 0 && <TableCell>{n.plan ?? "—"}</TableCell>}
                    <TableCell className="font-mono text-xs whitespace-nowrap">{n.codigo}</TableCell>
                    <TableCell>{n.descripcion}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{ars(n.monto)}</TableCell>
                    {dual && <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground">{ars(n.montoPaciente)}</TableCell>}
                    {isAdmin && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditing({
                            id: n.id, plan: n.plan ?? "", codigo: n.codigo ?? "", descripcion: n.descripcion ?? "",
                            monto: String(n.monto ?? ""), montoPaciente: n.montoPaciente == null ? "" : String(n.montoPaciente), activo: !!n.activo,
                          })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => confirm("¿Eliminar prestación?") && del.mutate(n.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar prestación</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Plan</Label><Input value={editing.plan} onChange={(e) => setEditing({ ...editing, plan: e.target.value })} placeholder="opcional" /></div>
                <div><Label>Código</Label><Input value={editing.codigo} onChange={(e) => setEditing({ ...editing, codigo: e.target.value })} /></div>
                <div className="col-span-2"><Label>Descripción</Label><Input value={editing.descripcion} onChange={(e) => setEditing({ ...editing, descripcion: e.target.value })} /></div>
                <div><Label>Monto ARS</Label><Input type="number" min={0} value={editing.monto} onChange={(e) => setEditing({ ...editing, monto: e.target.value })} /></div>
                <div><Label>Copago paciente</Label><Input type="number" min={0} value={editing.montoPaciente} onChange={(e) => setEditing({ ...editing, montoPaciente: e.target.value })} placeholder="opcional" /></div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" className="h-4 w-4" checked={editing.activo} onChange={(e) => setEditing({ ...editing, activo: e.target.checked })} />
                Activa
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => editing && editing.codigo.trim() && editing.descripcion.trim() && update.mutate(editing)} disabled={update.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
