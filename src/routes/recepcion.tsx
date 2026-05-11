import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BrandHeader } from "@/components/BrandHeader";
import { Archive, RefreshCw, AlertTriangle, Sparkles, Calendar, Clock } from "lucide-react";

export const Route = createFileRoute("/recepcion")({
  head: () => ({
    meta: [
      { title: "Maycenter — Panel de Recepción" },
      { name: "description", content: "Panel interno para gestionar las llegadas de pacientes." },
    ],
  }),
  component: RecepcionPage,
});

type Arrival = {
  id: string;
  created_at: string;
  tipo_llegada: string;
  tipo_paciente: string;
  tipo_atencion: string;
  cobertura: string | null;
  nombre_apellido: string | null;
  dni: string;
  estado: string;
};

const ESTADOS = ["Pendiente", "Atendido", "Cancelado"] as const;
type Filtro = "todos" | "turno" | "urgencia" | "pendientes" | "atendidos";

function todayStartIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function RecepcionPage() {
  const [items, setItems] = useState<Arrival[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("arrivals")
      .select("*")
      .gte("created_at", todayStartIso())
      .order("created_at", { ascending: false });
    setItems((data as Arrival[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("arrivals_panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "arrivals" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    return items.filter((a) => {
      if (filtro === "turno") return a.tipo_llegada === "TURNO PROGRAMADO";
      if (filtro === "urgencia") return a.tipo_llegada === "URGENCIA / SIN TURNO";
      if (filtro === "pendientes") return a.estado === "Pendiente";
      if (filtro === "atendidos") return a.estado === "Atendido";
      return true;
    });
  }, [items, filtro]);

  const counts = useMemo(() => ({
    total: items.length,
    pendientes: items.filter((i) => i.estado === "Pendiente").length,
    urgencias: items.filter((i) => i.tipo_llegada === "URGENCIA / SIN TURNO" && i.estado === "Pendiente").length,
  }), [items]);

  const updateEstado = async (id: string, estado: string) => {
    await supabase.from("arrivals").update({ estado }).eq("id", id);
  };

  const archiveOld = async () => {
    if (!confirm("¿Archivar (eliminar) todos los registros anteriores a hoy?")) return;
    await supabase.from("arrivals").delete().lt("created_at", todayStartIso());
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <BrandHeader subtitle="Panel de Recepción" />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={load}>
              <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
            </Button>
            <Button variant="outline" onClick={archiveOld}>
              <Archive className="mr-2 h-4 w-4" /> Archivar antiguos
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard label="Llegadas hoy" value={counts.total} icon={<Calendar className="h-5 w-5" />} />
          <StatCard label="Pendientes" value={counts.pendientes} icon={<Clock className="h-5 w-5" />} accent />
          <StatCard
            label="Urgencias pendientes"
            value={counts.urgencias}
            icon={<AlertTriangle className="h-5 w-5" />}
            danger
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {([
            ["todos", "Todos"],
            ["turno", "Turno programado"],
            ["urgencia", "Urgencia / sin turno"],
            ["pendientes", "Pendientes"],
            ["atendidos", "Atendidos"],
          ] as [Filtro, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFiltro(key)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                filtro === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:bg-accent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center text-muted-foreground py-20">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-20 border border-dashed border-border rounded-2xl bg-card/50">
            No hay llegadas para mostrar.
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((a) => (
              <ArrivalCard key={a.id} a={a} onChange={(estado) => updateEstado(a.id, estado)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label, value, icon, accent, danger,
}: { label: string; value: number; icon: React.ReactNode; accent?: boolean; danger?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-5 border ${
        danger ? "border-destructive/30 bg-destructive/5"
          : accent ? "border-primary/30 bg-primary/5"
          : "border-border bg-card"
      }`}
    >
      <div className={`flex items-center gap-2 text-sm ${
        danger ? "text-destructive" : accent ? "text-primary" : "text-muted-foreground"
      }`}>
        {icon} {label}
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}

function ArrivalCard({ a, onChange }: { a: Arrival; onChange: (estado: string) => void }) {
  const isUrg = a.tipo_llegada === "URGENCIA / SIN TURNO";
  const isFirst = a.tipo_paciente === "Primera atención";
  const time = new Date(a.created_at).toLocaleTimeString("es-AR", {
    hour: "2-digit", minute: "2-digit",
  });
  const estadoColor =
    a.estado === "Atendido" ? "bg-success/15 text-success border-success/30"
    : a.estado === "Cancelado" ? "bg-muted text-muted-foreground border-border"
    : "bg-warning/15 text-warning-foreground border-warning/40";

  return (
    <div
      className={`rounded-2xl border bg-card p-5 grid grid-cols-12 gap-4 items-center ${
        isUrg ? "border-destructive/40 bg-destructive/5" : "border-border"
      }`}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="col-span-12 md:col-span-2">
        <div className="text-2xl font-bold tabular-nums">{time}</div>
        {isUrg ? (
          <Badge className="mt-1 bg-destructive text-destructive-foreground hover:bg-destructive">
            <AlertTriangle className="h-3 w-3 mr-1" /> Urgencia
          </Badge>
        ) : (
          <Badge variant="secondary" className="mt-1">Turno programado</Badge>
        )}
      </div>

      <div className="col-span-12 md:col-span-4">
        <div className="text-lg font-semibold text-foreground">
          {a.nombre_apellido ?? "Paciente existente"}
        </div>
        <div className="text-sm text-muted-foreground">DNI {a.dni}</div>
        {isFirst && (
          <Badge className="mt-1 bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">
            <Sparkles className="h-3 w-3 mr-1" /> Primera atención
          </Badge>
        )}
      </div>

      <div className="col-span-6 md:col-span-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Atención</div>
        <div className="font-medium">{a.tipo_atencion}</div>
        {a.tipo_atencion === "Obra social" && (
          <div className="text-sm text-muted-foreground">{a.cobertura ?? "—"}</div>
        )}
      </div>

      <div className="col-span-6 md:col-span-3 flex flex-col items-stretch gap-2">
        <span className={`px-3 py-1 rounded-full text-xs font-semibold border self-start ${estadoColor}`}>
          {a.estado}
        </span>
        <Select value={a.estado} onValueChange={onChange}>
          <SelectTrigger className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
