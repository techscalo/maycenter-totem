import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { getUserContext, type AppRole } from "./auth-server";

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

  // undefined = cargando, null = sin usuario
  const user = isPending ? undefined : (session?.user ?? null);

  return {
    user,
    profile: ctx?.profile ?? null,
    roles,
    sucursales: ctx?.sucursales ?? [],
    isAdmin: roles.includes("admin"),
    isDireccion: roles.includes("direccion"),
    isStaff: roles.includes("admin") || roles.includes("direccion"),
    isLoading: isPending || (!!session?.user && query.isLoading),
  };
}
