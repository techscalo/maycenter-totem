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
│   ├── gestion.login.tsx        # "/gestion/login" → Login
│   ├── api.auth.$.ts            # "/api/auth/*" → Handler de Better Auth
│   ├── _app.tsx                 # Layout PROTEGIDO (gate de sesión) — todo lo de abajo cuelga de acá
│   ├── _app.gestion.index.tsx           # "/gestion"
│   ├── _app.gestion.dashboard.tsx       # "/gestion/dashboard"
│   ├── _app.gestion.recepcion.tsx       # "/gestion/recepcion" → Panel de recepción (monta RecepcionPanel)
│   ├── _app.gestion.prestaciones.index.tsx   # "/gestion/prestaciones"
│   ├── _app.gestion.prestaciones.nueva.tsx   # "/gestion/prestaciones/nueva"
│   ├── _app.gestion.odontologos.tsx     # "/gestion/odontologos"
│   ├── _app.gestion.precios.tsx         # "/gestion/precios"
│   ├── _app.gestion.reportes.diario.tsx # "/gestion/reportes/diario"
│   ├── _app.gestion.reportes.ioma.tsx   # "/gestion/reportes/ioma"
│   ├── _app.gestion.ayuda.tsx           # "/gestion/ayuda" (doc in-app + tour)
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
│       ├── codigos.ts           # Códigos especiales (placa MIO, incrustación) + helpers
│       ├── tour.ts              # Tour guiado (driver.js) para usuarios nuevos
│       └── exports.ts           # Export a Excel / PDF
│
├── components/
│   ├── gestion/Shell.tsx        # Layout del panel (sidebar colapsable + tour)
│   ├── gestion/RecepcionPanel.tsx  # Panel de recepción (usado por /gestion/recepcion)
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
| `/gestion/login` | Login del personal | ❌ Pública | — |
| `/gestion` | Inicio del panel (resumen del día) | ✅ Sí | cualquiera |
| `/gestion/dashboard` | Dashboard ejecutivo (KPIs, gráficos) | ✅ Sí | cualquiera |
| `/gestion/recepcion` | Panel de recepción (llegadas del tótem) | ✅ Sí | cualquiera |
| `/gestion/prestaciones` | Lista de prestaciones | ✅ Sí | cualquiera |
| `/gestion/prestaciones/nueva` | Cargar atención (multi-línea) | ✅ Sí | staff/administrativo |
| `/gestion/odontologos` | Listado de odontólogos | ✅ Sí | cualquiera (alta/baja: admin) |
| `/gestion/precios` | Precios por obra social y plan | ✅ Sí | cualquiera (editar: admin) |
| `/gestion/reportes/diario` | Reporte diario (Excel/PDF) | ✅ Sí | cualquiera |
| `/gestion/reportes/ioma` | Reporte IOMA (Excel/PDF) | ✅ Sí | cualquiera |
| `/gestion/ayuda` | Documentación in-app + tour guiado | ✅ Sí | cualquiera |
| `/gestion/admin` | Administración (catálogos + usuarios) | ✅ Sí | **solo admin** |
| `/api/auth/*` | Endpoints de Better Auth | — | — |

> El **tótem `/` es la única pantalla pública** (la usan los pacientes). El registro de llegada (`createArrival`) es la única operación de datos sin auth; el resto de las server functions exigen sesión.

### Cómo funciona la protección

- **A nivel UI**: todo lo que cuelga de `_app.tsx` pasa por un *gate* que redirige a `/gestion/login` si no hay sesión. `/gestion/admin` además chequea rol `admin`. La recepción vive en `/gestion/recepcion` (dentro del layout de gestión, con sidebar); el componente `RecepcionPanel` se renderiza embebido en ese layout.
- **A nivel datos**: cada server function valida la sesión por su cuenta (`requireAuth` / `requireAdmin` en `data.server.ts`) y aplica reglas por rol/sucursal — staff ve todo, administrativo solo su sucursal, odontólogo solo lo suyo. Es decir, la seguridad no depende solo del gate de UI.

## Roles

`admin` · `direccion` · `administrativo` · `odontologo` (tabla `user_roles`). Se asignan desde **Admin → Usuarios**. El primer usuario registrado no tiene rol: hay que asignarle `admin` manualmente la primera vez.

## Modelo de datos (resumen)

- **Catálogos**: `sucursales`, `pisos`, `obras_sociales`, `odontologos`, `nomencladores` (códigos+precio ARS por obra social, con columna `plan` para OS multi-plan), `servicios_particulares` (precio USD).
- **Atención**: `atenciones` (cabecera: paciente, DNI, obra social, odontólogo, código de consulta, primera vez) + `atencion_items` (N prestaciones por atención). Cada ítem incluye `facturable` (bool) y `estado_placa` (`impresion`/`entrega`/`reimpresion`, para placas MIO).
- **Tótem**: `arrivals` (llegadas registradas desde el tótem, gestionadas en `/gestion/recepcion`).
- **Auth**: `user`, `session`, `account`, `verification` (Better Auth) + `profiles` (perfil) + `user_roles` + **`user_sucursales`** (sedes asignadas a cada usuario; M:N — define el acceso por sucursal).

## Acceso por sucursal

- Cada cuenta se asigna a **CABA, La Plata o ambas** (tabla `user_sucursales`, gestionada en Admin → Usuarios). La asignación define el acceso **para todos los roles, incluido admin**.
- El **contexto de sede** vive en `src/lib/gestion/sucursal-activa.tsx` (provider montado en `_app.tsx`). El hook `useSucursalActiva()` da la sede activa, las asignadas y el setter; se persiste en `localStorage` (`gestion_sucursal_activa`).
- Si la cuenta tiene **2+ sedes**, el sidebar muestra un selector para cambiar (una por vez); con una sola, queda fija.
- En el servidor, `requireAuth` (`session.server.ts`) expone `sucursalIds: string[]`; el helper `resolveSucursal(ctx, pedida)` en `data.server.ts` valida que la sede pedida sea una asignada. Todas las queries por sede (reportes, prestaciones, odontólogos) y `createAtencion` la usan.

## Funcionalidades de la UI

- **Sidebar colapsable**: el botón de la primera fila del menú achica/expande el sidebar; la preferencia se guarda en `localStorage` (`gestion_sidebar_collapsed`).
- **Tour guiado** (`src/lib/gestion/tour.ts`, [driver.js](https://driverjs.com)): se dispara automáticamente la primera vez que un usuario entra al panel (flag `gestion_tour_done` en `localStorage`) y recorre las pantallas principales resaltando los ítems del sidebar (anclas `data-tour`). Se puede relanzar desde **Ayuda → "Ver tutorial guiado"**.
- **Carga de prestaciones**: soporta varias líneas por atención, check **Facturable** por línea (los no facturables se excluyen de la facturación y aparecen en el análisis de IOMA) y **estado de placa MIO** (impresión/entrega/reimpresión) cuando la línea es una placa MIO (código `806`).
- **Reportes**:
  - *Diario*: filtros por sucursal, obra social y odontólogo; KPIs de pacientes (atenciones distintas), prestaciones (líneas) y facturación (ARS/USD).
  - *IOMA*: además del total, análisis de primeras consultas, actividades por odontólogo, placas MIO (impresas vs entregadas + sesiones), incrustaciones y trabajos no facturables por odontólogo. Los códigos especiales se centralizan en `src/lib/gestion/codigos.ts`.
