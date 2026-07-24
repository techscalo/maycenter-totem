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
