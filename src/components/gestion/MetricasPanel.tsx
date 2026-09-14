import { useMemo, useRef, useState } from "react";
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
import { downloadMetricsPdf } from "@/lib/gestion/exports";
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
import { Calendar, CalendarCheck, UserX, Ban, Users, FileDown, Search } from "lucide-react";
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
  const [ordenRanking, setOrdenRanking] = useState<"reciente" | "antiguo" | "visitas">("antiguo");
  const [exportando, setExportando] = useState(false);

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
    const base = (ranking.data ?? []).filter((r) => {
      const term = q.trim().toLowerCase();
      if (!term) return true;
      return r.nombre.toLowerCase().includes(term) || r.dni.includes(term);
    });
    const sorted = [...base];
    if (ordenRanking === "reciente")
      sorted.sort((a, b) => b.ultimaAsistencia.localeCompare(a.ultimaAsistencia));
    else if (ordenRanking === "antiguo")
      sorted.sort((a, b) => a.ultimaAsistencia.localeCompare(b.ultimaAsistencia));
    else sorted.sort((a, b) => b.visitas - a.visitas);
    return sorted;
  }, [ranking.data, q, ordenRanking]);

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
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
                <Select value={ordenRanking} onValueChange={(v) => setOrdenRanking(v as any)}>
                  <SelectTrigger className="h-9 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="antiguo">Hace más tiempo</SelectItem>
                    <SelectItem value="reciente">Más recientes</SelectItem>
                    <SelectItem value="visitas">Más visitas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {ranking.isLoading ? (
                <div className="text-center text-muted-foreground py-10">Cargando…</div>
              ) : rankingFiltrado.length === 0 ? (
                <div className="text-center text-muted-foreground py-10">Sin registros.</div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Paciente</th>
                        <th className="text-left font-medium px-3 py-2">DNI</th>
                        <th className="text-left font-medium px-3 py-2">Última asistencia</th>
                        <th className="text-right font-medium px-3 py-2">Hace (días)</th>
                        <th className="text-right font-medium px-3 py-2">Visitas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingFiltrado.slice(0, 200).map((r) => (
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
                  {rankingFiltrado.length > 200 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30">
                      Mostrando 200 de {rankingFiltrado.length}. Afiná con el buscador.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
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
