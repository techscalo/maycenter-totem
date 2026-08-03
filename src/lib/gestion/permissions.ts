// Catálogo de permisos página+acción y presets por rol.
// Un permiso es la clave `resource:action`. La presencia = permitido.
// Enforcement: el admin siempre puede todo (bypass). Si un usuario no tiene ninguna
// fila de permisos cargada, se usa el preset de su(s) rol(es) como fallback.

import type { AppRole } from "@/lib/gestion/auth-server";

export const RESOURCES = {
  inicio: ["view"],
  dashboard: ["view"],
  recepcion: ["view", "edit"],
  prestaciones: ["view", "create", "edit", "delete"],
  pacientes: ["view", "create", "edit", "delete"],
  odontologos: ["view", "create", "edit", "delete"],
  precios: ["view", "edit", "delete"],
  reporte_diario: ["view"],
  reporte_ioma: ["view"],
  registro: ["view"],
  configuracion: ["view", "edit"],
  usuarios: ["view", "create", "edit", "delete"],
} as const;

export type Resource = keyof typeof RESOURCES;
export type PermissionKey = string; // `${Resource}:${action}`

// Etiquetas legibles para la UI.
export const RESOURCE_LABELS: Record<Resource, string> = {
  inicio: "Inicio",
  dashboard: "Dashboard",
  recepcion: "Recepción",
  prestaciones: "Prestaciones",
  pacientes: "Pacientes",
  odontologos: "Odontólogos",
  precios: "Precios",
  reporte_diario: "Reporte diario",
  reporte_ioma: "Reporte IOMA",
  registro: "Registro de cambios",
  configuracion: "Configuración",
  usuarios: "Usuarios",
};

export const ACTION_LABELS: Record<string, string> = {
  view: "Ver",
  create: "Crear",
  edit: "Editar",
  delete: "Borrar",
};

// Todas las claves posibles (para admin / “seleccionar todo”).
export const ALL_PERMISSIONS: PermissionKey[] = Object.entries(RESOURCES).flatMap(
  ([resource, actions]) => actions.map((a) => `${resource}:${a}`),
);

// Presets por rol. Definen el default al crear un usuario y el fallback si un
// usuario no tiene permisos cargados. admin = todo (bypass en runtime).
export const ROLE_PRESETS: Record<AppRole, PermissionKey[]> = {
  admin: ALL_PERMISSIONS,
  direccion: [
    "inicio:view",
    "dashboard:view",
    "recepcion:view",
    "recepcion:edit",
    "prestaciones:view",
    "prestaciones:create",
    "prestaciones:edit",
    "prestaciones:delete",
    "pacientes:view",
    "pacientes:create",
    "pacientes:edit",
    "pacientes:delete",
    "odontologos:view",
    "odontologos:create",
    "odontologos:edit",
    "odontologos:delete",
    "precios:view",
    "precios:edit",
    "precios:delete",
    "reporte_diario:view",
    "reporte_ioma:view",
    "registro:view",
    "configuracion:view",
    "configuracion:edit",
  ],
  administrativo: [
    "inicio:view",
    "dashboard:view",
    "recepcion:view",
    "recepcion:edit",
    "prestaciones:view",
    "prestaciones:create",
    "prestaciones:edit",
    "prestaciones:delete",
    "pacientes:view",
    "pacientes:create",
    "pacientes:edit",
    "precios:view",
    "reporte_diario:view",
    "reporte_ioma:view",
    "configuracion:view",
  ],
  odontologo: ["inicio:view", "dashboard:view", "prestaciones:view", "pacientes:view"],
  recepcionista: ["recepcion:view", "recepcion:edit"],
};

// Permisos efectivos de un usuario: sus filas cargadas o, si no tiene ninguna,
// la unión de los presets de sus roles.
export function effectivePermissions(
  roles: AppRole[],
  loaded: PermissionKey[],
): Set<PermissionKey> {
  if (loaded.length > 0) return new Set(loaded);
  const set = new Set<PermissionKey>();
  for (const r of roles) for (const p of ROLE_PRESETS[r] ?? []) set.add(p);
  return set;
}

// ¿El usuario puede resource:action? admin siempre; si no, mira el set efectivo.
export function can(
  roles: AppRole[],
  perms: Set<PermissionKey>,
  resource: Resource,
  action: string,
): boolean {
  if (roles.includes("admin")) return true;
  return perms.has(`${resource}:${action}`);
}

export function presetForRole(role: AppRole): PermissionKey[] {
  return ROLE_PRESETS[role] ?? [];
}
