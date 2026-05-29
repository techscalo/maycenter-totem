import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo administradores");
}

export const listGestionUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("user_id, nombre, sucursal_id, created_at, sucursales(nombre)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (profiles ?? []).map((p) => p.user_id);
    let rolesByUser: Record<string, string[]> = {};
    if (ids.length) {
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids);
      rolesByUser = (roles ?? []).reduce((acc, r: any) => {
        (acc[r.user_id] ||= []).push(r.role);
        return acc;
      }, {} as Record<string, string[]>);
    }
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    const emailByUser: Record<string, string> = {};
    (list?.users ?? []).forEach((u: any) => {
      emailByUser[u.id] = u.email ?? "";
    });
    return (profiles ?? []).map((p: any) => ({
      user_id: p.user_id,
      nombre: p.nombre,
      email: emailByUser[p.user_id] ?? "",
      sucursal_id: p.sucursal_id,
      sucursal_nombre: p.sucursales?.nombre ?? null,
      roles: rolesByUser[p.user_id] ?? [],
    }));
  });

export const createGestionUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(6).max(72),
      nombre: z.string().min(1).max(120),
      role: z.enum(["admin", "administrativo", "direccion", "odontologo"]),
      sucursal_id: z.string().uuid().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nombre: data.nombre },
    });
    if (error) throw new Error(error.message);
    const newId = created.user!.id;
    await supabaseAdmin
      .from("profiles")
      .update({ nombre: data.nombre, sucursal_id: data.sucursal_id ?? null })
      .eq("user_id", newId);
    await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: data.role });
    return { ok: true, user_id: newId };
  });

export const updateGestionUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      nombre: z.string().min(1).max(120).optional(),
      sucursal_id: z.string().uuid().nullable().optional(),
      role: z.enum(["admin", "administrativo", "direccion", "odontologo"]).optional(),
      new_password: z.string().min(6).max(72).optional(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (data.nombre !== undefined || data.sucursal_id !== undefined) {
      await supabaseAdmin
        .from("profiles")
        .update({
          ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
          ...(data.sucursal_id !== undefined ? { sucursal_id: data.sucursal_id } : {}),
        })
        .eq("user_id", data.user_id);
    }
    if (data.role) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
      await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
    }
    if (data.new_password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
        password: data.new_password,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteGestionUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) throw new Error("No podés eliminarte a vos mismo");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });