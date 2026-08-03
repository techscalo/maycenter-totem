import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { getUserContext, type AppRole } from "./auth-server";
import { can as canPermission, type Resource } from "./permissions";

export type { AppRole };

export function useUserContext() {
  const { data: session, isPending } = useSession();

  const query = useQuery({
    enabled: !!session?.user,
    queryKey: ["user-context", session?.user?.id],
    queryFn: () => getUserContext(),
  });

  const ctx = query.data;
  const roles = ctx?.roles ?? [];
  const permisos = useMemo(() => new Set(ctx?.permisos ?? []), [ctx?.permisos]);

  // undefined = cargando, null = sin usuario
  const user = isPending ? undefined : (session?.user ?? null);

  // ¿El usuario puede resource:action? (admin siempre).
  const can = (resource: Resource, action: string) => canPermission(roles, permisos, resource, action);

  return {
    user,
    profile: ctx?.profile ?? null,
    roles,
    permisos,
    can,
    sucursales: ctx?.sucursales ?? [],
    isAdmin: roles.includes("admin"),
    isDireccion: roles.includes("direccion"),
    isRecepcionista: roles.includes("recepcionista"),
    isStaff: roles.includes("admin") || roles.includes("direccion"),
    isLoading: isPending || (!!session?.user && query.isLoading),
  };
}
