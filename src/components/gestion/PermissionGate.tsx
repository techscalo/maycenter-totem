import { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useUserContext } from "@/lib/gestion/use-auth";
import type { Resource } from "@/lib/gestion/permissions";

// Envuelve una página: si el usuario no tiene el permiso, redirige a Inicio.
export function PermissionGate({
  resource,
  action = "view",
  children,
}: {
  resource: Resource;
  action?: string;
  children: ReactNode;
}) {
  const { can, isLoading } = useUserContext();
  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (!can(resource, action)) return <Navigate to="/gestion" />;
  return <>{children}</>;
}
