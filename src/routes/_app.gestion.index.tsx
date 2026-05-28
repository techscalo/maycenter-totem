import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListPlus, Table2, Settings, Wallet, Users, Activity } from "lucide-react";
import { useUserContext } from "@/lib/gestion/use-auth";

export const Route = createFileRoute("/_app/gestion/")({
  component: HomePage,
});

function HomePage() {
  const { profile, isAdmin } = useUserContext();

  const { data: stats } = useQuery({
    queryKey: ["gestion-home-stats"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isoToday = today.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("prestaciones")
        .select("monto, monto_usd, dni")
        .gte("fecha", isoToday);
      const rows = data ?? [];
      const totalArs = rows.reduce((s, r) => s + Number(r.monto || 0), 0);
      const totalUsd = rows.reduce((s, r) => s + Number(r.monto_usd || 0), 0);
      const pacientes = new Set(rows.map((r) => r.dni)).size;
      return { count: rows.length, totalArs, totalUsd, pacientes };
    },
  });

  const fmt = (n: number) =>
    n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Hola{profile?.nombre ? `, ${profile.nombre.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="text-muted-foreground mt-1">Resumen del día y accesos rápidos.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Prestaciones hoy" value={stats?.count ?? "—"} />
        <StatCard icon={Users} label="Pacientes hoy" value={stats?.pacientes ?? "—"} />
        <StatCard icon={Wallet} label="Facturado ARS" value={stats ? fmt(stats.totalArs) : "—"} />
        <StatCard icon={Wallet} label="Facturado USD" value={stats ? `U$D ${stats.totalUsd.toLocaleString("es-AR")}` : "—"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickLink to="/gestion/prestaciones/nueva" icon={ListPlus} title="Nueva prestación" desc="Cargar una atención." />
        <QuickLink to="/gestion/prestaciones" icon={Table2} title="Ver prestaciones" desc="Filtrar y editar." />
        {isAdmin && <QuickLink to="/gestion/admin" icon={Settings} title="Administración" desc="Catálogos del sistema." />}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function QuickLink({ to, icon: Icon, title, desc }: { to: string; icon: any; title: string; desc: string }) {
  return (
    <Link to={to} className="block">
      <Card className="hover:shadow-md transition-shadow h-full">
        <CardContent className="p-5 flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-sm text-muted-foreground">{desc}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
