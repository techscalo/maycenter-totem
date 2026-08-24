# Sistema de importación/actualización masiva de nomencladores

Self-service: el administrativo **sube el PDF del arancel directo en la app**, ve un
preview del diff y confirma. El PDF se parsea server-side (unpdf/pdfjs, texto real, no
OCR). El formato canónico intermedio queda como contrato interno.

Canónico (por obra social, la OS se elige en la UI): `codigo | plan | descripcion | monto | copago`

## Fase 1 — Importador in-app ✅
- [x] Migración `0017` + tabla `nomenclador_price_history` (snapshot reversible)
- [x] `previewNomencladorImport` (CSV) y `applyNomencladorImport` (update + history + audit, idempotente, `db.batch`)
- [x] `nomenclador-parse.server.ts`: unpdf → líneas (clustering por `y`) → parsers por arquetipo + autodetección
- [x] `previewNomencladorImportPdf`: sube PDF (base64) → parsea → mismo diff
- [x] UI: diálogo "Actualizar precios masivo" — acepta **PDF** (o CSV/Excel), autodetecta arquetipo (override manual), preview con diff + warnings, confirmar
- [x] Typecheck + build (pdfjs bundlea OK)

## Fase 2 — Converter de dev (opcional / debug) ✅
- [x] `scripts/nomenclador-import/convert.mjs` (usa pdftotext) para bulk/debug fuera de la app

## Arquetipos soportados
- `flat-ars` (Avalian): código 4 díg, 1 precio ARS.
- `flat-dotted` (OSPJN): código `NN.NN.NN`; prótesis 3 columnas → total + copago.
- `matrix-plans` (OSDE): código 6 díg, matriz → 1 fila por plan `[2310,2410,2450,2510,8360,8430]`.
- OS nueva con forma distinta → agregar un parser en `nomenclador-parse.server.ts`.

## Seguridad
- Preview obligatorio; snapshot en `nomenclador_price_history` = reversible.
- Idempotente (validado: reimportar OSDE = 0 cambios).
- Warnings (monto 0, delta grande, copago>monto, líneas sin parsear) visibles, no auto-aplican.
- Crear códigos nuevos es opt-in (checkbox). Huérfanos se listan, no se borran.

## Pendiente al deployar
- Aplicar migraciones `0016` + `0017` en prod.
- Nota: bundle pdfjs ~2.2MB — OK en Vercel (Node); si se deploya en Cloudflare Workers, verificar límite de tamaño.
