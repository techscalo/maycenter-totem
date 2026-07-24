import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getTurnosDelDia, marcarAsistenciaTurno } from "@/lib/gestion/ghl.server";
import { useSucursalActiva } from "@/lib/gestion/sucursal-activa";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  UserCheck,
} from "lucide-react";

type SortKey =
  | "startTime"
  | "paciente"
  | "dni"
  | "profesional"
  | "agendadoPor"
  | "origen"
  | "ingresoTotem"
  | "asistio";

export function TurnosDelDia() {
  const qc = useQueryClient();
  const { sucursalId, sucursalNombre } = useSucursalActiva();
  const [fecha, setFecha] = useState(format(new Date(), "yyyy-MM-dd"));
  const [q, setQ] = useState("");
  const [soloIngresaron, setSoloIngresaron] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "startTime",
    dir: "asc",
  });

  const queryKey = ["turnos-dia", sucursalId, fecha];
  const { data, isLoading, isFetching, refetch } = useQuery({
    enabled: !!sucursalId,
    queryKey,
    queryFn: () => getTurnosDelDia({ data: { sucursalId, fecha } }),
  });

  const marcar = useMutation({
    mutationFn: (v: { eventId: string; asistio: boolean }) =>
      marcarAsistenciaTurno({ data: { ...v, sucursalId, fecha } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<any>(queryKey);
      qc.setQueryData<any>(queryKey, (old: any) =>
        old
          ? {
              ...old,
              turnos: old.turnos.map((t: any) =>
                t.eventId === v.eventId ? { ...t, asistio: v.asistio } : t,
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

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const rows = useMemo(() => {
    let list = (data?.turnos ?? []) as any[];
    const term = q.trim().toLowerCase();
    if (term)
      list = list.filter((t) =>
        `${t.paciente} ${t.dni ?? ""} ${t.profesional}`.toLowerCase().includes(term),
      );
    if (soloIngresaron) list = list.filter((t) => t.ingresoTotem);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      if (typeof va === "boolean") return (Number(va) - Number(vb)) * dir;
      return String(va ?? "").localeCompare(String(vb ?? ""), "es") * dir;
    });
  }, [data, q, soloIngresaron, sort]);

  const SortHead = ({
    k,
    children,
    className,
  }: {
    k: SortKey;
    children: any;
    className?: string;
  }) => (
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
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Paciente, DNI o profesional…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 h-10 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={soloIngresaron}
              onChange={(e) => setSoloIngresaron(e.target.checked)}
            />
            Solo los que ingresaron
          </label>
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
            Los turnos de GHL están disponibles por ahora solo para <b>CABA</b>.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead k="startTime" className="w-16">
                    Hora
                  </SortHead>
                  <SortHead k="paciente">Paciente</SortHead>
                  <SortHead k="dni">DNI</SortHead>
                  <TableHead>Teléfono</TableHead>
                  <SortHead k="profesional">Agenda</SortHead>
                  <SortHead k="agendadoPor">Agendado por</SortHead>
                  <SortHead k="ingresoTotem" className="text-center">
                    Ingresó
                  </SortHead>
                  <SortHead k="asistio" className="text-center">
                    Asistencia
                  </SortHead>
                  <TableHead className="text-center">Ficha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      Cargando turnos…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      Sin turnos para esta fecha.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((t) => (
                  <TableRow key={t.eventId} className={t.asistio ? "bg-success/5" : ""}>
                    <TableCell className="font-semibold tabular-nums">{t.hora}</TableCell>
                    <TableCell className="font-medium">{t.paciente}</TableCell>
                    <TableCell className="tabular-nums">{t.dni ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.telefono ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{t.profesional}</TableCell>
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
                    <TableCell className="text-center">
                      {t.ingresoTotem ? (
                        <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15">
                          <UserCheck className="h-3 w-3 mr-1" /> {t.llegadaEstado ?? "En sala"}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => marcar.mutate({ eventId: t.eventId, asistio: true })}
                          className={cn(
                            "px-2 py-1 rounded-md text-xs font-medium border transition-colors",
                            t.asistio === true
                              ? "bg-success/15 text-success border-success/40"
                              : "border-border text-muted-foreground hover:bg-accent",
                          )}
                        >
                          Asistió
                        </button>
                        <button
                          type="button"
                          onClick={() => marcar.mutate({ eventId: t.eventId, asistio: false })}
                          className={cn(
                            "px-2 py-1 rounded-md text-xs font-medium border transition-colors",
                            t.asistio === false
                              ? "bg-destructive/15 text-destructive border-destructive/40"
                              : "border-border text-muted-foreground hover:bg-accent",
                          )}
                        >
                          Ausente
                        </button>
                      </div>
                    </TableCell>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
