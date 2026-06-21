import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// Roles de la app (ex-Supabase app_role)
export const appRole = pgEnum("app_role", [
  "admin",
  "administrativo",
  "direccion",
  "odontologo",
]);

// Clínicas / sucursales
export const sucursales = pgTable("sucursales", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Perfil del usuario (user_id = id del usuario de Better Auth)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  nombre: text("nombre"),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Roles por usuario
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    role: appRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userRoleUq: uniqueIndex("user_roles_user_role_uq").on(t.userId, t.role),
  }),
);

// Pisos por sucursal
export const pisos = pgTable(
  "pisos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    sucursalId: uuid("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pisoSucursalUq: uniqueIndex("pisos_sucursal_nombre_uq").on(t.sucursalId, t.nombre),
  }),
);

// Obras sociales (flag es_particular)
export const obrasSociales = pgTable("obras_sociales", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull().unique(),
  activa: boolean("activa").notNull().default(true),
  esParticular: boolean("es_particular").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Odontólogos
export const odontologos = pgTable("odontologos", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  numeroOd: text("numero_od"),
  pisoId: uuid("piso_id").references(() => pisos.id, { onDelete: "set null" }),
  sucursalId: uuid("sucursal_id")
    .notNull()
    .references(() => sucursales.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Nomenclador: códigos + precio (ARS) por obra social
export const nomencladores = pgTable(
  "nomencladores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    obraSocialId: uuid("obra_social_id")
      .notNull()
      .references(() => obrasSociales.id, { onDelete: "cascade" }),
    codigo: text("codigo").notNull(),
    descripcion: text("descripcion").notNull(),
    monto: numeric("monto", { precision: 12, scale: 2 }).notNull().default("0"),
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nomencladorOsCodigoUq: uniqueIndex("nomencladores_os_codigo_uq").on(
      t.obraSocialId,
      t.codigo,
    ),
    nomencladorOsIdx: index("idx_nomencladores_os").on(t.obraSocialId),
  }),
);

// Catálogo de servicios particulares (precio en USD), lista aparte de obras sociales
export const serviciosParticulares = pgTable("servicios_particulares", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo"),
  descripcion: text("descripcion").notNull(),
  precioUsd: numeric("precio_usd", { precision: 12, scale: 2 }).notNull().default("0"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Cabecera de atención (un paciente por visita)
export const atenciones = pgTable(
  "atenciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fecha: date("fecha").notNull().defaultNow(),
    paciente: text("paciente").notNull(),
    dni: text("dni").notNull(),
    sucursalId: uuid("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "restrict" }),
    obraSocialId: uuid("obra_social_id")
      .notNull()
      .references(() => obrasSociales.id, { onDelete: "restrict" }),
    pisoId: uuid("piso_id").references(() => pisos.id, { onDelete: "set null" }),
    odontologoId: uuid("odontologo_id")
      .notNull()
      .references(() => odontologos.id, { onDelete: "restrict" }),
    codigoConsulta: text("codigo_consulta"),
    primeraVez: boolean("primera_vez").notNull().default(false),
    observaciones: text("observaciones"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    atencionesFechaIdx: index("idx_atenciones_fecha").on(t.fecha),
    atencionesSucursalIdx: index("idx_atenciones_sucursal").on(t.sucursalId),
    atencionesDniIdx: index("idx_atenciones_dni").on(t.dni),
  }),
);

// Llegadas del tótem de recepción (público escribe, recepción gestiona)
export const arrivals = pgTable(
  "arrivals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tipoLlegada: text("tipo_llegada").notNull(),
    tipoPaciente: text("tipo_paciente").notNull(),
    tipoAtencion: text("tipo_atencion").notNull(),
    cobertura: text("cobertura"),
    nombreApellido: text("nombre_apellido"),
    dni: text("dni").notNull(),
    estado: text("estado").notNull().default("Pendiente"),
  },
  (t) => ({
    arrivalsCreatedIdx: index("idx_arrivals_created").on(t.createdAt),
  }),
);

// Líneas de la atención (varias prestaciones por paciente)
export const atencionItems = pgTable(
  "atencion_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atencionId: uuid("atencion_id")
      .notNull()
      .references(() => atenciones.id, { onDelete: "cascade" }),
    nomencladorId: uuid("nomenclador_id").references(() => nomencladores.id, {
      onDelete: "set null",
    }),
    servicioParticularId: uuid("servicio_particular_id").references(
      () => serviciosParticulares.id,
      { onDelete: "set null" },
    ),
    codigoManual: text("codigo_manual"),
    descripcionManual: text("descripcion_manual"),
    cantidad: integer("cantidad").notNull().default(1),
    monto: numeric("monto", { precision: 12, scale: 2 }).notNull().default("0"),
    montoUsd: numeric("monto_usd", { precision: 12, scale: 2 }),
    cotizacionUsd: numeric("cotizacion_usd", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    atencionItemsAtencionIdx: index("idx_atencion_items_atencion").on(t.atencionId),
  }),
);
