# Maycenter Tótem + Gestión Clínica

Aplicación de la clínica odontológica Maycenter. Combina un **tótem de recepción** (pantalla pública para que los pacientes anuncien su llegada) con un **panel de gestión** interno (prestaciones, reportes, catálogos y usuarios).

## Stack

- **Framework**: TanStack Start (React 19 + Vite, SSR) sobre Cloudflare Workers
- **Routing**: TanStack Router (file-based, naming plano con puntos)
- **Datos**: Neon (Postgres) + Drizzle ORM (driver `@neondatabase/serverless`)
- **Auth**: Better Auth (email + password, sesiones por cookie)
- **UI**: Tailwind + shadcn/ui + TanStack Query
- **Estado servidor**: TanStack Server Functions (RPC) — no hay API REST propia

## Cómo correr

```bash
npm install
# Configurar variables en .env (ver plantilla en .env.local)
npm run dev          # http://localhost:8080
```

### Variables de entorno (`.env`)

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Connection string de Neon (usar el branch **staging** en dev) |
| `BETTER_AUTH_SECRET` | Secreto de sesión (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | URL base de la app (`http://localhost:8080` en dev) |

`.env` y `.env.local` están en `.gitignore`. `.env.local` es solo **plantilla de referencia** para el equipo (valores de ejemplo).

### Base de datos (Neon)

- Proyecto: `maycenter-totem` · branches: **`main`** (prod) y **`staging`** (dev).
- Migraciones en `drizzle/` (generadas con `npx drizzle-kit generate`). El esquema vive en `src/db/schema.ts` y `src/db/auth-schema.ts`.

## Estructura de carpetas

```
src/
├── routes/                      # Rutas (file-based). El nombre del archivo define la URL.
│   ├── __root.tsx               # Layout raíz
│   ├── index.tsx                # "/"  → Tótem público
│   ├── recepcion.tsx            # "/recepcion" → Panel de recepción
│   ├── gestion.login.tsx        # "/gestion/login" → Login
│   ├── api.auth.$.ts            # "/api/auth/*" → Handler de Better Auth
│   ├── _app.tsx                 # Layout PROTEGIDO (gate de sesión) — todo lo de abajo cuelga de acá
│   ├── _app.gestion.index.tsx           # "/gestion"
│   ├── _app.gestion.dashboard.tsx       # "/gestion/dashboard"
│   ├── _app.gestion.prestaciones.index.tsx   # "/gestion/prestaciones"
│   ├── _app.gestion.prestaciones.nueva.tsx   # "/gestion/prestaciones/nueva"
│   ├── _app.gestion.odontologos.tsx     # "/gestion/odontologos"
│   ├── _app.gestion.reportes.diario.tsx # "/gestion/reportes/diario"
│   ├── _app.gestion.reportes.ioma.tsx   # "/gestion/reportes/ioma"
│   └── _app.gestion.admin.tsx           # "/gestion/admin" (solo admin)
│
├── db/
│   ├── client.ts                # Cliente Drizzle + Neon
│   ├── schema.ts                # Tablas de negocio
│   └── auth-schema.ts           # Tablas de Better Auth (user/session/account/verification)
│
├── lib/
│   ├── auth.ts                  # Server de Better Auth (config + hook que crea profile)
│   ├── auth-client.ts           # Cliente de auth (signIn/signUp/useSession)
│   └── gestion/
│       ├── data.server.ts       # Server functions: catálogos, prestaciones, arrivals, ABM
│       ├── auth-server.ts       # getUserContext (perfil + roles + sucursal)
│       ├── use-auth.ts          # Hook useUserContext (sesión + roles)
│       ├── users.functions.ts   # Gestión de usuarios (admin)
│       ├── clinica.ts           # Hook de "clínica activa" (localStorage)
│       └── exports.ts           # Export a Excel / PDF
│
├── components/
│   ├── gestion/Shell.tsx        # Layout del panel (sidebar + selector de clínica)
│   ├── KioskShell.tsx           # Layout del tótem
│   ├── BrandHeader.tsx
│   └── ui/                      # Componentes shadcn/ui
│
├── server.ts / start.ts         # Entrypoints SSR / config de TanStack Start
└── router.tsx                   # Configuración del router

drizzle/                         # Migraciones SQL generadas
```

## Mapa de rutas y autenticación

| Ruta | Página | ¿Requiere login? | Rol |
|------|--------|:----------------:|-----|
| `/` | Tótem de recepción (pacientes) | ❌ Pública | — |
| `/recepcion` | Panel de recepción (llegadas) | ✅ Sí | cualquiera |
| `/gestion/login` | Login del personal | ❌ Pública | — |
| `/gestion` | Inicio del panel (resumen del día) | ✅ Sí | cualquiera |
| `/gestion/dashboard` | Dashboard ejecutivo (KPIs, gráficos) | ✅ Sí | cualquiera |
| `/gestion/prestaciones` | Lista de prestaciones | ✅ Sí | cualquiera |
| `/gestion/prestaciones/nueva` | Cargar atención (multi-línea) | ✅ Sí | staff/administrativo |
| `/gestion/odontologos` | Listado de odontólogos | ✅ Sí | cualquiera (alta/baja: admin) |
| `/gestion/reportes/diario` | Reporte diario (Excel/PDF) | ✅ Sí | cualquiera |
| `/gestion/reportes/ioma` | Reporte IOMA (Excel/PDF) | ✅ Sí | cualquiera |
| `/gestion/admin` | Administración (catálogos + usuarios) | ✅ Sí | **solo admin** |
| `/api/auth/*` | Endpoints de Better Auth | — | — |

> El **tótem `/` es la única pantalla pública** (la usan los pacientes). El registro de llegada (`createArrival`) es la única operación de datos sin auth; el resto de las server functions exigen sesión.

### Cómo funciona la protección

- **A nivel UI**: todo lo que cuelga de `_app.tsx` pasa por un *gate* que redirige a `/gestion/login` si no hay sesión. `/gestion/admin` además chequea rol `admin`. `/recepcion` tiene su propio *gate* de sesión (mantiene su layout sin el sidebar de gestión).
- **A nivel datos**: cada server function valida la sesión por su cuenta (`requireAuth` / `requireAdmin` en `data.server.ts`) y aplica reglas por rol/sucursal — staff ve todo, administrativo solo su sucursal, odontólogo solo lo suyo. Es decir, la seguridad no depende solo del gate de UI.

## Roles

`admin` · `direccion` · `administrativo` · `odontologo` (tabla `user_roles`). Se asignan desde **Admin → Usuarios**. El primer usuario registrado no tiene rol: hay que asignarle `admin` manualmente la primera vez.

## Modelo de datos (resumen)

- **Catálogos**: `sucursales`, `pisos`, `obras_sociales`, `odontologos`, `nomencladores` (códigos+precio ARS por obra social), `servicios_particulares` (precio USD).
- **Atención**: `atenciones` (cabecera: paciente, DNI, obra social, odontólogo, código de consulta, primera vez) + `atencion_items` (N prestaciones por atención).
- **Tótem**: `arrivals` (llegadas registradas desde el tótem, gestionadas en `/recepcion`).
- **Auth**: `user`, `session`, `account`, `verification` (Better Auth) + `profiles` (perfil + sucursal) + `user_roles`.
