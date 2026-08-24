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
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Roles de la app (ex-Supabase app_role)
export const appRole = pgEnum("app_role", [
  "admin",
  "administrativo",
  "direccion",
  "odontologo",
  "recepcionista",
]);

// Clínicas / sucursales
export const sucursales = pgTable("sucursales", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull().unique(),
  // Slug corto para la URL del tótem (?clinica=caba). Único, opcional.
  slug: text("slug").unique(),
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

// Sucursales asignadas a cada usuario (acceso). 1 fila = una sede, 2 = ambas.
// Fuente de verdad del acceso por sede (reemplaza a profiles.sucursalId).
export const userSucursales = pgTable(
  "user_sucursales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    sucursalId: uuid("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userSucursalUq: uniqueIndex("user_sucursales_user_sucursal_uq").on(t.userId, t.sucursalId),
  }),
);

// Permisos página+acción por usuario. Presencia de fila = permitido. Si un usuario
// no tiene ninguna fila, en runtime se usa el preset de su rol (ver permissions.ts).
export const userPermissions = pgTable(
  "user_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    resource: text("resource").notNull(),
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userPermUq: uniqueIndex("user_permissions_uq").on(t.userId, t.resource, t.action),
    userPermUserIdx: index("idx_user_permissions_user").on(t.userId),
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
    // Plan dentro de la OS (ej. OSDE 2-310, Biomed RD superior). null = OS de precio único.
    plan: text("plan"),
    codigo: text("codigo").notNull(),
    descripcion: text("descripcion").notNull(),
    monto: numeric("monto", { precision: 12, scale: 2 }).notNull().default("0"),
    // Copago a cargo del paciente (solo OS con desglose O.S./Paciente, ej. Biomed). null = sin desglose.
    montoPaciente: numeric("monto_paciente", { precision: 12, scale: 2 }),
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // coalesce(plan,'') para que la unicidad funcione también cuando plan es null
    // (Postgres trata null != null en índices únicos por defecto).
    nomencladorOsCodigoUq: uniqueIndex("nomencladores_os_plan_codigo_uq").on(
      t.obraSocialId,
      sql`coalesce(${t.plan}, '')`,
      t.codigo,
    ),
    nomencladorOsIdx: index("idx_nomencladores_os").on(t.obraSocialId),
  }),
);

// Historial de cambios de precio (snapshot reversible de cada import/actualización masiva).
export const nomencladorPriceHistory = pgTable(
  "nomenclador_price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nomencladorId: uuid("nomenclador_id").references(() => nomencladores.id, {
      onDelete: "set null",
    }),
    obraSocialId: uuid("obra_social_id").references(() => obrasSociales.id, { onDelete: "cascade" }),
    codigo: text("codigo").notNull(),
    plan: text("plan"),
    montoOld: numeric("monto_old", { precision: 12, scale: 2 }),
    montoNew: numeric("monto_new", { precision: 12, scale: 2 }),
    copagoOld: numeric("copago_old", { precision: 12, scale: 2 }),
    copagoNew: numeric("copago_new", { precision: 12, scale: 2 }),
    actorUserId: text("actor_user_id"),
    actorNombre: text("actor_nombre"),
    source: text("source").notNull().default("import"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nphOsIdx: index("idx_nph_os").on(t.obraSocialId),
    nphCreatedIdx: index("idx_nph_created").on(t.createdAt),
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
    // Sucursal y piso de la llegada. El tótem los fija por query param en la URL
    // (cada tablet abre /?clinica=<slug>&piso=<nombre>). null = tótem sin configurar.
    sucursalId: uuid("sucursal_id").references(() => sucursales.id, { onDelete: "set null" }),
    pisoId: uuid("piso_id").references(() => pisos.id, { onDelete: "set null" }),
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
    // Copago a cargo del paciente (snapshot del nomenclador al cargar; editable).
    // Facturación a la obra social = monto - montoPaciente. null = sin desglose de copago.
    montoPaciente: numeric("monto_paciente", { precision: 12, scale: 2 }),
    montoUsd: numeric("monto_usd", { precision: 12, scale: 2 }),
    cotizacionUsd: numeric("cotizacion_usd", { precision: 12, scale: 2 }),
    // Para reportes de trabajos no facturables (pruebas, escaneos, impresiones).
    facturable: boolean("facturable").notNull().default(true),
    // Estado de placa MIO (impresion/entrega/reimpresion). null = no aplica.
    estadoPlaca: text("estado_placa"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    atencionItemsAtencionIdx: index("idx_atencion_items_atencion").on(t.atencionId),
  }),
);

// Asistencia a turnos de GHL, marcada localmente en Recepción (no escribe en GHL).
// Una fila por turno (ghl_event_id) cuya asistencia se registró.
export const turnoAsistencias = pgTable("turno_asistencias", {
  id: uuid("id").primaryKey().defaultRandom(),
  ghlEventId: text("ghl_event_id").notNull().unique(),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id, { onDelete: "set null" }),
  fecha: date("fecha").notNull(),
  // Deprecado en favor de `estado`; se conserva por compatibilidad de datos.
  asistio: boolean("asistio").notNull().default(true),
  // Flujo del turno: en_recepcion | en_consultorio | finalizado | ausente (null = sin marcar).
  estado: text("estado"),
  // Hora de ingreso a la sala de atención (se setea al marcar "En sala" / en_consultorio, una vez).
  // Distinta del ingreso a la clínica (arrivals.created_at del tótem).
  salaAt: timestamp("sala_at", { withTimezone: true }),
  marcadoPor: text("marcado_por"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Turnos cargados a mano en el sistema, sin vínculo con GHL. Se listan junto a los de GHL
// en "Turnos del día". Mismo flujo de estado (en_recepcion/en_consultorio/finalizado/ausente).
export const turnosManuales = pgTable(
  "turnos_manuales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sucursalId: uuid("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull(),
    hora: text("hora").notNull(), // "HH:MM"
    pacienteNombre: text("paciente_nombre").notNull(),
    dni: text("dni").notNull(),
    telefono: text("telefono"),
    obraSocialId: uuid("obra_social_id").references(() => obrasSociales.id, {
      onDelete: "set null",
    }),
    odontologoId: uuid("odontologo_id").references(() => odontologos.id, {
      onDelete: "set null",
    }),
    motivo: text("motivo"),
    estado: text("estado"),
    // Ingreso a la clínica y a la sala. Como el manual no pasa por el tótem, se estampan
    // al marcar "En recepción" / "En sala" respectivamente (una vez, no se pisan).
    llegadaAt: timestamp("llegada_at", { withTimezone: true }),
    salaAt: timestamp("sala_at", { withTimezone: true }),
    marcadoPor: text("marcado_por"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    turnosManualesFechaIdx: index("idx_turnos_manuales_fecha").on(t.sucursalId, t.fecha),
  }),
);

// Registro de cambios ("buchón"): una fila por alta/edición/baja de una entidad de negocio.
// actor_nombre es snapshot (no se pierde si el usuario se borra). meta = detalle libre.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id"),
    actorNombre: text("actor_nombre"),
    action: text("action").notNull(), // create | update | delete
    resource: text("resource").notNull(), // prestacion | paciente | precio | usuario | ...
    entityId: text("entity_id"),
    resumen: text("resumen"),
    meta: jsonb("meta"),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    auditCreatedIdx: index("idx_audit_created").on(t.createdAt),
    auditActorIdx: index("idx_audit_actor").on(t.actorUserId),
    auditResourceIdx: index("idx_audit_resource").on(t.resource),
  }),
);

// Ficha de paciente. Se puebla automáticamente al cargar atenciones (upsert por DNI) y
// habilita el autocompletado por DNI en la carga. Global (un paciente puede ir a cualquier sede).
export const pacientes = pgTable("pacientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  dni: text("dni").notNull().unique(),
  nombre: text("nombre").notNull(),
  telefono: text("telefono"),
  // Última obra social conocida (referencia, no histórico).
  obraSocialId: uuid("obra_social_id").references(() => obrasSociales.id, {
    onDelete: "set null",
  }),
  notas: text("notas"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
