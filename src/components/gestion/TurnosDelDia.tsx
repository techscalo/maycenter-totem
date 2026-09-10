import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getTurnosDelDia,
  marcarEstadoTurno,
  marcarEstadoTurnoManual,
  crearTurnoManual,
  eliminarTurnoManual,
  actualizarFichaContacto,
  actualizarFichaManual,
  setOdontologoACargoTurno,
  setOdontologoACargoManual,
  actualizarTurnoGhl,
  actualizarTurnoManual,
  cancelarTurnoGhl,
  cancelarTurnoManual,
} from "@/lib/gestion/ghl.server";
import {
  listOdontologos,
  listObrasSociales,
  listPisos,
  getPacienteByDni,
} from "@/lib/gestion/data.server";
import { isValidDni, DNI_ERROR } from "@/lib/dni";
import { useSucursalActiva } from "@/lib/gestion/sucursal-activa";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RefreshCw,
  CalendarClock,
  Search,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Columns3,
  Plus,
  Trash2,
  MoreHorizontal,
  Eye,
  Pencil,
  Ban,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type SortKey =
  | "startTime"
  | "llegadaHora"
  | "paciente"
  | "obraSocial"
  | "dni"
  | "profesional"
  | "agendadoPor"
  | "estado";

// Estados de flujo del turno + estilos.
const ESTADOS = [
  { value: "en_recepcion", label: "En recepción", dot: "bg-yellow-400", row: "bg-yellow-50 dark:bg-yellow-950/20" },
  { value: "en_consultorio", label: "En sala", dot: "bg-sky-400", row: "bg-sky-50 dark:bg-sky-950/20" },
  { value: "finalizado", label: "Finalizado", dot: "bg-green-500", row: "bg-green-50 dark:bg-green-950/20" },
  { value: "se_retiro", label: "Se retiró", dot: "bg-orange-400", row: "bg-orange-50 dark:bg-orange-950/20" },
  { value: "ausente", label: "Ausente", dot: "bg-gray-400", row: "opacity-60" },
  { value: "cancelado", label: "Cancelado", dot: "bg-red-500", row: "bg-red-50 dark:bg-red-950/20 opacity-70" },
] as const;
const ESTADO_MAP = Object.fromEntries(ESTADOS.map((e) => [e.value, e]));

// Columnas: orden de render + label + si arranca oculta.
const COLS = [
  { key: "hora", label: "Hora turno" },
  { key: "llegada", label: "Hora llegada" },
  { key: "sala", label: "Hora ingreso a sala" },
  { key: "finalizado", label: "Hora finalización" },
  { key: "retiro", label: "Hora retiro", hiddenByDefault: true },
  { key: "paciente", label: "Paciente" },
  { key: "obraSocial", label: "Obra social" },
  { key: "telefono", label: "Teléfono" },
  { key: "agenda", label: "Agenda" },
  { key: "piso", label: "Piso" },
  { key: "odontologoACargo", label: "Odontólogo a cargo" },
  { key: "dni", label: "DNI", hiddenByDefault: true },
  { key: "agendadoPor", label: "Agendado por", hiddenByDefault: true },
  { key: "descripcion", label: "Descripción", hiddenByDefault: true },
  { key: "observaciones", label: "Observaciones", hiddenByDefault: true },
  { key: "tieneFicha", label: "Ficha" },
  { key: "estado", label: "Estado" },
  { key: "ficha", label: "Ficha GHL" },
  { key: "pacienteContacto", label: "Paciente que reservó" },
] as const;
const COLS_STORAGE = "turnos_cols_v1";

function defaultCols(): Record<string, boolean> {
  return Object.fromEntries(COLS.map((c) => [c.key, !("hiddenByDefault" in c && c.hiddenByDefault)]));
}

export function TurnosDelDia() {
  const qc = useQueryClient();
  const { sucursalId, sucursalNombre } = useSucursalActiva();
  const [fecha, setFecha] = useState(format(new Date(), "yyyy-MM-dd"));
  const [q, setQ] = useState("");
  const [agendaFiltro, setAgendaFiltro] = useState<string>("all");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("all");
  const [pisoFiltro, setPisoFiltro] = useState<string>("all");
  const [modal, setModal] = useState<{ row: any; modo: "ver" | "editar" } | null>(null);
  const [cancelarRow, setCancelarRow] = useState<any | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "startTime",
    dir: "asc",
  });
  const [cols, setCols] = useState<Record<string, boolean>>(defaultCols);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLS_STORAGE);
      if (saved) setCols({ ...defaultCols(), ...JSON.parse(saved) });
    } catch {
      /* noop */
    }
  }, []);
  const toggleCol = (key: string) =>
    setCols((c) => {
      const next = { ...c, [key]: !c[key] };
      localStorage.setItem(COLS_STORAGE, JSON.stringify(next));
      return next;
    });
  const show = (key: string) => cols[key] !== false;

  const queryKey = ["turnos-dia", sucursalId, fecha];
  const { data, isLoading, isFetching, refetch } = useQuery({
    enabled: !!sucursalId,
    queryKey,
    queryFn: () => getTurnosDelDia({ data: { sucursalId, fecha } }),
  });

  // Odontólogos de la sucursal, para el selector "Odontólogo a cargo".
  const { data: odontologos } = useQuery({
    enabled: !!sucursalId,
    queryKey: ["odontologos-sucursal", sucursalId],
    queryFn: () => listOdontologos({ data: { sucursalId, soloActivos: true } as any }),
  });
  // Pisos de la sucursal, para el filtro.
  const { data: pisos } = useQuery({
    enabled: !!sucursalId,
    queryKey: ["pisos-sucursal", sucursalId],
    queryFn: () => listPisos({ data: { sucursalId } as any }),
  });
  const odontById = useMemo(
    () => new Map((odontologos ?? []).map((o: any) => [o.id, o])),
    [odontologos],
  );
  const pisoNombre = useMemo(
    () => new Map((pisos ?? []).map((p: any) => [p.id, p.nombre])),
    [pisos],
  );

  const cambiarEstado = useMutation({
    mutationFn: (v: { row: any; estado: string }) =>
      v.row.tipo === "manual"
        ? marcarEstadoTurnoManual({ data: { id: v.row.id, estado: v.estado } as any })
        : marcarEstadoTurno({
            data: {
              eventId: v.row.eventId,
              contactId: v.row.contactId,
              sucursalId,
              fecha,
              estado: v.estado,
            } as any,
          }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<any>(queryKey);
      qc.setQueryData<any>(queryKey, (old: any) =>
        old
          ? {
              ...old,
              turnos: old.turnos.map((t: any) =>
                t.rowId === v.row.rowId ? { ...t, estado: v.estado } : t,
              ),
            }
          : old,
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error((e as Error).message || "No se pudo actualizar el turno");
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const cancelar = useMutation({
    mutationFn: (v: { row: any; motivo: string }) =>
      v.row.tipo === "manual"
        ? cancelarTurnoManual({ data: { id: v.row.id, motivo: v.motivo || undefined } as any })
        : cancelarTurnoGhl({
            data: {
              eventId: v.row.eventId,
              contactId: v.row.contactId,
              sucursalId,
              fecha,
              motivo: v.motivo || undefined,
            } as any,
          }),
    onSuccess: () => {
      toast.success("Turno cancelado");
      setCancelarRow(null);
      setCancelMotivo("");
    },
    onError: (e) => toast.error((e as Error).message || "No se pudo cancelar el turno"),
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const eliminar = useMutation({
    mutationFn: (id: string) => eliminarTurnoManual({ data: { id } }),
    onSuccess: () => {
      toast.success("Turno eliminado");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e) => toast.error((e as Error).message || "No se pudo eliminar"),
  });

  const cambiarFicha = useMutation({
    mutationFn: (v: { row: any; valor: string }) =>
      v.row.tipo === "manual"
        ? actualizarFichaManual({ data: { id: v.row.id, valor: v.valor } as any })
        : actualizarFichaContacto({
            data: { sucursalId, contactId: v.row.contactId, valor: v.valor } as any,
          }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<any>(queryKey);
      qc.setQueryData<any>(queryKey, (old: any) =>
        old
          ? {
              ...old,
              turnos: old.turnos.map((t: any) =>
                t.rowId === v.row.rowId ? { ...t, ficha: v.valor } : t,
              ),
            }
          : old,
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error((e as Error).message || "No se pudo actualizar la ficha");
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const cambiarACargo = useMutation({
    mutationFn: (v: { row: any; odontologoACargoId: string | null }) =>
      v.row.tipo === "manual"
        ? setOdontologoACargoManual({
            data: { id: v.row.id, odontologoACargoId: v.odontologoACargoId } as any,
          })
        : setOdontologoACargoTurno({
            data: {
              eventId: v.row.eventId,
              sucursalId,
              fecha,
              odontologoACargoId: v.odontologoACargoId,
            } as any,
          }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<any>(queryKey);
      const nombre =
        (odontologos ?? []).find((o: any) => o.id === v.odontologoACargoId)?.nombre ?? null;
      qc.setQueryData<any>(queryKey, (old: any) =>
        old
          ? {
              ...old,
              turnos: old.turnos.map((t: any) =>
                t.rowId === v.row.rowId
                  ? { ...t, odontologoACargoId: v.odontologoACargoId, odontologoACargo: nombre }
                  : t,
              ),
            }
          : old,
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error((e as Error).message || "No se pudo cambiar el odontólogo a cargo");
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  // El "profesional" de un turno de GHL es el nombre del calendario (p. ej.
  // "Agenda Camilo Yepez - Blanqueamiento y carillas"); derivamos el odontólogo real
  // buscando cuál de los cargados aparece en ese nombre. En los manuales ya es el nombre.
  const odontologoDeAgenda = (profesional: string | null | undefined) => {
    if (!profesional || profesional === "—") return null;
    const p = profesional.toLowerCase();
    const match = (odontologos ?? [])
      .filter((o: any) => o.nombre && p.includes(o.nombre.toLowerCase()))
      .sort((a: any, b: any) => b.nombre.length - a.nombre.length)[0];
    return match?.nombre ?? profesional;
  };

  // Piso del turno, por prioridad: override manual → piso del odontólogo a cargo → piso del
  // odontólogo de la agenda.
  const pisoDeTurno = (t: any): string | null => {
    if (t.pisoId) return t.pisoId;
    if (t.odontologoACargoId) return odontById.get(t.odontologoACargoId)?.pisoId ?? null;
    const nom = odontologoDeAgenda(t.profesional);
    if (!nom) return null;
    return (odontologos ?? []).find((o: any) => o.nombre === nom)?.pisoId ?? null;
  };

  const soportado = data?.soportado ?? true;
  const turnos = (data?.turnos ?? []) as any[];

  // Agendas presentes ese día (para el filtro).
  const agendas = useMemo(
    () => [...new Set(turnos.map((t) => t.profesional).filter(Boolean))].sort(),
    [turnos],
  );

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const rows = useMemo(() => {
    let list = turnos;
    const term = q.trim().toLowerCase();
    if (term)
      list = list.filter((t) =>
        `${t.paciente} ${t.pacienteContacto ?? ""} ${t.dni ?? ""} ${t.profesional} ${t.obraSocial ?? ""} ${t.telefono ?? ""}`
          .toLowerCase()
          .includes(term),
      );
    if (agendaFiltro !== "all") list = list.filter((t) => t.profesional === agendaFiltro);
    if (pisoFiltro !== "all") list = list.filter((t) => pisoDeTurno(t) === pisoFiltro);
    if (estadoFiltro !== "all")
      list = list.filter((t) =>
        estadoFiltro === "sin_marcar" ? !t.estado : t.estado === estadoFiltro,
      );
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (t: any) => (sort.key === "profesional" ? t.profesional : t[sort.key]);
    return [...list].sort(
      (a, b) => String(val(a) ?? "").localeCompare(String(val(b) ?? ""), "es") * dir,
    );
  }, [turnos, q, agendaFiltro, pisoFiltro, estadoFiltro, sort, odontologos]);

  const SortHead = ({ k, children, className }: { k: SortKey; children: any; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {children}
        {sort.key === k ? (
          sort.dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );

  const colCount = COLS.filter((c) => show(c.key)).length + 1;

  // Scroll horizontal por botones y columnas con ancho ajustable (arrastrando el borde).
  const scrollRef = useRef<HTMLDivElement>(null);
  const nudge = (dir: number) => scrollRef.current?.scrollBy({ left: dir * 400, behavior: "smooth" });
  const visibleSig = COLS.filter((c) => show(c.key))
    .map((c) => c.key)
    .join(",");
  useEffect(() => {
    const table = scrollRef.current?.querySelector("table");
    if (!table) return;
    const cols = Array.from(table.querySelectorAll("colgroup > col")) as HTMLTableColElement[];
    const ths = Array.from(table.querySelectorAll("thead th")) as HTMLElement[];
    const cleanups: Array<() => void> = [];
    ths.forEach((th, i) => {
      if (i >= cols.length - 1) return; // la última columna es la de acciones
      const handle = document.createElement("div");
      handle.style.cssText =
        "position:absolute;top:0;right:0;height:100%;width:6px;cursor:col-resize;user-select:none;touch-action:none;";
      th.style.position = "relative";
      let startX = 0;
      let startW = 0;
      const onMove = (e: MouseEvent) => {
        cols[i].style.width = `${Math.max(48, startW + (e.clientX - startX))}px`;
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
      };
      const onDown = (e: MouseEvent) => {
        e.preventDefault();
        // Sembrar los anchos actuales y fijar el layout para poder agrandar y achicar.
        cols.forEach((c, j) => {
          if (!c.style.width && ths[j]) c.style.width = `${ths[j].offsetWidth}px`;
        });
        table.style.tableLayout = "fixed";
        startX = e.clientX;
        startW = cols[i].offsetWidth;
        document.body.style.cursor = "col-resize";
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      };
      handle.addEventListener("mousedown", onDown);
      th.appendChild(handle);
      cleanups.push(() => {
        handle.removeEventListener("mousedown", onDown);
        handle.remove();
      });
    });
    return () => cleanups.forEach((fn) => fn());
  }, [visibleSig, data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Fecha</Label>
            <Input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Paciente, DNI, teléfono, obra social o agenda…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Agenda</Label>
            <Select value={agendaFiltro} onValueChange={setAgendaFiltro}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las agendas</SelectItem>
                {agendas.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Piso</Label>
            <Select value={pisoFiltro} onValueChange={setPisoFiltro}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los pisos</SelectItem>
                {(pisos ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="sin_marcar">Sin marcar</SelectItem>
                {ESTADOS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Columns3 className="mr-2 h-4 w-4" /> Columnas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Columnas visibles</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={show(c.key)}
                  onCheckedChange={() => toggleCol(c.key)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Actualizar
          </Button>
          <NuevoTurnoDialog
            sucursalId={sucursalId}
            fecha={fecha}
            onCreated={() => qc.invalidateQueries({ queryKey })}
          />
          <div className="ml-auto text-sm text-muted-foreground inline-flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            {sucursalNombre} · {rows.length} turnos
          </div>
        </CardContent>
      </Card>

      {!soportado && turnos.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Los turnos de GHL no están configurados para esta sucursal. Podés cargar turnos
            manualmente con "Agregar turno".
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center gap-1 border-b px-2 py-1">
              <span className="mr-auto text-xs text-muted-foreground">
                Arrastrá el borde de una columna para ajustar su ancho
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => nudge(-1)}
                title="Desplazar a la izquierda"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => nudge(1)}
                title="Desplazar a la derecha"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div ref={scrollRef} className="overflow-x-auto">
            <Table>
              <colgroup>
                {COLS.filter((c) => show(c.key)).map((c) => (
                  <col key={c.key} />
                ))}
                <col style={{ width: "40px" }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  {show("hora") && (
                    <SortHead k="startTime" className="w-16">
                      Hora
                    </SortHead>
                  )}
                  {show("llegada") && (
                    <SortHead k="llegadaHora" className="w-20">
                      Llegada
                    </SortHead>
                  )}
                  {show("sala") && <TableHead className="w-24">Ingreso a sala</TableHead>}
                  {show("finalizado") && <TableHead className="w-24">Finalización</TableHead>}
                  {show("retiro") && <TableHead className="w-24">Retiro</TableHead>}
                  {show("paciente") && <SortHead k="paciente">Paciente</SortHead>}
                  {show("obraSocial") && <SortHead k="obraSocial">Obra social</SortHead>}
                  {show("telefono") && <TableHead>Teléfono</TableHead>}
                  {show("agenda") && <SortHead k="profesional">Agenda</SortHead>}
                  {show("piso") && <TableHead>Piso</TableHead>}
                  {show("odontologoACargo") && <TableHead className="w-48">Odontólogo a cargo</TableHead>}
                  {show("dni") && <SortHead k="dni">DNI</SortHead>}
                  {show("agendadoPor") && <SortHead k="agendadoPor">Agendado por</SortHead>}
                  {show("descripcion") && <TableHead>Descripción</TableHead>}
                  {show("observaciones") && <TableHead>Observaciones</TableHead>}
                  {show("tieneFicha") && <TableHead>Ficha</TableHead>}
                  {show("estado") && (
                    <SortHead k="estado" className="w-44">
                      Estado
                    </SortHead>
                  )}
                  {show("ficha") && <TableHead className="text-center">Ficha GHL</TableHead>}
                  {show("pacienteContacto") && <TableHead>Paciente que reservó</TableHead>}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={colCount} className="text-center py-10 text-muted-foreground">
                      Cargando turnos…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={colCount} className="text-center py-10 text-muted-foreground">
                      Sin turnos para esta fecha.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((t) => {
                  const est = t.estado ? ESTADO_MAP[t.estado] : null;
                  return (
                    <TableRow key={t.rowId} className={est?.row ?? ""}>
                      {show("hora") && (
                        <TableCell className="font-semibold tabular-nums">
                          {t.hora ?? (
                            <Badge
                              variant="secondary"
                              title="Sin turno (se atiende por orden de llegada)"
                            >
                              ST
                            </Badge>
                          )}
                        </TableCell>
                      )}
                      {show("llegada") && (
                        <TableCell className="tabular-nums text-sm">
                          {t.llegadaHora ?? "—"}
                        </TableCell>
                      )}
                      {show("sala") && (
                        <TableCell className="tabular-nums text-sm">
                          {t.salaHora ?? "—"}
                        </TableCell>
                      )}
                      {show("finalizado") && (
                        <TableCell className="tabular-nums text-sm">
                          {t.finalizadoHora ?? "—"}
                        </TableCell>
                      )}
                      {show("retiro") && (
                        <TableCell className="tabular-nums text-sm">
                          {t.retiroHora ?? "—"}
                        </TableCell>
                      )}
                      {show("paciente") && (
                        <TableCell className="font-medium">{t.paciente}</TableCell>
                      )}
                      {show("obraSocial") && (
                        <TableCell className="text-sm">{t.obraSocial ?? "—"}</TableCell>
                      )}
                      {show("telefono") && (
                        <TableCell className="text-sm text-muted-foreground">
                          {t.telefono ?? "—"}
                        </TableCell>
                      )}
                      {show("agenda") && <TableCell className="text-sm">{t.profesional}</TableCell>}
                      {show("piso") && (
                        <TableCell className="text-sm">
                          {pisoNombre.get(pisoDeTurno(t) ?? "") ?? "—"}
                        </TableCell>
                      )}
                      {show("odontologoACargo") && (
                        <TableCell>
                          <Select
                            value={t.odontologoACargoId ?? NONE}
                            onValueChange={(v) =>
                              cambiarACargo.mutate({
                                row: t,
                                odontologoACargoId: v === NONE ? null : v,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>
                                <span className="text-muted-foreground">
                                  {odontologoDeAgenda(t.profesional) ?? "Según agenda"}
                                </span>
                              </SelectItem>
                              {(odontologos ?? []).map((o: any) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      )}
                      {show("dni") && (
                        <TableCell className="tabular-nums">{t.dni ?? "—"}</TableCell>
                      )}
                      {show("agendadoPor") && (
                        <TableCell className="text-sm">
                          {t.origen === "Autoagenda" ? (
                            <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">
                              <Sparkles className="h-3 w-3 mr-1" /> Autoagenda
                            </Badge>
                          ) : (
                            <>
                              <div>{t.agendadoPor}</div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {t.origen}
                              </div>
                            </>
                          )}
                        </TableCell>
                      )}
                      {show("descripcion") && (
                        <TableCell className="text-sm text-muted-foreground max-w-[220px]">
                          {t.descripcion ? (
                            <span className="whitespace-pre-wrap break-words" title={t.descripcion}>
                              {t.descripcion}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      )}
                      {show("observaciones") && (
                        <TableCell className="text-sm text-muted-foreground max-w-[220px]">
                          {t.observaciones ? (
                            <span className="whitespace-pre-wrap break-words" title={t.observaciones}>
                              {t.observaciones}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      )}
                      {show("tieneFicha") && (
                        <TableCell>
                          <Select
                            value={t.ficha ?? undefined}
                            onValueChange={(v) => cambiarFicha.mutate({ row: t, valor: v })}
                          >
                            <SelectTrigger className="h-8 w-36">
                              <SelectValue placeholder="Sin definir" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Tiene Ficha">Tiene Ficha</SelectItem>
                              <SelectItem value="No tiene ficha">No tiene ficha</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      )}
                      {show("estado") && (
                        <TableCell>
                          <Select
                            value={t.estado ?? undefined}
                            onValueChange={(v) => cambiarEstado.mutate({ row: t, estado: v })}
                          >
                            <SelectTrigger className="h-8 w-40">
                              <SelectValue placeholder="Sin marcar" />
                            </SelectTrigger>
                            <SelectContent>
                              {ESTADOS.filter((e) => e.value !== "cancelado").map((e) => (
                                <SelectItem key={e.value} value={e.value}>
                                  <span className="inline-flex items-center gap-2">
                                    <span className={cn("h-2.5 w-2.5 rounded-full", e.dot)} />
                                    {e.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      )}
                      {show("ficha") && (
                        <TableCell className="text-center">
                          {t.tipo === "manual" ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`¿Eliminar el turno manual de ${t.paciente}?`))
                                  eliminar.mutate(t.id);
                              }}
                              className="inline-flex items-center justify-center text-muted-foreground hover:text-destructive"
                              title="Eliminar turno manual"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <a
                              href={t.contactoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center text-primary hover:text-primary/80"
                              title="Abrir ficha en GHL"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </TableCell>
                      )}
                      {show("pacienteContacto") && (
                        <TableCell className="text-sm">{t.pacienteContacto ?? "—"}</TableCell>
                      )}
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setModal({ row: t, modo: "ver" })}>
                              <Eye className="mr-2 h-4 w-4" /> Ver
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setModal({ row: t, modo: "editar" })}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            {t.estado !== "cancelado" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => {
                                    setCancelarRow(t);
                                    setCancelMotivo("");
                                  }}
                                >
                                  <Ban className="mr-2 h-4 w-4" /> Cancelar turno
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {modal && (
        <EditarTurnoDialog
          row={modal.row}
          modo={modal.modo}
          sucursalId={sucursalId}
          fecha={fecha}
          odontologos={odontologos ?? []}
          pisos={pisos ?? []}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            qc.invalidateQueries({ queryKey });
          }}
        />
      )}

      <Dialog open={!!cancelarRow} onOpenChange={(o) => !o && setCancelarRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar turno</DialogTitle>
          </DialogHeader>
          {cancelarRow && (
            <p className="text-sm text-muted-foreground">
              Se cancelará el turno de <b>{cancelarRow.paciente}</b>
              {cancelarRow.hora ? ` (${cancelarRow.hora})` : ""}. El paciente no recibirá recordatorios.
            </p>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo (opcional)</Label>
            <Input
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              placeholder="Ej: el paciente avisó que no puede venir"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelarRow(null)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={cancelar.isPending}
              onClick={() => cancelar.mutate({ row: cancelarRow, motivo: cancelMotivo.trim() })}
            >
              {cancelar.isPending ? "Cancelando…" : "Cancelar turno"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const NONE = "__none__";

function NuevoTurnoDialog({
  sucursalId,
  fecha,
  onCreated,
}: {
  sucursalId: string | null;
  fecha: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState(false);
  const [form, setForm] = useState({
    fecha,
    hora: "",
    dni: "",
    pacienteNombre: "",
    telefono: "",
    obraSocialId: NONE,
    odontologoId: NONE,
    motivo: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Al abrir, arrancar con la fecha activa de la tabla.
  useEffect(() => {
    if (open) setForm((f) => ({ ...f, fecha }));
  }, [open, fecha]);

  const { data: odontologos } = useQuery({
    enabled: open && !!sucursalId,
    queryKey: ["odontologos-turno", sucursalId],
    queryFn: () => listOdontologos({ data: { sucursalId, soloActivos: true } as any }),
  });
  const { data: obrasSociales } = useQuery({
    enabled: open,
    queryKey: ["obras-sociales-turno"],
    queryFn: () => listObrasSociales(),
  });

  // Autocompletado por DNI: si el paciente ya existe, trae nombre/teléfono/OS.
  const onDniBlur = async () => {
    const dni = form.dni.trim();
    if (!dni) return;
    try {
      const p = await getPacienteByDni({ data: { dni } });
      if (p)
        setForm((f) => ({
          ...f,
          pacienteNombre: f.pacienteNombre || p.nombre,
          telefono: f.telefono || (p.telefono ?? ""),
          obraSocialId: f.obraSocialId === NONE && p.obra_social_id ? p.obra_social_id : f.obraSocialId,
        }));
    } catch {
      /* silencioso: si falla, se carga a mano */
    }
  };

  const crear = useMutation({
    mutationFn: () =>
      crearTurnoManual({
        data: {
          sucursalId,
          fecha: form.fecha,
          hora: st ? null : form.hora,
          pacienteNombre: form.pacienteNombre.trim(),
          dni: form.dni.trim(),
          telefono: form.telefono.trim() || null,
          obraSocialId: form.obraSocialId === NONE ? null : form.obraSocialId,
          odontologoId: form.odontologoId === NONE ? null : form.odontologoId,
          motivo: form.motivo.trim() || null,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Turno cargado");
      setOpen(false);
      setSt(false);
      setForm({
        fecha,
        hora: "",
        dni: "",
        pacienteNombre: "",
        telefono: "",
        obraSocialId: NONE,
        odontologoId: NONE,
        motivo: "",
      });
      onCreated();
    },
    onError: (e) => toast.error((e as Error).message || "No se pudo cargar el turno"),
  });

  const dniOk = isValidDni(form.dni);
  const puedeGuardar =
    !!sucursalId && (st || !!form.hora) && !!form.pacienteNombre.trim() && dniOk && !crear.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!sucursalId}>
          <Plus className="mr-2 h-4 w-4" /> Agregar turno
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo turno manual</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Fecha</Label>
            <Input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Hora</Label>
            <Input
              type="time"
              value={st ? "" : form.hora}
              onChange={(e) => set("hora", e.target.value)}
              disabled={st}
            />
            <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={st}
                onChange={(e) => setSt(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Sin turno (ST) — se atiende por orden de llegada
            </label>
          </div>
          <div>
            <Label className="text-xs">DNI</Label>
            <Input
              inputMode="numeric"
              value={form.dni}
              onChange={(e) => set("dni", e.target.value)}
              onBlur={onDniBlur}
              placeholder="Sin puntos"
            />
            {form.dni && !dniOk && (
              <p className="text-[11px] text-destructive mt-1">{DNI_ERROR}</p>
            )}
          </div>
          <div>
            <Label className="text-xs">Paciente</Label>
            <Input
              value={form.pacienteNombre}
              onChange={(e) => set("pacienteNombre", e.target.value)}
              placeholder="Nombre y apellido"
            />
          </div>
          <div>
            <Label className="text-xs">Teléfono</Label>
            <Input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Obra social</Label>
            <Select value={form.obraSocialId} onValueChange={(v) => set("obraSocialId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sin especificar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin especificar</SelectItem>
                {(obrasSociales ?? []).map((os: any) => (
                  <SelectItem key={os.id} value={os.id}>
                    {os.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Odontólogo / agenda</Label>
            <Select value={form.odontologoId} onValueChange={(v) => set("odontologoId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin asignar</SelectItem>
                {(odontologos ?? []).map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Motivo</Label>
            <Input value={form.motivo} onChange={(e) => set("motivo", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => crear.mutate()} disabled={!puedeGuardar}>
            {crear.isPending ? "Guardando…" : "Guardar turno"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Modal de ver / editar un turno. En "editar" sincroniza con GHL (contacto + cita) para
// los turnos de GHL, o actualiza la fila local para los manuales.
function EditarTurnoDialog({
  row,
  modo,
  sucursalId,
  fecha,
  odontologos,
  pisos,
  onClose,
  onSaved,
}: {
  row: any;
  modo: "ver" | "editar";
  sucursalId: string | null;
  fecha: string;
  odontologos: any[];
  pisos: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const ver = modo === "ver";
  const esManual = row.tipo === "manual";
  const [form, setForm] = useState(() => ({
    firstName: row.firstName ?? "",
    lastName: row.lastName ?? "",
    pacienteNombre: row.paciente ?? "",
    telefono: row.telefono ?? "",
    email: row.email ?? "",
    dni: row.dni ?? "",
    obraSocial: row.obraSocial ?? "",
    obraSocialId: row.obraSocialId ?? NONE,
    observaciones: row.observaciones ?? "",
    motivo: row.motivo ?? "",
    ficha: row.ficha ?? "",
    odontologoId: row.odontologoId ?? NONE,
    odontologoACargoId: row.odontologoACargoId ?? NONE,
    pisoId: row.pisoId ?? NONE,
    estado: row.estado ?? "",
    horaCita: row.hora ?? "",
    st: esManual && !row.hora,
    llegadaHora: row.llegadaHora ?? "",
    salaHora: row.salaHora ?? "",
    finalizadoHora: row.finalizadoHora ?? "",
    retiroHora: row.retiroHora ?? "",
  }));
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const { data: obrasSociales } = useQuery({
    enabled: esManual,
    queryKey: ["obras-sociales-turno"],
    queryFn: () => listObrasSociales(),
  });

  const guardar = useMutation({
    mutationFn: () => {
      if (esManual) {
        return actualizarTurnoManual({
          data: {
            id: row.id,
            fecha,
            pacienteNombre: form.pacienteNombre.trim(),
            dni: form.dni.trim(),
            telefono: form.telefono.trim() || null,
            obraSocialId: form.obraSocialId === NONE ? null : form.obraSocialId,
            odontologoId: form.odontologoId === NONE ? null : form.odontologoId,
            odontologoACargoId: form.odontologoACargoId === NONE ? null : form.odontologoACargoId,
            pisoId: form.pisoId === NONE ? null : form.pisoId,
            motivo: form.motivo.trim() || null,
            hora: form.st ? null : form.horaCita || null,
            ficha: form.ficha || null,
            estado: form.estado || null,
            llegadaHora: form.llegadaHora,
            salaHora: form.salaHora,
            finalizadoHora: form.finalizadoHora,
            retiroHora: form.retiroHora,
          } as any,
        });
      }
      const payload: any = {
        eventId: row.eventId,
        contactId: row.contactId,
        sucursalId,
        fecha,
        calendarId: row.calendarId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        telefono: form.telefono.trim(),
        email: form.email.trim(),
        dni: form.dni.trim(),
        obraSocial: form.obraSocial.trim(),
        observaciones: form.observaciones.trim(),
        ficha: form.ficha || undefined,
        estado: form.estado || undefined,
        odontologoACargoId: form.odontologoACargoId === NONE ? null : form.odontologoACargoId,
        pisoId: form.pisoId === NONE ? null : form.pisoId,
        llegadaHora: form.llegadaHora,
        salaHora: form.salaHora,
        finalizadoHora: form.finalizadoHora,
        retiroHora: form.retiroHora,
      };
      // Reprogramación: solo si cambió la hora de la cita.
      if (form.horaCita && form.horaCita !== (row.hora ?? "")) {
        const dur =
          row.endTime && row.startTime
            ? new Date(row.endTime).getTime() - new Date(row.startTime).getTime()
            : 30 * 60000;
        const start = new Date(`${fecha}T${form.horaCita}:00-03:00`);
        const end = new Date(start.getTime() + (dur > 0 ? dur : 30 * 60000));
        payload.startTime = start.toISOString();
        payload.endTime = end.toISOString();
      }
      return actualizarTurnoGhl({ data: payload });
    },
    onSuccess: () => {
      toast.success("Turno actualizado");
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message || "No se pudo actualizar el turno"),
  });

  const Campo = ({
    label,
    children,
    full,
  }: {
    label: string;
    children: any;
    full?: boolean;
  }) => (
    <div className={full ? "col-span-2" : ""}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ver ? "Ver turno" : "Editar turno"} · {row.paciente}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {esManual ? (
            <Campo label="Paciente" full>
              <Input
                value={form.pacienteNombre}
                onChange={(e) => set("pacienteNombre", e.target.value)}
                disabled={ver}
              />
            </Campo>
          ) : (
            <>
              <Campo label="Nombre">
                <Input
                  value={form.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  disabled={ver}
                />
              </Campo>
              <Campo label="Apellido">
                <Input
                  value={form.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  disabled={ver}
                />
              </Campo>
            </>
          )}
          <Campo label="DNI">
            <Input value={form.dni} onChange={(e) => set("dni", e.target.value)} disabled={ver} />
          </Campo>
          <Campo label="Teléfono">
            <Input
              value={form.telefono}
              onChange={(e) => set("telefono", e.target.value)}
              disabled={ver}
            />
          </Campo>
          {!esManual && (
            <Campo label="Email">
              <Input
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                disabled={ver}
              />
            </Campo>
          )}
          {esManual ? (
            <Campo label="Obra social">
              <Select
                value={form.obraSocialId}
                onValueChange={(v) => set("obraSocialId", v)}
                disabled={ver}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin especificar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin especificar</SelectItem>
                  {(obrasSociales ?? []).map((os: any) => (
                    <SelectItem key={os.id} value={os.id}>
                      {os.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
          ) : (
            <Campo label="Obra social">
              <Input
                value={form.obraSocial}
                onChange={(e) => set("obraSocial", e.target.value)}
                disabled={ver}
              />
            </Campo>
          )}
          <Campo label={esManual ? "Motivo" : "Observaciones"} full>
            <Input
              value={esManual ? form.motivo : form.observaciones}
              onChange={(e) => set(esManual ? "motivo" : "observaciones", e.target.value)}
              disabled={ver}
            />
          </Campo>
          <Campo label="Ficha">
            <Select value={form.ficha || NONE} onValueChange={(v) => set("ficha", v === NONE ? "" : v)} disabled={ver}>
              <SelectTrigger>
                <SelectValue placeholder="Sin definir" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin definir</SelectItem>
                <SelectItem value="Tiene Ficha">Tiene Ficha</SelectItem>
                <SelectItem value="No tiene ficha">No tiene ficha</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo label={esManual ? "Odontólogo / agenda" : "Agenda"}>
            {esManual ? (
              <Select
                value={form.odontologoId}
                onValueChange={(v) => set("odontologoId", v)}
                disabled={ver}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin asignar</SelectItem>
                  {odontologos.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={row.profesional} disabled />
            )}
          </Campo>
          <Campo label="Odontólogo a cargo">
            <Select
              value={form.odontologoACargoId}
              onValueChange={(v) => set("odontologoACargoId", v)}
              disabled={ver}
            >
              <SelectTrigger>
                <SelectValue placeholder="Según agenda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Según agenda</SelectItem>
                {odontologos.map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Piso">
            <Select value={form.pisoId} onValueChange={(v) => set("pisoId", v)} disabled={ver}>
              <SelectTrigger>
                <SelectValue placeholder="Según odontólogo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Según odontólogo</SelectItem>
                {pisos.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Estado">
            <Select value={form.estado || NONE} onValueChange={(v) => set("estado", v === NONE ? "" : v)} disabled={ver}>
              <SelectTrigger>
                <SelectValue placeholder="Sin marcar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin marcar</SelectItem>
                {ESTADOS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Hora de la cita">
            <Input
              type="time"
              value={form.st ? "" : form.horaCita}
              onChange={(e) => set("horaCita", e.target.value)}
              disabled={ver || form.st}
            />
            {esManual && (
              <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.st}
                  onChange={(e) => set("st", e.target.checked)}
                  disabled={ver}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Sin turno (ST)
              </label>
            )}
          </Campo>
          <Campo label="Hora de llegada">
            <Input
              type="time"
              value={form.llegadaHora}
              onChange={(e) => set("llegadaHora", e.target.value)}
              disabled={ver}
            />
          </Campo>
          <Campo label="Ingreso a sala">
            <Input
              type="time"
              value={form.salaHora}
              onChange={(e) => set("salaHora", e.target.value)}
              disabled={ver}
            />
          </Campo>
          <Campo label="Hora de finalización">
            <Input
              type="time"
              value={form.finalizadoHora}
              onChange={(e) => set("finalizadoHora", e.target.value)}
              disabled={ver}
            />
          </Campo>
          <Campo label="Hora de retiro">
            <Input
              type="time"
              value={form.retiroHora}
              onChange={(e) => set("retiroHora", e.target.value)}
              disabled={ver}
            />
          </Campo>
        </div>
        {!esManual && !ver && form.horaCita !== (row.hora ?? "") && (
          <p className="text-[11px] text-amber-600 dark:text-amber-500">
            Cambiar la hora reprograma la cita en GHL y puede reenviar el recordatorio/confirmación
            al paciente.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {ver ? "Cerrar" : "Cancelar"}
          </Button>
          {!ver && (
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              {guardar.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
