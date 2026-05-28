import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GestionShell } from "@/components/gestion/Shell";
import { useSupabaseUser } from "@/lib/gestion/use-auth";

export const Route = createFileRoute("/_app")({
  component: ProtectedLayout,
});

function ProtectedLayout() {
  const user = useSupabaseUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (user === null) {
      navigate({ to: "/gestion/login" });
    }
  }, [user, navigate]);

  if (user === undefined) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">
        Cargando…
      </div>
    );
  }
  if (user === null) return null;

  return (
    <GestionShell>
      <Outlet />
    </GestionShell>
  );
}
