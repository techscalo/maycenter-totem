# Maycenter Tótem — Migración a Neon + nuevas features

## Decisiones tomadas
- **Base de datos**: migrar full de Supabase → **Neon** (Postgres). Branch `main` (prod) + branch `staging`.
- **ORM**: Drizzle ORM + driver `@neondatabase/serverless`.
- **Auth**: Better Auth (sesiones server-side, Postgres nativo, roles) — reemplaza Supabase Auth.
- **Autorización**: la RLS de Supabase se reimplementa como checks en server functions (ya no hay `auth.uid()`).

## Stack objetivo
TanStack Start (SSR) · Drizzle · Neon · Better Auth · TanStack Query · shadcn/ui

---

## Fase 0 — Infra Neon (base de la migración)
- [x] Proyecto Neon confirmado: `maycenter-totem` (divine-bar-51599272), org Tech Scalo, región sa-east-1, PG18
- [x] Branch `staging` creado (br-holy-base-acinukhp), derivado de `production` (br-old-art-acqwf5vd)
- [x] Connection strings obtenidas (prod + staging)
- [x] `.gitignore`: `.env`/`.env.*` ignorados (excepto `.env.example`); `.env` sacado del tracking
- [x] `.env.local` (placeholders) + `.env.example` (plantilla versionable)
- [x] Instalar deps: `drizzle-orm@0.45`, `drizzle-kit@0.31`, `@neondatabase/serverless@1.1`, `better-auth@1.6`
- [x] Config `drizzle.config.ts` + cliente `src/db/client.ts` (neon-http)

## Fase 1 — Schema en Drizzle (rediseño) ✅
- [x] Tablas portadas a Drizzle: `sucursales`, `profiles`, `user_roles`, `pisos`, `odontologos`, `obras_sociales`, `nomencladores`
- [x] **Rediseño prestaciones (tarea 3 y 8)**: cabecera + líneas
  - `atenciones` (cabecera): fecha, paciente, dni, sucursal, obra_social, piso, odontologo, **codigo_consulta**, **primera_vez**, observaciones, created_by
  - `atencion_items` (líneas): atencion_id, nomenclador_id / servicio_particular_id, cantidad, monto, monto_usd, cotizacion_usd
- [x] **Catálogo particulares USD (tarea 7)**: tabla `servicios_particulares`
- [x] Migración generada (`drizzle/0000_init_neon.sql`) y aplicada en branch `staging` (10 tablas + seed CABA/La Plata/PARTICULAR)
- [x] Typecheck OK

## Fase 2 — Migración de datos ✅ (N/A)
- [x] Schema + seed aplicados también en `main` (ex-`production`, renombrada en Neon). 10 tablas + CABA/La Plata/PARTICULAR
- [x] Verificación Supabase: sin `service_role` no se puede leer (RLS); usuario confirma que no hay datos ni acceso → **no hay datos para migrar**
- Nota: si más adelante aparece la service_role key, se puede reabrir y exportar.

## Fase 3 — Auth (Better Auth) ✅
- [x] `src/lib/auth.ts`: betterAuth + drizzleAdapter(pg) + emailAndPassword + tanstackStartCookies; hook que crea `profile` al registrar usuario (reemplaza handle_new_user)
- [x] Schema de auth generado por CLI (`src/db/auth-schema.ts`: user/session/account/verification) + tablas creadas en `staging` y `main`
- [x] Ruta catch-all `src/routes/api.auth.$.ts` (auth.handler)
- [x] `src/lib/auth-client.ts` (createAuthClient) + `src/lib/gestion/auth-server.ts` (getUserContext: perfil+roles+sucursal desde Neon)
- [x] Reescritos: `gestion.login.tsx`, `_app.tsx`, `use-auth.ts`, `Shell.tsx` (logout)
- [x] Typecheck OK + **verificado end-to-end**: sign-up/get-session/sign-in 200, profile autocreado en Neon
- [ ] Migrar usuarios existentes: N/A (Supabase sin datos accesibles) → se crean nuevos desde el login

## Fase 4 — Data layer (reemplazar supabase.from) ✅
- [x] Capa de datos `src/lib/gestion/data.server.ts`: server functions con Drizzle + autorización por rol/sucursal (ex-RLS). Catálogos (read + ABM admin) + listPrestaciones (vista plana) + createAtencion/update/delete + servicios particulares + arrivals
- [x] `users.functions.ts` reescrito con Better Auth (hash propio `auth.$context.password.hash` + Drizzle): crear/listar/actualizar/borrar usuarios + reset password + roles
- [x] Migradas todas las rutas: home, dashboard, prestaciones (lista), nueva, reportes diario/ioma, **admin** (todos los tabs), **tótem** (`index`), **recepción** (`recepcion`, realtime → polling 10s)
- [x] Tabla `arrivals` agregada al schema y a `staging`+`main`
- [x] `start.ts` limpio (sin bearer middleware de Supabase; Better Auth usa cookies)
- [x] **Borrado `src/integrations/supabase/*`** — cero referencias a supabase en src
- [x] Typecheck limpio + smoke test (tótem/recepción/login 200, sin errores SSR)
- Nota: `npm run build` (prod) **compila OK** (genera dist/client + dist/server). El error previo de `node:stream` no se reproduce con el estado actual del proyecto.

## Fase 5 — Features funcionales ✅
- [x] **T2** Selector de "clínica activa" en el sidebar (persistido en localStorage), usado como default en Nueva prestación. La asignación de sucursal por usuario se hace desde Admin → Usuarios
- [x] **T3** Form multi-línea: varias prestaciones por paciente (líneas, código+monto auto por línea)
- [x] **T4** Página "Odontólogos" en el sidebar (listado con búsqueda/filtro + alta/baja para admin)
- [x] **T5/T6** OS → códigos con precio en ARS (ya existía, portado)
- [x] **T7** Particulares: catálogo `servicios_particulares` (USD) + ABM en Admin + selector en Nueva
- [x] **T8** Código de consulta + check "Primera vez" en la cabecera de atención

## Pendientes para el usuario / deploy
- Completar `.env.local` con `DATABASE_URL` real (staging) + `BETTER_AUTH_SECRET` para correr local.
- Asignar rol `admin` al primer usuario registrado (por MCP o, si ya hay un admin, desde Admin → Usuarios).
- Resolver el build de producción (node:stream / target Cloudflare) antes de deployar.
- Las server fns de `arrivals` (tótem/recepción) son públicas a propósito (paridad con el comportamiento anterior); evaluar si recepción debería requerir login.

## Ya resuelto (no requiere trabajo)
- T5 (OS → códigos con precio) y T6 (OS en ARS de lista) ya funcionan; solo se portan al nuevo data layer.

---

## Notas / riesgos
- Migrar auth obliga a re-onboarding de usuarios (passwords no migran de Supabase).
- El rediseño cabecera+items rompe los reportes actuales → hay que ajustarlos (Fase 4).
- Hacer TODO sobre branch `staging` de Neon antes de tocar prod.

## Resultado
Migración a Neon + features base completadas (commit 3d014d1).

---

# Post-reu Juli (23/07/2026) — Arreglos y mejoras

Plan: `~/.claude/plans/replicated-puzzling-salamander.md`. Feedback de Juli probando el sistema.

## Fase A — Bugs de reportes (crítico)
- [x] A1. Monto × cantidad en todos los agregados (helper `reportes.ts`) — diario, dashboard, ioma + exports
- [x] A2. Facturable separa "Facturado" (facturable=true) vs "Producción" (todo) en diario + dashboard

## Fase B — Usabilidad
- [x] B1. Buscador en Nomencladores/Particulares del Admin (el de prestaciones ya buscaba por DNI)
- [x] B2. Widget "Pacientes nuevos" (primera_vez) en Dashboard + desglose por obra social

## Fase C — Piso en tótem (2 pisos CABA)
- [x] C1. Schema: `arrivals.pisoId` + migración `0007` (pendiente aplicar en Neon)
- [x] C2. Tótem lee `?piso=<id>` de la URL; createArrival/listArrivals con piso
- [x] C3. RecepcionPanel filtra por piso + muestra piso (doc URLs para Jota: `/?piso=<uuid>`)

## Fase D — Base de pacientes + ficha
- [x] D1. Schema `pacientes` (dni unique) + migración `0007` con backfill (pendiente aplicar en Neon)
- [x] D2. Upsert paciente en createAtencion + autocomplete por DNI (onBlur) en Nueva
- [x] D3. Página Pacientes (listado + ficha `$dni` con historial) + item en sidebar

## Resultado post-reu
**Código completo (A/B/C/D), `tsc --noEmit` limpio.** Falta operativo:

1. **Migración `drizzle/0007_piso_arrivals_pacientes.sql`**: ✅ APLICADA en `staging`
   (pacientes creada + arrivals.piso_id + 17 pacientes backfilleados). **Falta aplicarla en
   `main`** (prod) con el mismo script idempotente cuando se valide. Ojo: el `meta` de drizzle
   está desincronizado (0005/0006 a mano sin snapshot); `drizzle-kit generate` regenera objetos
   ya existentes — NO usar su salida, usar el `0007` manual (dividir por `--> statement-breakpoint`
   y correr cada statement con el driver neon).
2. **Verificación funcional con datos** (`npm run dev` + login): cargar atención con
   `cantidad=3 @ $40k` + una línea `no facturable` → Diario "Facturado" $120k, "Producción"
   incluye la no-facturable; Dashboard/IOMA coherentes. Probar autocomplete por DNI y ficha.
3. **Tótem 2 pisos → Jota**: cada tablet abre `https://<totem>/?piso=<uuid-del-piso>` (los UUID
   salen de Admin → Pisos). Recepción filtra por piso.

### Cambios de esta tanda
- Nuevo `src/lib/gestion/reportes.ts` (montoLinea / montoUsdLinea / esFacturable).
- Reportes diario/dashboard/ioma + listado prestaciones: monto × cantidad; facturado vs producción.
- Dashboard: KPI + gráfico de pacientes nuevos por obra social.
- Admin: buscador en Nomencladores y Particulares.
- `arrivals.pisoId` + tótem lee `?piso=`; RecepcionPanel filtra/muestra piso.
- Tabla `pacientes` + upsert por DNI + autocomplete + páginas `/gestion/pacientes` y ficha.

---

# Tanda 2 — Ajustes post-demo (24/07/2026)

## Hechos (staging migrado, tsc limpio)
- [x] Reporte diario: KPIs Facturado/Producción con íconos + hints; grupos por odontólogo **colapsables**.
- [x] Ficha paciente: columna **Precio unit.** además de Total.
- [x] Nueva prestación: si el DNI no existe → auto **Primera vez**; si existe → autocompleta y desmarca.
- [x] Configuración (ex "Administración"): renombrada; buscadores con lupa+contador; acceso **admin/dirección/administrativo**; tab **Usuarios solo admin**.
- [x] Pacientes: filtrado por **sucursal activa** (deriva de atenciones).
- [x] Sucursales: "La Plata" → **"La Plata Calle 10"** + nueva **"La Plata Diagonal 77"**; columna `slug` (caba/calle10/diag77). Migración `0008` aplicada a staging.
- [x] Tótem: nuevo esquema URL **`?clinica=<slug>&piso=<nombre>`** (ej `?clinica=caba&piso=3`); `arrivals.sucursal_id`; createArrival resuelve slug+piso server-side; Recepción scopeada por **sucursal activa**.

## Pendiente
- [ ] Aplicar migraciones **0007 y 0008 en `main`** (prod) cuando se valide staging (script idempotente).
- [ ] Crear pisos de La Plata (Calle 10 / Diagonal 77) desde Configuración → Pisos.
## Fase GHL — Turnos del día en Recepción (MVP CABA) ✅
- [x] Tabla `turno_asistencias` (migración `0009`, aplicada staging) — check de asistencia local.
- [x] `src/lib/gestion/ghl.server.ts`: config por slug (env `GHL_CABA_LOCATION_ID`/`GHL_CABA_PIT`), fetch, calendarios (cache 5min), eventos del día (Promise.all), resolución de contactos; server fns `getTurnosDelDia` + `marcarAsistenciaTurno`.
- [x] `TurnosDelDia.tsx` + Recepción con tabs (Turnos del día / Llegadas). Scope por sucursal activa; La Plata muestra aviso "solo CABA".
- [x] Validado con datos reales (19 turnos CABA hoy, contactos resueltos).

### Tabla de turnos — mejoras (24/07) ✅
- [x] Columna DNI (custom field GHL `rjdIgjhi3iPZFpRVDP7h` en CABA).
- [x] Columna "Ingresó" (cruce por DNI con llegadas del tótem del día → muestra estado).
- [x] Columna "Agendado por" (GHL `createdBy.userId` → nombre vía `/users/{id}`) + origen; **Autoagenda** detectada por `createdBy.source`.
- [x] Filtros (buscador texto + "solo los que ingresaron") y orden por columna (clickeable asc/desc).
- [x] Botón link a la ficha del contacto en GHL (`/v2/location/{loc}/contacts/detail/{id}`).
- [x] Recepción: default **Orden de llegada (tótem)**, secundaria Turnos del día.

### Asistencia escribe en GHL (24/07) ✅
- [x] Marcar **Asistió** → `PUT /calendars/events/appointments/{id}` `{appointmentStatus:"showed"}`; **Ausente** → `noshow`. Guarda también local (`turno_asistencias`); si el PUT falla, no persiste local + toast de error. UI con botones Asistió/Ausente (3 estados: sin marcar/asistió/ausente). Endpoint verificado (test reversible OK).
- [x] Inicio: widgets "Recepción de hoy" (turnos del día, esperando, atendidos). Columna "Profesional"→"Agenda".

### Pendiente GHL
- [ ] Aplicar migración `0009` en `main` + cargar env `GHL_CABA_*` en Vercel.
- [ ] La Plata (Calle 10 / Diag 77): mapeo profesional→edificio.

### Fase migración de pacientes GHL → `pacientes` (planificar, CABA primero)
- Cargar contactos de GHL con **Estado = "Cliente-R" o "Cliente-F"** (custom field Estados CABA `8QI79ujL3Y7BO3M5scAf`) a la tabla `pacientes`, asignados a la clínica que corresponde.
- Si un contacto NO tiene ese estado pero **tiene turno** → probable paciente nuevo (marcar/derivar como tal).
- Traer DNI (`rjdIgjhi3iPZFpRVDP7h`), nombre, teléfono, obra social (`J1dLEUewkTaqVthYDOak`). Dedup por DNI (upsert). Definir volumen y correr con dry-run primero.

---

# Plan de integración (28/07/2026) — 3 features

Plan aprobado: `~/.claude/plans/elegant-finding-toucan.md`. Decisiones: permisos por cuenta con preset por rol, granularidad páginas+acciones, audit de crear/editar/borrar, config GHL por env. Orden de entrega: F3 → F1 → F2.

## Feature 3 — Calendarios GHL Calle 10 + Diagonal 77 ✅ (código + staging)
- [x] `ghl.server.ts`: `ghlConfigForSlug` como mapa slug→{locEnv,pitEnv,dniField} (caba/calle10/diag77).
- [x] Throttle `mapLimit(cals, 6)` en `listDayEvents` — 31 cals Calle10 / 17 Diag77 → evita 429.
- [x] Env `GHL_LAPLATA_*` + `GHL_DIAG77_*` en `.env` + `.env.example`. PITs verificadas vigentes 28/07. **Falta cargarlas en Vercel.**
- [x] Slugs DB confirmados (`caba`/`calle10`/`diag77`). Validar turnos reales en Recepción (con sesión).

## Feature 1 — Registro de cambios (audit log) ✅ (código + staging)
- [x] Tabla `audit_log` (migración `0011`, aplicada staging) + `schema.ts`.
- [x] `audit.server.ts`: `logAudit(ctx, {...})` (no lanza) + `listAuditLog` + `listAuditActores`.
- [x] Instrumentadas mutaciones de prestaciones/precios/odontólogos/OS/sucursales/pisos/usuarios/asistencia.
- [x] Página `/gestion/registro` (tabla + filtros usuario/sección/acción/fechas) + item en NAV.

## Feature 2 — Accesos por cuenta ✅ (código + staging)
- [x] 2a: `SucursalesChecklist` (multi-sede) en alta + editor; "Ambas"→"Todas".
- [x] 2b: `permissions.ts` (RESOURCES + ROLE_PRESETS + `can`/`effectivePermissions`) + tabla `user_permissions` (migración `0012`, staging).
- [x] 2b: `session.server.ts` expone `permisos` + `requirePermission`; enforcement en prestaciones (create/edit/delete).
- [x] 2b: `getUserContext`+`use-auth` exponen `permisos`/`can()`; NAV + guards de ruta (`PermissionGate`) por permiso.
- [x] 2b: editor de matriz recurso×acción por usuario + "aplicar preset del rol" en Configuración → Usuarios.

**tsc limpio + smoke (home/login/registro 200).** Doc de testing: `~/Desktop/maycenter-totem-QA.md`.

### Pendiente operativo de esta tanda
- [ ] Cargar en **Vercel** las 4 env `GHL_LAPLATA_*` / `GHL_DIAG77_*`.
- [ ] Aplicar migraciones **0011 y 0012 en `main`** (prod) al validar staging (`scripts/apply-migration.mjs`).
- [ ] (Mejora opcional) ocultar botones crear/editar/borrar dentro de cada página según `can()` — hoy el candado real está en NAV + guards + backend; si un usuario fuerza la acción, el backend la rechaza.

## Deuda previa relevante (bloquea validación end-to-end)
- [ ] Migraciones **0007, 0008, 0009 pendientes en `main`** (prod) — aplicar con script idempotente al validar staging.

---

# Mejoras UI Recepción + bug + sidebar (30/07/2026) ✅ (código + staging, tsc limpio)
Plan: `~/.claude/plans/elegant-finding-toucan.md`.
- [x] Estado de flujo del turno (🟡 recepción / 🔵 consultorio / 🟢 finalizado / ⚫ ausente) reemplaza asistió/ausente. Migración `0013` (col `estado` + backfill) aplicada staging. GHL: finalizado→showed, ausente→noshow; intermedios no tocan GHL. `marcarAsistenciaTurno`→`marcarEstadoTurno`.
- [x] Columnas configurables (dropdown, persiste en localStorage); DNI y "Agendado por" ocultas por defecto.
- [x] Filtros nuevos: por agenda y por estado (+ fecha/buscar; buscar ahora incluye obra social y teléfono).
- [x] Columnas nuevas: **Obra social** (custom field GHL por sede) y **Hora de llegada** (check-in del tótem).
- [x] Vinculación tótem→lista: check-in en tótem marca el turno 🟡 En recepción automático (estado efectivo derivado del arrival).
- [x] Bug carga prestación: inputs cantidad/monto permiten vaciar (antes `|| 1`/`|| 0` forzaba el valor).
- [x] Sidebar: ya colapsa a íconos (sin cambios; cumple lo pedido).

### Pendiente
- [ ] Aplicar migración `0013` en **`main`** al validar staging.
- [ ] Verificar en navegador el flujo de estados + reflejo showed/noshow en GHL.

---

# Tanda Recepción (10/08/2026) — 3 features

Decisiones: "En sala" = hora de **ingreso a la sala de atención**, distinta del ingreso a la clínica (tótem). Mapea al estado `en_consultorio`, cuyo label se renombra a **"En sala"**. Turno manual con odontólogo desde la tabla `odontologos`. DNI obligatorio + validación de formato en toda carga con paciente.

## Tarea 1 — Hora de ingreso a sala (campo nuevo) ✅
- [x] Migración `0014`: `turno_asistencias.sala_at timestamptz` (idempotente). Aplicada + columna verificada en DB.
- [x] `marcarEstadoTurno`: al marcar `en_consultorio` estampa `sala_at = now()` una sola vez (`coalesce`, no pisa). Verificado con fila de prueba (recepción→sala→finalizado mantiene la hora).
- [x] `getTurnosDelDia`: expone `salaHora` (TZ Argentina).
- [x] `TurnosDelDia.tsx`: nueva columna **"Ingreso a sala"** + label `en_consultorio` → "En sala".
- [x] `tsc --noEmit` limpio.
- [ ] Verificar en navegador con un turno real (marcar "En sala" y ver la hora en la columna).
- [ ] Aplicar `0014` en **`main`** al validar (ojo: staging = prod comparten DB, ya impactó prod).

## Tarea 2 — Turno manual (sin GHL) ✅
- [x] Migración `0015`: tabla `turnos_manuales`. Aplicada + columnas verificadas en DB.
- [x] Server fns (`ghl.server.ts`): `crearTurnoManual`, `marcarEstadoTurnoManual`, `eliminarTurnoManual` + audit.
- [x] `getTurnosDelDia` fusiona GHL + manuales (discriminante `tipo: 'ghl'|'manual'`, `rowId`). Trae manuales aunque la sucursal no tenga GHL.
- [x] UI `TurnosDelDia.tsx`: botón "Agregar turno" + `NuevoTurnoDialog`; odontólogo desde `listOdontologos`, OS desde `listObrasSociales`; autocomplete por DNI; refactor tabla (key por `rowId`, estado por tipo, eliminar para manuales).
- [x] `tsc` limpio + flujo de estados manual verificado (llegada/sala se estampan una vez).
- [ ] Verificar en navegador (crear turno, marcar estados, eliminar).
- [ ] Aplicar `0015` en **`main`** al validar.

## Tarea 3 — DNI obligatorio + formato ✅
- [x] Helper compartido `src/lib/dni.ts` (`isValidDni`/`normalizeDni`/`DNI_ERROR`, 6–9 dígitos).
- [x] Aplicado en turno manual (required + formato, cliente + server).
- [x] Tótem: `createArrival` usa `dniField`; form valida 6–9 dígitos.
- [x] Prestaciones: `createAtencion` + `updateAtencionCabecera` usan `dniField`; form valida + hint inline.
- [x] `tsc` limpio.
- [ ] Verificar en navegador.

## Pendiente operativo (las 3 tareas)
- [x] Deployado a prod (merge `4c8dd76`) + `0014`/`0015` en la DB compartida.

---

# Tanda Recepción 2 (11/08/2026) — sincronización GHL + observaciones

Decisiones: espejo bidireccional de estados; showed→Finalizado / noshow→Ausente al leer de GHL; observaciones = custom field del contacto (creado también en La Plata).

## Ajuste 1 — Estados escriben a GHL (los 4) ✅
- [x] `marcarEstadoTurno`: en_recepcion/en_consultorio/finalizado → `showed`; ausente → `noshow` (antes solo los finales). Verificado reversible contra GHL real.

## Ajuste 2 — Espejo GHL → sistema ✅
- [x] `estadoDesdeGhl`: showed→finalizado, noshow→ausente. Estado efectivo por prioridad: marca local → check-in tótem → estado GHL → sin marcar.

## Ajuste 3 — Columna Observaciones ✅
- [x] Custom field GHL: CABA `RNgqB0yQSDM1LxeS7IRc`; La Plata creado `iPovCNTHMScBeLHsFAEc` (calle10/diag77).
- [x] `GhlConfig.obsField` + `resolveContactos` extrae observaciones; expuesto en el turno. Manuales: observaciones = motivo.
- [x] `TurnosDelDia.tsx`: columna "Observaciones" toggle (oculta por defecto, en el menú Columnas).
- [x] `tsc` limpio.

### Pendiente
- [ ] Verificar en navegador (dev 8080): marcar estados y ver reflejo en GHL; columna Observaciones con un contacto que tenga el campo cargado.
- [ ] Commit + deploy a `main` cuando Dylan valide.
- [ ] (Opcional) actualizar página de Ayuda con la sync de estados y la columna Observaciones.
