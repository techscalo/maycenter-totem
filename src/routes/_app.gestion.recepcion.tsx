import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecepcionPanel } from "@/components/gestion/RecepcionPanel";
import { TurnosDelDia } from "@/components/gestion/TurnosDelDia";

import { PermissionGate } from "@/components/gestion/PermissionGate";

export const Route = createFileRoute("/_app/gestion/recepcion")({
  component: () => (
    <PermissionGate resource="recepcion">
      <RecepcionPage />
    </PermissionGate>
  ),
});

function RecepcionPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <Tabs defaultValue="llegadas">
        <TabsList className="mb-4">
          <TabsTrigger value="llegadas">Orden de llegada (tótem)</TabsTrigger>
          <TabsTrigger value="turnos">Turnos del día</TabsTrigger>
        </TabsList>
        <TabsContent value="llegadas">
          <RecepcionPanel />
        </TabsContent>
        <TabsContent value="turnos">
          <TurnosDelDia />
        </TabsContent>
      </Tabs>
    </div>
  );
}
