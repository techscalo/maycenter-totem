import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecepcionPanel } from "@/components/gestion/RecepcionPanel";
import { TurnosDelDia } from "@/components/gestion/TurnosDelDia";
import { MetricasPanel } from "@/components/gestion/MetricasPanel";

import { PermissionGate } from "@/components/gestion/PermissionGate";

const TABS = ["llegadas", "turnos", "metricas"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_app/gestion/recepcion")({
  // Deep-link por query (?tab=llegadas|turnos|metricas) para poder compartir/abrir
  // directo una pestaña. `tab` opcional: sin él, default llegadas (así los links al
  // módulo desde el sidebar no necesitan pasar search).
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({
    tab: TABS.includes(s.tab as Tab) ? (s.tab as Tab) : undefined,
  }),
  component: () => (
    <PermissionGate resource="recepcion">
      <RecepcionPage />
    </PermissionGate>
  ),
});

function RecepcionPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <div className="max-w-7xl mx-auto">
      <Tabs
        value={tab ?? "llegadas"}
        onValueChange={(v) => navigate({ to: "/gestion/recepcion", search: { tab: v as Tab } })}
      >
        <TabsList className="mb-4">
          <TabsTrigger value="llegadas">Orden de llegada (tótem)</TabsTrigger>
          <TabsTrigger value="turnos">Turnos del día</TabsTrigger>
          <TabsTrigger value="metricas">Métricas</TabsTrigger>
        </TabsList>
        <TabsContent value="llegadas">
          <RecepcionPanel />
        </TabsContent>
        <TabsContent value="turnos">
          <TurnosDelDia />
        </TabsContent>
        <TabsContent value="metricas">
          <MetricasPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
