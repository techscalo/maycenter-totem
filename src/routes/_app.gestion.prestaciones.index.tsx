import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listObrasSociales,
  listOdontologos,
  listPisos,
  listPrestaciones,
  deleteAtencionItem,
  deleteAtencionItems,
  updateAtencionItem,
  updateAtencionCabecera,
} from "@/lib/gestion/data.server";
import { useSucursalActiva } from "@/lib/gestion/sucursal-activa";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { montoLinea, montoUsdLinea } from "@/lib/gestion/reportes";

import { PermissionGate } from "@/components/gestion/PermissionGate";

export const Route = createFileRoute("/_app/gestion/prestaciones/")({
  component: () => (
    <PermissionGate resource="prestaciones">
      <PrestacionesList />
    </PermissionGate>
  ),
});

type Prestacion = {
  id: string;
  atencion_id: string;
  fecha: string;
  paciente: string;
  dni: string;
  piso_id: string | null;
  primera_vez: boolean;
  cantidad: number;
  monto: number;
  monto_paciente: number | null;
  monto_usd: number | null;
  observaciones: string | null;
  codigo_manual: string | null;
  descripcion_manual: string | null;
  sucursales: { nombre: string } | null;
  obras_sociales: { nombre: string } | null;
  pisos: { nombre: string } | null;
  odontologos: { nombre: string; numero_od?: string | null } | null;
  nomencladores: { codigo: string; descripcion: string | null } | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function dateNDaysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function PrestacionesList() {
  const qc = useQueryClient();
  const { sucursalId } = useSucursalActiva();
  const [desde, setDesde] = useState(todayISO());
  const [hasta, setHasta] = useState(todayISO());
  const [obraSocialId, setObraSocialId] = useState<string>("");
  const [odontologoId, setOdontologoId] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [editing, setEditing] = useState<Prestacion | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: obras = [] } = useQuery({
    queryKey: ["obras_sociales"],
    queryFn: () => listObrasSociales(),
  });
  const { data: odontologos = [] } = useQuery({
    enabled: !!sucursalId,
    queryKey: ["odontologos", sucursalId],
    queryFn: () => listOdontologos({ data: { sucursalId } }),
  });
  const { data: pisos = [] } = useQuery({
    enabled: !!sucursalId,
    queryKey: ["pisos", sucursalId],
    queryFn: () => listPisos({ data: { sucursalId } }),
  });

  const { data: rows = [], isLoading } = useQuery({
    enabled: !!sucursalId,
    queryKey: ["prestaciones", desde, hasta, sucursalId, obraSocialId, odontologoId],
    queryFn: () =>
      listPrestaciones({
        data: {
          desde,
          hasta,
          sucursalId,
          ...(obraSocialId ? { obraSocialId } : {}),
          ...(odontologoId ? { odontologoId } : {}),
        },
      }) as Promise<Prestacion[]>,
  });

  const filtered = useMemo(() => {
    if (!busqueda) return rows;
    const b = busqueda.toLowerCase();
    return rows.filter(
      (r) =>
        r.paciente?.toLowerCase().includes(b) ||
        r.dni?.toLowerCase().includes(b) ||
        r.codigo_manual?.toLowerCase().includes(b) ||
        r.nomencladores?.codigo?.toLowerCase().includes(b),
    );
  }, [rows, busqueda]);

  const totals = useMemo(() => {
    return {
      count: filtered.length,
      ars: filtered.reduce((s, r) => s + montoLinea(r), 0),
      usd: filtered.reduce((s, r) => s + montoUsdLinea(r), 0),
    };
  }, [filtered]);

  const delMut = useMutation({
    mutationFn: (itemId: string) => deleteAtencionItem({ data: { itemId } }),
    onSuccess: () => {
      toast.success("Prestación eliminada");
      qc.invalidateQueries({ queryKey: ["prestaciones"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const bulkDelMut = useMutation({
    mutationFn: (itemIds: string[]) => deleteAtencionItems({ data: { itemIds } }),
    onSuccess: (r: { count: number }) => {
      toast.success(`${r.count} prestaciones eliminadas`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["prestaciones"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });

  const updateMut = useMutation({
    mutationFn: async (p: Prestacion) => {
      await updateAtencionItem({
        data: {
          itemId: p.id,
          cantidad: p.cantidad,
          monto: p.monto,
          montoPaciente: p.monto_paciente,
          montoUsd: p.monto_usd,
        },
      });
      await updateAtencionCabecera({
        data: {
          atencionId: p.atencion_id,
          fecha: p.fecha,
          paciente: p.paciente,
          dni: p.dni,
          pisoId: p.piso_id,
          primeraVez: p.primera_vez,
          observaciones: p.observaciones,
        },
      });
    },
    onSuccess: () => {
      toast.success("Actualizado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["prestaciones"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const fmtArs = (n: number) =>
    n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

  const setRange = (days: number) => {
    setDesde(dateNDaysAgoISO(days - 1));
    setHasta(todayISO());
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Prestaciones</h1>
          <p className="text-sm text-muted-foreground">Buscar, editar y eliminar registros.</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button
              variant="destructive"
              disabled={bulkDelMut.isPending}
              onClick={() => {
                if (confirm(`¿Eliminar ${selected.size} prestaciones seleccionadas?`))
                  bulkDelMut.mutate([...selected]);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar seleccionadas ({selected.size})
            </Button>
          )}
          <Button asChild>
            <Link to="/gestion/prestaciones/nueva">
              <Plus className="h-4 w-4 mr-2" />
              Nueva prestación
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setRange(1)}>
              Hoy
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRange(7)}>
              Últimos 7
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRange(30)}>
              Últimos 30
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDesde("2000-01-01");
                setHasta(todayISO());
              }}
            >
              Históricos
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Obra social</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={obraSocialId}
                onChange={(e) => setObraSocialId(e.target.value)}
              >
                <option value="">Todas</option>
                {obras.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Odontólogo</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={odontologoId}
                onChange={(e) => setOdontologoId(e.target.value)}
              >
                <option value="">Todos</option>
                {odontologos.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Paciente, DNI, código…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-2 border-t text-sm">
            <div>
              <span className="text-muted-foreground">Resultados:</span> <b>{totals.count}</b>
            </div>
            <div>
              <span className="text-muted-foreground">Facturado ARS:</span>{" "}
              <b>{fmtArs(totals.ars)}</b>
            </div>
            <div>
              <span className="text-muted-foreground">USD:</span>{" "}
              <b>U$D {totals.usd.toLocaleString("es-AR")}</b>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    className="h-4 w-4 align-middle"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Seleccionar todo"
                  />
                </TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>DNI</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Obra social</TableHead>
                <TableHead>Piso</TableHead>
                <TableHead>Odontólogo</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Prestación</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                    Cargando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                    Sin resultados.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      className="h-4 w-4 align-middle"
                      checked={selected.has(r.id)}
                      onChange={() => toggleSel(r.id)}
                      aria-label="Seleccionar fila"
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.fecha}</TableCell>
                  <TableCell className="font-medium">{r.paciente}</TableCell>
                  <TableCell>{r.dni}</TableCell>
                  <TableCell>{r.sucursales?.nombre}</TableCell>
                  <TableCell>{r.obras_sociales?.nombre}</TableCell>
                  <TableCell>{r.pisos?.nombre}</TableCell>
                  <TableCell>{r.odontologos?.nombre}</TableCell>
                  <TableCell>{r.nomencladores?.codigo || r.codigo_manual}</TableCell>
                  <TableCell className="max-w-[260px] truncate">
                    {r.nomencladores?.descripcion || r.descripcion_manual}
                  </TableCell>
                  <TableCell className="text-right">{r.cantidad}</TableCell>
                  <TableCell className="text-right">{fmtArs(Number(r.monto || 0))}</TableCell>
                  <TableCell className="text-right">
                    {r.monto_usd ? `U$D ${r.monto_usd}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("¿Eliminar esta prestación?")) delMut.mutate(r.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar prestación</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    value={editing.fecha}
                    onChange={(e) => setEditing({ ...editing, fecha: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Piso</Label>
                  <Combobox
                    options={pisos.map((p: any) => ({ value: p.id, label: p.nombre }))}
                    value={editing.piso_id ?? ""}
                    onChange={(v) => setEditing({ ...editing, piso_id: v || null })}
                    placeholder="Elegir…"
                  />
                </div>
                <div>
                  <Label>Paciente</Label>
                  <Input
                    value={editing.paciente}
                    onChange={(e) => setEditing({ ...editing, paciente: e.target.value })}
                  />
                </div>
                <div>
                  <Label>DNI</Label>
                  <Input
                    value={editing.dni}
                    onChange={(e) => setEditing({ ...editing, dni: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Cantidad</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editing.cantidad}
                    onChange={(e) => setEditing({ ...editing, cantidad: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Monto ARS</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editing.monto}
                    onChange={(e) => setEditing({ ...editing, monto: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Copago</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="A cargo del paciente"
                    value={editing.monto_paciente ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        monto_paciente: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Monto USD</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editing.monto_usd ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        monto_usd: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Observaciones</Label>
                <Input
                  value={editing.observaciones ?? ""}
                  onChange={(e) => setEditing({ ...editing, observaciones: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={editing.primera_vez}
                  onChange={(e) => setEditing({ ...editing, primera_vez: e.target.checked })}
                />
                <span className="text-sm">Primera vez (paciente nuevo)</span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => editing && updateMut.mutate(editing)}
              disabled={updateMut.isPending}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
