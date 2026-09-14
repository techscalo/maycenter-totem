import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import { getMetricasRecepcion, getUltimaAsistenciaPacientes } from "@/lib/gestion/metrics.server";
import { useSucursalActiva } from "@/lib/gestion/sucursal-activa";
import { downloadMetricsPdf, downloadExcel } from "@/lib/gestion/exports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  CalendarCheck,
  UserX,
  Ban,
  Users,
  FileDown,
  FileSpreadsheet,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

const COLORS = [
  "#045477",
  "#2563eb",
  "#0891b2",
  "#16a34a",
  "#ea580c",
  "#db2777",
  "#7c3aed",
  "#65a30d",
  "#9333ea",
  "#e11d48",
  "#0d9488",
  "#ca8a04",
];

type Rango = "mes" | "mes_anterior" | "custom";

type RankRow = {
  dni: string;
  nombre: string;
  ultimaAsistencia: string;
  diasDesde: number;
  visitas: number;
};
type RankKey = "nombre" | "dni" | "ultima" | "dias" | "visitas";

function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function rangeFor(
  rango: Rango,
  desde: string,
  hasta: string,
): { from: Date; to: Date; label: string } {
  const now = new Date();
  if (rango === "mes") {
    const from = firstOfMonth(now);
    return { from, to: now, label: format(from, "MM/yyyy") };
  }
  if (rango === "mes_anterior") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from, to, label: format(from, "MM/yyyy") };
  }
  const from = desde ? new Date(`${desde}T00:00:00`) : firstOfMonth(now);
  const to = hasta ? new Date(`${hasta}T23:59:59`) : now;
  return { from, to, label: `${desde || "—"} a ${hasta || "—"}` };
}

export function MetricasPanel() {
  const { sucursalId, sucursalNombre } = useSucursalActiva();
  const [rango, setRango] = useState<Rango>("mes");
  const [desde, setDesde] = useState(toDateInput(firstOfMonth(new Date())));
  const [hasta, setHasta] = useState(toDateInput(new Date()));
  const [q, setQ] = useState("");
  const [inactividad, setInactividad] = useState<"todos" | "30" | "60" | "90">("todos");
  const [visitasFiltro, setVisitasFiltro] = useState<"todos" | "1" | "2" | "5">("todos");
  const [sortRank, setSortRank] = useState<{ key: RankKey; dir: "asc" | "desc" }>({
    key: "dias",
    dir: "desc",
  });
  const [page, setPage] = useState(0);
  const [exportando, setExportando] = useState(false);
  const PAGE_SIZE = 50;

  const {
    from,
    to,
    label: periodoLabel,
  } = useMemo(() => rangeFor(rango, desde, hasta), [rango, desde, hasta]);

  const metrics = useQuery({
    enabled: !!sucursalId,
    queryKey: ["metricas-recepcion", sucursalId, from.toISOString(), to.toISOString()],
    queryFn: () =>
      getMetricasRecepcion({
        data: { sucursalId, from: from.toISOString(), to: to.toISOString() },
      }),
  });

  const ranking = useQuery({
    enabled: !!sucursalId,
    queryKey: ["ultima-asistencia", sucursalId],
    queryFn: () => getUltimaAsistenciaPacientes({ data: { sucursalId } }),
  });

  const m = metrics.data;

  const rankingFiltrado = useMemo(() => {
    const term = q.trim().toLowerCase();
    const minDias = inactividad === "todos" ? 0 : Number(inactividad);
    const minVisitas = visitasFiltro === "todos" ? 0 : Number(visitasFiltro);
    const base = (ranking.data ?? []).filter((r) => {
      if (term && !r.nombre.toLowerCase().includes(term) && !r.dni.includes(term)) return false;
      if (r.diasDesde < minDias) return false;
      if (visitasFiltro === "1" && r.visitas !== 1) return false;
      if (visitasFiltro !== "1" && r.visitas < minVisitas) return false;
      return true;
    });
    const dir = sortRank.dir === "asc" ? 1 : -1;
    const cmp: Record<RankKey, (a: RankRow, b: RankRow) => number> = {
      nombre: (a, b) => a.nombre.localeCompare(b.nombre),
      dni: (a, b) => a.dni.localeCompare(b.dni),
      ultima: (a, b) => a.ultimaAsistencia.localeCompare(b.ultimaAsistencia),
      dias: (a, b) => a.diasDesde - b.diasDesde,
      visitas: (a, b) => a.visitas - b.visitas,
    };
    return [...base].sort((a, b) => cmp[sortRank.key](a, b) * dir);
  }, [ranking.data, q, inactividad, visitasFiltro, sortRank]);

  // Al cambiar filtros/orden, volver a la primera página.
  useEffect(() => setPage(0), [q, inactividad, visitasFiltro, sortRank]);

  const totalPaginas = Math.max(1, Math.ceil(rankingFiltrado.length / PAGE_SIZE));
  const pageActual = Math.min(page, totalPaginas - 1);
  const rankingPagina = rankingFiltrado.slice(
    pageActual * PAGE_SIZE,
    pageActual * PAGE_SIZE + PAGE_SIZE,
  );

  const toggleSortRank = (key: RankKey) =>
    setSortRank((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const exportarRankingExcel = () => {
    downloadExcel(
      `Maycenter-Ultima-Asistencia-${sucursalNombre || "sede"}.xlsx`,
      "Última asistencia",
      rankingFiltrado.map((r) => ({
        Paciente: r.nombre,
        DNI: r.dni,
        "Última asistencia": format(parseISO(r.ultimaAsistencia), "dd/MM/yyyy"),
        "Hace (días)": r.diasDesde,
        Visitas: r.visitas,
      })),
    );
  };

  // Refs a los contenedores de cada chart, para serializar su SVG al exportar el PDF.
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const setChartRef = (id: string) => (el: HTMLDivElement | null) => {
    chartRefs.current[id] = el;
  };
  const svgOf = (id: string) =>
    (chartRefs.current[id]?.querySelector("svg") as SVGSVGElement | null) ?? null;

  const tasaAsistencia = m && m.totalCitas > 0 ? Math.round((m.atendidas / m.totalCitas) * 100) : 0;

  const exportarPdf = async () => {
    if (!m) return;
    setExportando(true);
    try {
      await downloadMetricsPdf({
        filename: `Maycenter-Metricas-Recepcion-${periodoLabel.replace(/[/ ]/g, "-")}.pdf`,
        sucursalNombre: sucursalNombre || "—",
        periodoLabel,
        kpis: [
          { label: "Total de citas", value: m.totalCitas },
          { label: "Atendidas / Finalizadas", value: m.atendidas },
          { label: "Ausentes", value: m.ausentes },
          { label: "Canceladas", value: m.cancelados },
          { label: "Se retiraron", value: m.seRetiraron },
          { label: "Tasa de asistencia", value: `${tasaAsistencia}%` },
          { label: "Llegadas al tótem", value: m.llegadasTotem },
        ],
        charts: [
          { title: "Citas por día", svg: svgOf("porDia") },
          { title: "Citas por estado", svg: svgOf("porEstado") },
          { title: "Citas por obra social", svg: svgOf("porObraSocial") },
          { title: "Citas por día de la semana", svg: svgOf("porDiaSemana") },
          { title: "Citas por profesional / agenda", svg: svgOf("porProfesional") },
          { title: "Origen de la cita", svg: svgOf("porFuente") },
        ],
        tablas: [
          {
            title: "Citas por obra social",
            head: ["Obra social", "Citas"],
            body: m.porObraSocial.map((x) => [x.label, x.count]),
          },
          {
            title: "Citas por estado",
            head: ["Estado", "Citas"],
            body: m.porEstado.map((x) => [x.label, x.count]),
          },
          {
            title: "Pacientes — última asistencia",
            head: ["Paciente", "DNI", "Última asistencia", "Hace (días)", "Visitas"],
            body: rankingFiltrado
              .slice(0, 60)
              .map((r) => [
                r.nombre,
                r.dni,
                format(parseISO(r.ultimaAsistencia), "dd/MM/yyyy"),
                r.diasDesde,
                r.visitas,
              ]),
          },
        ],
      });
    } catch (e) {
      toast.error((e as Error).message || "No se pudo generar el PDF");
    } finally {
      setExportando(false);
    }
  };

  if (!sucursalId) {
    return (
      <div className="text-center text-muted-foreground py-20">
        Seleccioná una sucursal para ver las métricas.
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Métricas de recepción</h1>
          <p className="text-sm text-muted-foreground">
            Control de citas del período. Citas = turnos de agenda (GHL + manuales).
          </p>
        </div>
        <Button onClick={exportarPdf} disabled={!m || exportando}>
          <FileDown className="mr-2 h-4 w-4" /> {exportando ? "Generando…" : "Exportar PDF"}
        </Button>
      </header>

      {/* Período */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground mr-2 inline-flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Período
        </span>
        {(
          [
            ["mes", "Este mes"],
            ["mes_anterior", "Mes anterior"],
            ["custom", "Personalizado"],
          ] as [Rango, string][]
        ).map(([key, lbl]) => (
          <button
            key={key}
            onClick={() => setRango(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              rango === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-accent"
            }`}
          >
            {lbl}
          </button>
        ))}
        {rango === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
              className="h-9 px-3 rounded-md border border-border bg-background text-sm"
            />
            <span className="text-muted-foreground text-sm">a</span>
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
              className="h-9 px-3 rounded-md border border-border bg-background text-sm"
            />
          </div>
        )}
        {m && !m.soportadoGhl && (
          <span className="ml-auto text-xs text-muted-foreground">
            Esta sede no tiene GHL: se cuentan solo turnos manuales.
          </span>
        )}
      </div>

      {metrics.isLoading ? (
        <div className="text-center text-muted-foreground py-20">
          Calculando métricas… (trae los turnos de GHL en vivo, puede tardar unos segundos)
        </div>
      ) : metrics.isError ? (
        <div className="text-center text-destructive py-20">
          No se pudieron cargar las métricas.
        </div>
      ) : m ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <Kpi
              label="Total de citas"
              value={m.totalCitas}
              icon={<Calendar className="h-4 w-4" />}
            />
            <Kpi
              label="Atendidas"
              value={m.atendidas}
              icon={<CalendarCheck className="h-4 w-4" />}
              accent
            />
            <Kpi label="Ausentes" value={m.ausentes} icon={<UserX className="h-4 w-4" />} danger />
            <Kpi label="Canceladas" value={m.cancelados} icon={<Ban className="h-4 w-4" />} />
            <Kpi
              label="Tasa asistencia"
              value={`${tasaAsistencia}%`}
              icon={<CalendarCheck className="h-4 w-4" />}
              accent
            />
            <Kpi
              label="Llegadas tótem"
              value={m.llegadasTotem}
              icon={<Users className="h-4 w-4" />}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="Citas por día"
              refCb={setChartRef("porDia")}
              empty={m.porDia.length === 0}
            >
              <BarChart data={m.porDia}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="fecha" tickFormatter={(d) => format(parseISO(d), "dd/MM")} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={(d) => format(parseISO(d as string), "dd/MM/yyyy")} />
                <Bar dataKey="count" name="Citas" fill="#045477" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Citas por estado"
              refCb={setChartRef("porEstado")}
              empty={m.porEstado.length === 0}
            >
              <PieChart>
                <Pie
                  data={m.porEstado}
                  dataKey="count"
                  nameKey="label"
                  outerRadius={85}
                  label={(d: any) => `${d.label} (${d.count})`}
                >
                  {m.porEstado.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ChartCard>

            <ChartCard
              title="Citas por obra social"
              refCb={setChartRef("porObraSocial")}
              empty={m.porObraSocial.length === 0}
            >
              <BarChart data={m.porObraSocial} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={130} />
                <Tooltip />
                <Bar dataKey="count" name="Citas" fill="#0891b2" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Citas por día de la semana"
              refCb={setChartRef("porDiaSemana")}
              empty={m.porDiaSemana.length === 0}
            >
              <BarChart data={m.porDiaSemana}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Citas" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Citas por profesional / agenda"
              refCb={setChartRef("porProfesional")}
              empty={m.porProfesional.length === 0}
            >
              <BarChart data={m.porProfesional} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={140} />
                <Tooltip />
                <Bar dataKey="count" name="Citas" fill="#16a34a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Origen de la cita"
              refCb={setChartRef("porFuente")}
              empty={m.porFuente.length === 0}
            >
              <PieChart>
                <Pie
                  data={m.porFuente}
                  dataKey="count"
                  nameKey="label"
                  outerRadius={85}
                  label={(d: any) => `${d.label} (${d.count})`}
                >
                  {m.porFuente.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ChartCard>
          </div>

          {/* Ranking de última asistencia */}
          <Card className="mt-6">
            <CardHeader className="gap-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Última asistencia por paciente</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Última vez que el paciente vino a la clínica (aunque se haya retirado sin
                    atenderse). Fuente: llegadas del tótem + turnos manuales.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Buscar por nombre o DNI"
                      className="pl-8 h-9 w-56"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={exportarRankingExcel}
                    disabled={rankingFiltrado.length === 0}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
                  </Button>
                </div>
              </div>

              {/* Filtros rápidos */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Sin venir hace</span>
                {(
                  [
                    ["todos", "Cualquiera"],
                    ["30", "+30 días"],
                    ["60", "+60 días"],
                    ["90", "+90 días"],
                  ] as [typeof inactividad, string][]
                ).map(([key, lbl]) => (
                  <button
                    key={key}
                    onClick={() => setInactividad(key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      inactividad === key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-accent"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
                <span className="text-xs font-medium text-muted-foreground ml-2">Visitas</span>
                <Select value={visitasFiltro} onValueChange={(v) => setVisitasFiltro(v as any)}>
                  <SelectTrigger className="h-8 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    <SelectItem value="1">Una sola (no volvió)</SelectItem>
                    <SelectItem value="2">2 o más</SelectItem>
                    <SelectItem value="5">5 o más</SelectItem>
                  </SelectContent>
                </Select>
                <span className="ml-auto text-xs text-muted-foreground">
                  {rankingFiltrado.length} paciente{rankingFiltrado.length === 1 ? "" : "s"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {ranking.isLoading ? (
                <div className="text-center text-muted-foreground py-10">Cargando…</div>
              ) : rankingFiltrado.length === 0 ? (
                <div className="text-center text-muted-foreground py-10">
                  Sin pacientes para estos filtros.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <ThSort
                          label="Paciente"
                          col="nombre"
                          sort={sortRank}
                          onSort={toggleSortRank}
                        />
                        <ThSort label="DNI" col="dni" sort={sortRank} onSort={toggleSortRank} />
                        <ThSort
                          label="Última asistencia"
                          col="ultima"
                          sort={sortRank}
                          onSort={toggleSortRank}
                        />
                        <ThSort
                          label="Hace (días)"
                          col="dias"
                          sort={sortRank}
                          onSort={toggleSortRank}
                          align="right"
                        />
                        <ThSort
                          label="Visitas"
                          col="visitas"
                          sort={sortRank}
                          onSort={toggleSortRank}
                          align="right"
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {rankingPagina.map((r) => (
                        <tr key={r.dni} className="border-t border-border">
                          <td className="px-3 py-2">{r.nombre}</td>
                          <td className="px-3 py-2 tabular-nums">{r.dni}</td>
                          <td className="px-3 py-2">
                            {format(parseISO(r.ultimaAsistencia), "dd/MM/yyyy")}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.diasDesde}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.visitas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Paginación */}
                  <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground bg-muted/30">
                    <span>
                      {pageActual * PAGE_SIZE + 1}–
                      {Math.min((pageActual + 1) * PAGE_SIZE, rankingFiltrado.length)} de{" "}
                      {rankingFiltrado.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={pageActual === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span>
                        {pageActual + 1} / {totalPaginas}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setPage((p) => Math.min(totalPaginas - 1, p + 1))}
                        disabled={pageActual >= totalPaginas - 1}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function ThSort({
  label,
  col,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  col: RankKey;
  sort: { key: RankKey; dir: "asc" | "desc" };
  onSort: (k: RankKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === col;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`font-medium px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-foreground" : ""}`}
      >
        {label}
        <Icon className="h-3.5 w-3.5" />
      </button>
    </th>
  );
}

function Kpi({
  label,
  value,
  icon,
  accent,
  danger,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 border ${
        danger
          ? "border-destructive/30 bg-destructive/5"
          : accent
            ? "border-primary/30 bg-primary/5"
            : "border-border bg-card"
      }`}
    >
      <div
        className={`flex items-center gap-2 text-xs ${
          danger ? "text-destructive" : accent ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {icon} {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold">{value}</div>
    </div>
  );
}

function ChartCard({
  title,
  refCb,
  empty,
  children,
}: {
  title: string;
  refCb: (el: HTMLDivElement | null) => void;
  empty?: boolean;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-72" ref={refCb}>
        {empty ? (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">
            Sin datos en el período.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
