# Plan — Precios por obra social/plan + PDF maestro + gestión de precios

## Objetivo
1. Tomar los 10 documentos de aranceles (PDF/XLSX) que llegan desordenados y producir un **PDF maestro** ordenado por **obra social → plan → prestación → precio**.
2. Cargar esos precios en la base (`nomencladores`) para que **Nueva prestación** autocomplete precios reales.
3. Crear una **página en gestión** para revisar/editar precios por obra social (y plan), sin tocar la base a mano.

## Decisiones tomadas (con Dylan)
- **Dimensión plan**: se agrega columna `plan` *nullable* a `nomencladores`. OS de precio único → `plan = null`. OS con planes (OSDE, Biomed) → una fila por plan. En Nueva prestación aparece un selector "Plan" **solo** si la OS tiene planes.
- **Códigos**: cada OS mantiene su propia lista de códigos/descripciones tal como viene en su documento. Sin set canónico ni mapeo entre OS.

---

## Análisis de las fuentes (10 archivos en ~/Downloads)

| OS | Formato | Estructura | Plan | Vigencia | Notas |
|----|---------|-----------|------|----------|-------|
| AVALIAN | PDF | código(0101) · prestación · 1 precio | no | 1/4/2026 | limpio |
| Medife | PDF (+ tab dup en amebpba.xlsx) | código(01.01) · desc · 1 precio | no | 01/05/2026 | usar el PDF como canónico |
| Swiss Medical | PDF | código(O0101) · desc · 1 precio | no | 1/4/2026 | códigos con prefijo "O" |
| OSPJN | PDF | código(01.01.00) · desc · 1 precio | no | 01/05/2026 | notas "sin coseguro" |
| IOMA | XLSX | código(01.01) · desc · 1 precio | no | 01/04/2026 | header trae multiplicador 266.2 |
| **OSDE** | PDF | código(810100) · ~11 columnas de plan | **sí** (2025,2110,2210,2310,2410,2450,2510,8260,8360,8430,FLUX) | mar-2026 | caso multi-plan principal |
| **Biomed** | XLSX | cap · desc · Valor · split O.S./Paciente por plan | **sí** (RD superior/básico/mt) | ene-2026 | precios = Valor × coef plan |
| Omint | XLSX (+ tab dup en amebpba.xlsx) | código · desc · autoriz · 3 columnas de vigencia | no | tomar la última (01/04/2026) | usar el .xlsx dedicado |
| Amebpba | XLSX | código(1.01) · desc · arancel (2 vigencias) | no | tomar 01/05/2026 | tiene `#REF!`; tabs extra Ioma/Omint/Medife = ignorar |
| DX Salud | PDF | solo nº de capítulo · prestación · precio | no | s/f | **sin código granular** — el más desordenado; branded "MAYCENTER" |

### Definiciones cerradas con Dylan
- **DX Salud**: asignar **código sintético por orden** (p.ej. `C1-01`, `C2-01`…).
- **OSDE**: cargar **los 11 planes** (2025, 2110, 2210, 2310, 2410, 2450, 2510, 8260, 8360, 8430, FLUX).
- **Biomed**: importar el **desglose O.S./Paciente por plan** (RD superior/básico/mt).
- **Nombres**: alinear cada doc con la fila de `obras_sociales` por **nombre de la obra social**.
- Overlap de fuentes: para Medife y Omint usar el archivo dedicado, ignorar los tabs duplicados de `amebpba.xlsx`.

---

## Fase 0 — Definiciones (antes de codear) ✅
- [x] DX Salud → código sintético por orden.
- [x] OSDE → cargar los 11 planes.
- [x] Biomed → desglose O.S./Paciente por plan.
- [x] Alinear por nombre de obra social (mapear/crear filas en `obras_sociales` durante la Fase 2/4).

## Fase 1 — Modelo de datos ✅ (main pendiente)
- [x] Agregar `plan text` (nullable) a `nomencladores`.
- [x] Ajustar índice único: `(obra_social_id, codigo)` → `(obra_social_id, coalesce(plan,''), codigo)` (coalesce porque PG trata null≠null en índices únicos). Migración `drizzle/0003_add_plan_nomencladores.sql`.
- [x] Aplicada en **staging** (columna + índice verificados).
- [ ] Aplicar en **main**: pendiente de connection string (el MCP de Neon no ve el proyecto; falta el string de `main`). No bloquea Fases 2/3/5/6, que corren sobre staging.
- [x] Typecheck OK.

## Fase 2 — ETL (parseo de los 10 archivos) ✅
- [x] `scripts/etl_nomencladores.py`: parser por fuente + parser de montos tolerante (es-AR/US/punto decimal) + flag `revisar`.
- [x] Salida `scripts/out/nomencladores.json` — **1512 filas**, sin duplicados `(OS,plan,codigo)`, sin montos ≤0.
- [x] Reglas aplicadas: última vigencia (Amebpba 01/05/2026, Omint abr-26), códigos sintéticos DX/Biomed, desglose O.S./Paciente Biomed, OSDE por offset de columnas.
- Conteo por OS: Amebpba 44 · Avalian 31 · Biomed 135 (3 planes) · DX Salud 29 · IOMA 85 · Medifé 28 · OSDE 906 (6 planes) · OSPJN 128 · Omint 61 · Swiss 65.
- **Hallazgos a tener en cuenta**:
  - **OSDE**: el documento solo trae precios en **6 de los 11 planes** (2310, 2410, 2450, 2510, 8360, 8430). Los otros 5 (2025, 2110, 2210, 8260, FLUX) vienen **vacíos en el origen** — no se inventan.
  - **OSPJN**: **69 filas marcadas `revisar`** (sección prótesis garabateada en el PDF de origen: textos tipo `309.80000`, `47.10fl00`). Hay que corregirlas a mano (en la página de gestión, Fase 5).
  - **Amebpba**: los montos altos ($1.9M–$2.6M en cap. 6) son **reales** (tratamientos de ortodoncia), no error.

## Fase 3 — PDF maestro ✅
- [x] `scripts/build_pdf_maestro.py`: HTML estructurado (portada + índice + sección por OS) → PDF vía Brave headless.
- [x] OSDE/Biomed pivoteados a **matriz por plan** (Biomed muestra desglose O.S./Pac.; OSDE 6 columnas con `—` donde el origen viene vacío). OS de precio único → tabla código/descripción/precio.
- [x] Filas `revisar` resaltadas en amarillo + nota explicativa de OSDE.
- [x] Generado: **`~/Desktop/Nomenclador-Maycenter.pdf`** (23 páginas, 1.3 MB). Render verificado (portada, tabla simple, matriz dual, matriz OSDE).
- Se regenera con `python3 scripts/build_pdf_maestro.py` cuando cambie el JSON.

## Fase 4 — Carga a la base ✅ (main pendiente)
- [x] `scripts/load_nomencladores.mjs`: idempotente (delete+insert por OS), mapea nombres (Amebpba→AMEBPBA, Omint→OMINT, DX Salud→DX Medical).
- [x] Migración `monto_paciente` (0004) aplicada en staging; `PARTICULAR` → renombrada a **Particular** y `es_particular=false` (Particular = OS ARS normal). Catálogo USD `serviciosParticulares` queda dormante (sin OS esParticular).
- [x] **1512 filas cargadas en staging** (Biomed con O.S./Paciente, OSDE 6 planes).
- [ ] **main**: aplicar migraciones 0003+0004 + cargar datos (pendiente del connection string de main).

## Fase 5 — Página de gestión de precios ✅
- [x] Ruta `/_app/gestion/precios` + ítem "Precios" en el sidebar.
- [x] Selección de OS → tabla (plan/código/descripción/monto/copago) con búsqueda, **filtro por plan** y orden por columna.
- [x] Alta + edición (modal) + baja; reusa `createNomenclador`/`updateNomenclador`/`deleteNomenclador` (extendidos con `plan` y `montoPaciente`). Solo admin.

## Fase 6 — Nueva prestación con planes ✅
- [x] Selector "Plan" aparece solo si la OS tiene planes (OSDE, Biomed); filtra los códigos por plan.
- [x] `listNomencladores` ordena por plan/código y devuelve `plan`+`montoPaciente`.
- [x] Particular (ahora esParticular=false) entra por el path ARS de nomencladores; OS sin planes igual que antes.
- [x] Typecheck OK · SSR 200 en `/gestion/precios` y `/gestion/prestaciones/nueva`.

## Verificación
- [ ] PDF maestro legible y completo (todas las OS, planes y vigencias correctas).
- [ ] Precios en Nueva prestación coinciden con el PDF.
- [ ] Página de gestión permite editar y se refleja en Nueva prestación.

## Orden sugerido de ejecución
Fase 0 → 1 → 2 → 3 (PDF, primer entregable visible) → 4 → 5 → 6.

## Resultado
_(completar al finalizar)_
