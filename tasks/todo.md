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
_(completar al finalizar)_
