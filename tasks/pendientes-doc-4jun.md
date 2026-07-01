# Maycenter Tótem — Reconciliación doc del 4 de junio

> Bajado y cotejado contra el código el 2026-06-25.
> La mayoría del doc YA está implementado (ver `todo.md` Fase 5 + `plan-precios.md`).
> Este archivo deja solo lo **pendiente real**.

## Mapeo doc → estado

### Carga de prestaciones — TODO HECHO
- [x] Crear más de una prestación → form multi-línea (`prestaciones.nueva`, T3).
- [x] Sidebar con odontólogos → página Odontólogos (T4).
- [x] Al elegir obra social, traer prestaciones con su precio → nomencladores por OS + planes (T5/T6 + `plan-precios.md`, 1512 precios cargados).
- [x] Obra social en ARS de lista → sí.
- [x] Particulares en USD, lista aparte → `servicios_particulares` (T7).
- [x] Prestación "OTRAS" + descripción manual → `descripcionManual` / `codigo_manual` por línea.
- [x] Código de consulta + check "Primera vez" → cabecera de atención (`codigo_consulta`, `primera_vez`, T8).

### Reporte Diario — PARCIAL
- [x] Total general (cantidad de prestaciones + facturación ARS/USD).
- [x] Detalle exportable (Excel/PDF) con columnas fecha/sucursal/piso/odontólogo/NroOD/paciente/DNI/OS/código/desc/cantidad/monto.
- [ ] **Filtro por obra social** (hoy solo hay fecha + sucursal).
- [ ] **Filtro por odontólogo** (hoy solo agrupa por odontólogo, no filtra).
- [ ] **Métrica "cantidad total de pacientes"** como KPI visible (existe en IOMA, falta en Diario).
- [ ] Validar que las **columnas del detalle coincidan con el Sheets** de referencia (conseguir el Sheets).

### Reporte IOMA — SOLO BASE HECHA, faltan los análisis específicos
- [x] Vista IOMA con total general (cantidad, ARS, pacientes), filtro sucursal + rango de fechas, export.
- [ ] **(Marcelo) Seguimiento de primeras consultas** de odontología general → usar `primera_vez` + `codigo_consulta` por paciente.
- [ ] **(Marcelo) Actividades de los odontólogos** → desglose de prestaciones por odontólogo.
- [ ] **(Marcelo) Placas MIO**: impresiones vs entregadas. Código `0806` = **2 sesiones**. Requiere distinguir estado impresión/entrega (¿campo nuevo o lógica por sesión?).
- [ ] **(Marcelo) Incrustaciones**: cuántas se realizaron (identificar códigos de incrustación en nomenclador IOMA).
- [ ] **(Lucas) Rendimiento en trabajos NO facturables** (prueba de prótesis, escaneos, etc.) por odontólogo.

## Bloqueante para Lucas
- [ ] **No existe flag facturable / no facturable** en `nomencladores` ni en `servicios_particulares`. Sin esto no se puede armar el reporte de Lucas ni separar "no facturables" en ningún reporte. Definir:
  - Dónde vive el flag (por código de nomenclador / por servicio / por ítem de atención).
  - Quién lo setea (catálogo vs al cargar la atención).

## Hallazgos de los Sheets (cotejado 2026-06-25)

Dos Sheets analizados (varias pestañas c/u; la herramienta las concatena sin nombre).

### Sheet 1 (`1QTDgmV…`) — fuente cruda de carga
Pestañas detectadas: catálogo de odontólogos · tabla maestra de carga (enero 2026) · grilla de consultorios por día/piso · tabla de carga sin MES · histórico viejo (mayo 2025).

**Columnas exactas de la carga / detalle del reporte diario:**
`MES · FECHA · DNI · PACIENTE · OBRA SOCIAL · PRESTACION · COD · MONTO · DOLARES · OD · PISO · CANTIDAD · OBSERVACIONES · PART X OS · NOMBRE`

- `OD` = código del odontólogo (numéro o sigla: 18, 15, 4, J…). `NOMBRE` = nombre del odontólogo.
- `CANTIDAD` (0/1) en el sheet **no es cantidad de prestación**: el `1` marca la última línea del paciente (cierre). En el modelo nuevo esto NO aplica → pacientes = atenciones distintas.
- `DOLARES` = columna separada para particulares en USD. `PART X OS` = qué OS derivó al particular.
- `COD = "-"` y `MONTO $0` → prestación **no facturable** (PRUEBA, PRUEBA ENFILADO, IMPRESION, ESCANEO, REENFILADO, "PROTESIS NO FACT"…). Hoy se infiere por código vacío, sin flag.

**Códigos de nomenclador IOMA confirmados:** 101 consulta · 104 urgencia · 202 compo · 806 placa MIO · 1001 exodoncia · 80201/80202 limpieza sup/inf · 40103 incrustación · 40108 perno · 4030301/4030302 PPR flex · 40301 prótesis completa.

**Placas MIO (cód. 806):** el estado vive en el **texto** de la prestación, no estructurado:
`IMPRESION PLACA MIO`/`IMPRESION PM` ($0) → impresión · `PLACA MIO` (806) → facturable · `ENTREGA/ENTREGO PLACA MIO` ($0) → entrega · `REIMPRESION PLACA MIO`.

### Sheet 2 (`1rGyo56…`) — Reporte Diario ya armado
Por fecha → por odontólogo `[facturación · cant. pacientes · cant. prestaciones]` → desglose de prestaciones con su cantidad. Es el output que el reporte de la app debe reproducir.

---

## Decisiones que quedan (recomendación en el plan)
1. ~~Sheets del reporte diario~~ → **resuelto**: columnas arriba.
2. **Incrustaciones**: contar por `cod = 40103` (confirmar si hay otros códigos de incrustación).
3. **Placas MIO impresión vs entrega**: hoy es texto libre. **Recomendado**: campo estructurado de estado en el ítem en vez de parsear strings (ver plan, Fase 2).
4. **Facturable / no facturable**: **recomendado** flag explícito `facturable` en `atencion_items` (ver plan, Fase 2). Sin esto el reporte de Lucas queda por heurística frágil.

→ Plan de implementación en **`plan-reportes.md`**.
