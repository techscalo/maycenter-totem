Como saltaste las preguntas, tomo estas decisiones por defecto. Si alguna no te cierra, decime antes de aprobar.

## Decisiones tomadas

- **Ruta**: el sistema vive en `/gestion/*` dentro de este mismo proyecto. El tótem (`/`) y recepción (`/recepcion`) quedan intactos.
- **Login**: email + contraseña, sin Google (es interno). `/gestion/login` público, todo lo demás detrás de auth.
- **Roles**: `admin`, `administrativo`, `direccion`. Tabla `user_roles` aparte (no en profiles) con función `has_role` security definer.
- **Sucursales**: CABA y La Plata se siembran de entrada. Cada usuario puede tener una sucursal asignada (o ver ambas si es admin/dirección).
- **Catálogos vacíos**: arrancan vacíos, se cargan desde el panel admin. Si después querés importar de un Sheet, lo hacemos aparte.

## Fase 1 (este turno)

Lo que sí construyo ahora:

1. **Esquema de base de datos completo** (migración única):
   - `profiles` (id, user_id, nombre, sucursal_id) con trigger de auto-creación al signup
   - `user_roles` + enum `app_role` + función `has_role`
   - `sucursales`, `pisos` (FK sucursal), `obras_sociales`, `odontologos` (FK piso + sucursal)
   - `nomencladores` (FK obra_social, codigo, descripcion, monto, activo)
   - `prestaciones` (fecha, paciente, dni, sucursal, obra_social, piso, odontologo, nomenclador opcional, codigo_manual, descripcion_manual, cantidad, monto, monto_usd, cotizacion_usd, observaciones)
   - RLS + GRANTs en todas las tablas según rol
   - Seed: CABA y La Plata

2. **Auth**:
   - `/gestion/login` y `/gestion/signup` (signup deshabilitado por defecto, se crean usuarios desde admin)
   - Layout `_gestion` protegido con `beforeLoad` redirigiendo a login
   - Logout, sesión persistida

3. **Panel admin de catálogos** (`/gestion/admin/...`):
   - Sucursales, Pisos, Obras Sociales, Odontólogos, Nomencladores
   - Tablas con buscar/crear/editar/eliminar (solo rol `admin`)

4. **Carga de prestaciones** (`/gestion/prestaciones/nueva`):
   - Form optimizado con cascadas: sucursal → pisos, piso → odontólogos, obra social → códigos del nomenclador
   - Autocompletado de monto desde nomenclador, editable
   - Si obra social = PARTICULAR → monto editable arrancando en 0
   - Campo opcional USD + cotización
   - Validaciones (campos obligatorios, monto > 0, etc.)
   - Atajo de teclado para guardar y cargar otra

5. **Tabla de prestaciones** (`/gestion/prestaciones`):
   - Filtros: fecha (rango), sucursal, obra social, odontólogo, piso, paciente/DNI
   - Búsqueda instantánea, paginación
   - Edición en modal y eliminación
   - Totales del filtro actual (cantidad + facturado ARS + USD)

6. **Layout y navegación**:
   - Sidebar con secciones: Inicio, Nueva prestación, Prestaciones, Admin (solo admin), Salir
   - Selector global de sucursal en el header (admin/dirección)
   - Diseño SaaS limpio, consistente con el branding Maycenter ya existente

## Fase 2 (siguiente turno, cuando apruebes la fase 1)

- Dashboard ejecutivo con KPIs y gráficos (barras/líneas/tortas, ranking)
- Reporte diario agrupado
- Reporte IOMA con export a Excel y PDF
- Gestión de usuarios desde admin (invitar, asignar rol y sucursal)

## Detalles técnicos

- **Stack**: se queda TanStack Start + Tailwind + shadcn (el "Next.js" lo reemplazamos por TanStack Start que es lo que ya corre acá; mismo modelo SSR y server functions, no perdés nada). Backend Supabase vía Lovable Cloud (ya está).
- **Server functions** (`createServerFn` con `requireSupabaseAuth`) para todo lo que sea escritura sensible y reportes; lecturas simples van por el cliente con RLS.
- **RLS**:
  - `admin` y `direccion`: ven todo
  - `administrativo`: ve/edita lo de su sucursal
  - `odontologo` (placeholder, sin UI propia en fase 1): solo sus prestaciones
- **Auto-confirm email**: ON (es uso interno, no hace falta verificar mail).
- **Primer admin**: como signup queda cerrado, después de aprobar la migración te pido que crees tu usuario y te lo marco como `admin` con una inserción directa.

## Lo que NO hago en este turno

- Dashboards, gráficos, reporte IOMA, exports a Excel/PDF → fase 2.
- Integración WhatsApp / facturación electrónica → futuro.
- Importación masiva del Sheet actual → cuando me pases el archivo.

¿Avanzo con esto?