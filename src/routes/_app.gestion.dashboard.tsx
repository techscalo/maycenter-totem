import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPrestaciones } from "@/lib/gestion/data.server";
import { useSucursalActiva } from "@/lib/gestion/sucursal-activa";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from "recharts";
import { format, subDays, parseISO } from "date-fns";

export const Route = createFileRoute("/_app/gestion/dashboard")({
  component: DashboardPage,
});

const COLORS = [
  "#2563eb",
  "#7c3aed",
  "#0891b2",
  "#16a34a",
  "#ea580c",
  "#db2777",
  "#65a30d",
  "#9333ea",
];

function DashboardPage() {
  const today = new Date();
  const { sucursalId } = useSucursalActiva();
  const [desde, setDesde] = useState(format(subDays(today, 29), "yyyy-MM-dd"));
  const [hasta, setHasta] = useState(format(today, "yyyy-MM-dd"));

  const { data: rows } = useQuery({
    enabled: !!sucursalId,
    queryKey: ["dashboard-prestaciones", desde, hasta, sucursalId],
    queryFn: () =>
      listPrestaciones({
        data: {
          desde,
          hasta,
          sucursalId,
          limit: 2000,
        },
      }),
  });

  const kpis = useMemo(() => {
    const r = rows ?? [];
    const totalArs = r.reduce((s, x: any) => s + Number(x.monto || 0), 0);
    const totalUsd = r.reduce((s, x: any) => s + Number(x.monto_usd || 0), 0);
    const pacientes = new Set(r.map((x: any) => x.dni)).size;
    return { count: r.length, totalArs, totalUsd, pacientes };
  }, [rows]);

  const serieDiaria = useMemo(() => {
    const map = new Map<string, { fecha: string; monto: number; cantidad: number }>();
    (rows ?? []).forEach((x: any) => {
      const k = x.fecha;
      const cur = map.get(k) ?? { fecha: k, monto: 0, cantidad: 0 };
      cur.monto += Number(x.monto || 0);
      cur.cantidad += 1;
      map.set(k, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [rows]);

  const porObra = useMemo(() => {
    const map = new Map<string, number>();
    (rows ?? []).forEach((x: any) => {
      const k = x.obras_sociales?.nombre ?? "—";
      map.set(k, (map.get(k) ?? 0) + Number(x.monto || 0));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const porOdontologo = useMemo(() => {
    const map = new Map<string, { name: string; monto: number; cantidad: number }>();
    (rows ?? []).forEach((x: any) => {
      const k = x.odontologos?.nombre ?? "—";
      const cur = map.get(k) ?? { name: k, monto: 0, cantidad: 0 };
      cur.monto += Number(x.monto || 0);
      cur.cantidad += 1;
      map.set(k, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 10);
  }, [rows]);

  const fmt = (n: number) =>
    n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard ejecutivo</h1>
        <p className="text-sm text-muted-foreground">KPIs y tendencias del período.</p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <Label>Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Prestaciones" value={kpis.count} />
        <Kpi label="Pacientes únicos" value={kpis.pacientes} />
        <Kpi label="Facturado ARS" value={fmt(kpis.totalArs)} />
        <Kpi label="Facturado USD" value={`U$D ${kpis.totalUsd.toLocaleString("es-AR")}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Facturación diaria</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieDiaria}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="fecha" tickFormatter={(d) => format(parseISO(d), "dd/MM")} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: number) => fmt(v)}
                  labelFormatter={(d) => format(parseISO(d as string), "dd/MM/yyyy")}
                />
                <Line
                  type="monotone"
                  dataKey="monto"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prestaciones por día</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serieDiaria}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="fecha" tickFormatter={(d) => format(parseISO(d), "dd/MM")} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={(d) => format(parseISO(d as string), "dd/MM/yyyy")} />
                <Bar dataKey="cantidad" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Facturación por obra social</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={porObra}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  label={(d: any) => d.name}
                >
                  {porObra.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Top 10 odontólogos por facturación</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porOdontologo} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={140} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="monto" name="Facturado" fill="#16a34a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
