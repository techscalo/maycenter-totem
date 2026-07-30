import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getTurnosDelDia, marcarEstadoTurno } from "@/lib/gestion/ghl.server";
import { useSucursalActiva } from "@/lib/gestion/sucursal-activa";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  { value: "en_consultorio", label: "En consultorio", dot: "bg-sky-400", row: "bg-sky-50 dark:bg-sky-950/20" },
  { value: "finalizado", label: "Finalizado", dot: "bg-green-500", row: "bg-green-50 dark:bg-green-950/20" },
  { value: "ausente", label: "Ausente", dot: "bg-gray-400", row: "opacity-60" },
] as const;
const ESTADO_MAP = Object.fromEntries(ESTADOS.map((e) => [e.value, e]));

// Columnas: orden de render + label + si arranca oculta.
const COLS = [
  { key: "hora", label: "Hora turno" },
  { key: "llegada", label: "Hora llegada" },
  { key: "paciente", label: "Paciente" },
  { key: "obraSocial", label: "Obra social" },
  { key: "telefono", label: "Teléfono" },
  { key: "agenda", label: "Agenda" },
  { key: "dni", label: "DNI", hiddenByDefault: true },
  { key: "agendadoPor", label: "Agendado por", hiddenByDefault: true },
  { key: "estado", label: "Estado" },
  { key: "ficha", label: "Ficha" },
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

  const marcar = useMutation({
    mutationFn: (v: { eventId: string; estado: string }) =>
      marcarEstadoTurno({ data: { ...v, sucursalId, fecha } as any }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<any>(queryKey);
      qc.setQueryData<any>(queryKey, (old: any) =>
        old
          ? {
              ...old,
              turnos: old.turnos.map((t: any) =>
                t.eventId === v.eventId ? { ...t, estado: v.estado } : t,
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
  });

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
        `${t.paciente} ${t.dni ?? ""} ${t.profesional} ${t.obraSocial ?? ""} ${t.telefono ?? ""}`
          .toLowerCase()
          .includes(term),
      );
    if (agendaFiltro !== "all") list = list.filter((t) => t.profesional === agendaFiltro);
    if (estadoFiltro !== "all")
      list = list.filter((t) =>
        estadoFiltro === "sin_marcar" ? !t.estado : t.estado === estadoFiltro,
      );
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (t: any) => (sort.key === "profesional" ? t.profesional : t[sort.key]);
    return [...list].sort(
      (a, b) => String(val(a) ?? "").localeCompare(String(val(b) ?? ""), "es") * dir,
    );
  }, [turnos, q, agendaFiltro, estadoFiltro, sort]);

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

  const colCount = COLS.filter((c) => show(c.key)).length;

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
          <div className="ml-auto text-sm text-muted-foreground inline-flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            {sucursalNombre} · {rows.length} turnos
          </div>
        </CardContent>
      </Card>

      {!soportado ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Los turnos de GHL no están configurados para esta sucursal.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
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
                  {show("paciente") && <SortHead k="paciente">Paciente</SortHead>}
                  {show("obraSocial") && <SortHead k="obraSocial">Obra social</SortHead>}
                  {show("telefono") && <TableHead>Teléfono</TableHead>}
                  {show("agenda") && <SortHead k="profesional">Agenda</SortHead>}
                  {show("dni") && <SortHead k="dni">DNI</SortHead>}
                  {show("agendadoPor") && <SortHead k="agendadoPor">Agendado por</SortHead>}
                  {show("estado") && (
                    <SortHead k="estado" className="w-44">
                      Estado
                    </SortHead>
                  )}
                  {show("ficha") && <TableHead className="text-center">Ficha</TableHead>}
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
                    <TableRow key={t.eventId} className={est?.row ?? ""}>
                      {show("hora") && (
                        <TableCell className="font-semibold tabular-nums">{t.hora}</TableCell>
                      )}
                      {show("llegada") && (
                        <TableCell className="tabular-nums text-sm">
                          {t.llegadaHora ?? "—"}
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
                      {show("estado") && (
                        <TableCell>
                          <Select
                            value={t.estado ?? undefined}
                            onValueChange={(v) => marcar.mutate({ eventId: t.eventId, estado: v })}
                          >
                            <SelectTrigger className="h-8 w-40">
                              <SelectValue placeholder="Sin marcar" />
                            </SelectTrigger>
                            <SelectContent>
                              {ESTADOS.map((e) => (
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
                          <a
                            href={t.contactoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center text-primary hover:text-primary/80"
                            title="Abrir ficha en GHL"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
