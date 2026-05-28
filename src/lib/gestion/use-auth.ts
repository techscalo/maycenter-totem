import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "administrativo" | "direccion" | "odontologo";

export function useSupabaseUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (mounted) setUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUser(data.session?.user ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return user; // undefined = loading, null = no user
}

export function useUserContext() {
  const user = useSupabaseUser();

  const query = useQuery({
    enabled: !!user,
    queryKey: ["user-context", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*, sucursales(id, nombre)").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      return {
        profile,
        roles: (roles ?? []).map((r) => r.role as AppRole),
      };
    },
  });

  const roles = query.data?.roles ?? [];
  return {
    user,
    profile: query.data?.profile ?? null,
    roles,
    isAdmin: roles.includes("admin"),
    isDireccion: roles.includes("direccion"),
    isStaff: roles.includes("admin") || roles.includes("direccion"),
    isLoading: user === undefined || query.isLoading,
  };
}
