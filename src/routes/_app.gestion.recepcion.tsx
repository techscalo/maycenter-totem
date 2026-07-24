import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecepcionPanel } from "@/components/gestion/RecepcionPanel";
import { TurnosDelDia } from "@/components/gestion/TurnosDelDia";

export const Route = createFileRoute("/_app/gestion/recepcion")({
  component: RecepcionPage,
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
