# Plan — Reportes (Diario + IOMA) sobre datos reales

> Basado en el cotejo de los 2 Sheets (ver `pendientes-doc-4jun.md`).
> Trabajar sobre branch `staging` de Neon. Verificar contra el Sheet 2 al final.

## Modelo de cómputo (acordado con la estructura actual)
`listPrestaciones` ya devuelve la vista plana con filtros `desde/hasta/sucursalId/obraSocialId/odontologoId` y autorización por rol. Los reportes computan **en cliente** sobre esas filas (volumen ≤ 2000, KISS). Definiciones:
- **Facturación** = Σ `monto` (ARS). USD aparte = Σ `monto_usd`.
- **Cantidad de prestaciones** = nº de ítems (filas).
- **Cantidad de pacientes** = nº de `atencion_id` distintos (cada atención = una visita). *No* usar la columna `cantidad` del sheet viejo.

---

## Fase 1 — Reporte Diario: filtros + KPI pacientes (sin schema) ✅ HECHA
Archivo: `src/routes/_app.gestion.reportes.diario.tsx`
- [x] **Filtro por obra social** (select desde `listObrasSociales`, "Todas" = sin filtro). Pasa `obraSocialId` a `listPrestaciones`.
- [x] **Filtro por odontólogo** (select desde `listOdontologos`, "Todos"). Pasa `odontologoId`.
- [x] Tarjeta KPI **Pacientes** = `new Set(rows.map(r => r.atencion_id)).size`. Grid de KPIs ahora 4 (Pacientes/Prestaciones/ARS/USD).
- [x] Filtros activos reflejados en el subtítulo del PDF + total con pacientes.
- [x] `tsc --noEmit` 0 errores. Lint: solo `no-explicit-any` preexistentes del patrón del archivo.
- Verificación funcional pendiente: requiere `npm run dev` con `DATABASE_URL` de staging (no se pudo correr el server acá).

## Fase 2 — Flag facturable + estado de placa (schema) — CÓDIGO HECHO, migración PENDIENTE
Archivos: `src/db/schema.ts`, `drizzle/0005_atencion_items_facturable.sql`, `prestaciones.nueva.tsx`, `data.server.ts`, `lib/gestion/codigos.ts`
- [x] Columnas `facturable boolean NOT NULL DEFAULT true` y `estado_placa text` (nullable) en `atencion_items` (schema + migración `0005`).
- [x] `itemInput` zod + `createAtencion` + `updateAtencionItem` persisten ambos campos.
- [x] `listPrestaciones` expone `facturable` y `estado_placa` (select + map).
- [x] **Nueva prestación**: checkbox "Facturable" por línea (default ✓) + selector de estado de placa que aparece solo si la línea es placa MIO (helper `esPlacaMio`).
- [x] `src/lib/gestion/codigos.ts`: `CODIGO_PLACA_MIO="806"`, `CODIGOS_INCRUSTACION=["40103"]`, `CODIGO_CONSULTA="101"` + helpers `esPlacaMio`/`esIncrustacion` (normalizan ceros a la izquierda). Confirmar lista de incrustación con el cliente.
- [x] `tsc --noEmit` 0 errores. Código nuevo sin errores de lint (quedan `any`/prettier preexistentes del archivo).
- [x] **Migración `0005` aplicada** en la base activa del `.env` (`ep-soft-scene-ac4mtlqc`, sa-east-1). La otra `DATABASE_URL` del `.env` estaba comentada. Columnas verificadas: `facturable:boolean`, `estado_placa:text`.
  - Nota: el proyecto Neon documentado (`divine-bar-51599272`) ya no existe; actualizar `reference` si hace falta el projectId nuevo.
- [ ] Verificación funcional: cargar una atención con línea no facturable y una placa MIO (impresión/entrega), requiere `npm run dev`.

## Fase 3 — Reporte IOMA: análisis específicos ✅ HECHA
Archivo: `src/routes/_app.gestion.reportes.ioma.tsx` (filtra por OS IOMA + rango + sucursal)
### Marcelo
- [x] **Primeras consultas**: atenciones distintas con `primera_vez = true` → KPI + tabla (fecha/paciente/odontólogo).
- [x] **Actividades por odontólogo**: tabla agrupada (prestaciones · incrustaciones · facturado).
- [x] **Placas MIO**: KPI impresas/entregadas + tarjetas (impresiones/entregas/reimpresiones/sesiones entregadas = entregas×2). Aviso si hay placas sin estado cargado.
- [x] **Incrustaciones**: KPI total (helper `esIncrustacion`) + desglose por odontólogo en la tabla de actividades.
### Lucas
- [x] **No facturables por odontólogo**: tabla con `facturable = false` agrupada por odontólogo → cantidad + detalle de prestaciones.
- [x] Resumen de análisis agregado al subtítulo del PDF. `tsc` 0 errores; restan solo `any` preexistentes en lint.

## Fase 4 — Verificación
- [x] `tsc --noEmit` global: 0 errores (Fases 1–3).
- [ ] Cuadrar facturación/pacientes/prestaciones de un día contra el **Sheet 2** → requiere `npm run dev` + datos cargados.
- [ ] SSR 200 en `/gestion/reportes/diario` y `/gestion/reportes/ioma` + probar carga con facturable/placa.
- [ ] Export Excel/PDF de cada reporte abre y trae columnas correctas.

> Nota: las verificaciones funcionales restantes necesitan levantar el server (`npm run dev` con `DATABASE_URL` activa) — no se pudo correr en este entorno.

---

## Orden y dependencias
Fase 1 (independiente, ya) → Fase 2 (schema, destraba Lucas + Placas) → Fase 3 → Fase 4.
Fase 1 se puede entregar sola mientras se define con el cliente la Fase 2.

## A confirmar con el cliente (no bloquea Fase 1)
- Códigos que cuentan como **incrustación** (¿solo `40103`?).
- Placa MIO: ¿campo de estado estructurado (recomendado) o heurística por texto?
- "Primeras consultas": ¿`primera_vez` solo, o además exigir código `101`?
