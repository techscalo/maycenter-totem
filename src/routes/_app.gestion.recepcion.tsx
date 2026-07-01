import { createFileRoute } from "@tanstack/react-router";
import { RecepcionPanel } from "@/components/gestion/RecepcionPanel";

export const Route = createFileRoute("/_app/gestion/recepcion")({
  component: RecepcionPanel,
});
