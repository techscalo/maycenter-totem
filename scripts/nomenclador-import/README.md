# Import masivo de nomencladores

Convierte los PDFs de aranceles de cada obra social al **CSV canónico** que consume el
importador in-app (Configuración › Nomencladores › **Actualizar precios masivo**).

## Formato canónico

```
codigo,plan,descripcion,monto,copago
```

- `plan` y `copago` opcionales (vacío = null).
- La **obra social se elige en la UI**, no va en el archivo (evita mezclar OS).
- `monto`/`copago` aceptan formato AR (`17.826,57`) o plano (`21044.74`).

## Arquetipos

| Archetype | Ejemplo | Forma |
|---|---|---|
| `flat-ars` | Avalian | código 4 díg, 1 precio ARS, sin planes |
| `flat-dotted` | OSPJN | código `NN.NN.NN`; prótesis con 3 columnas → 1ª=total (`monto`), 2ª=a cargo afiliado (`copago`) |
| `matrix-plans` | OSDE | código 6 díg, matriz por plan; expande a 1 fila por plan (`2310,2410,2450,2510,8360,8430`) |

## Uso

```bash
node convert.mjs --archetype flat-ars     --in "avalian agosto.pdf" --out avalian.csv
node convert.mjs --archetype flat-dotted  --in "OSPJN ago26.pdf"    --out ospjn.csv
node convert.mjs --archetype matrix-plans --in "OSDE AGOSTO.PDF"    --out osde.csv
```

Requiere `pdftotext` (poppler). Imprime warnings por línea sin precio o con conteo de
columnas inesperado (revisión manual). Luego se sube el CSV en la UI, se revisa el
**preview** (a actualizar / sin cambio / nuevos / warnings) y se confirma.

## Obra social nueva

Si el PDF encaja en un arquetipo existente, se reusa. Si no, se agrega un `else if`
en `convert.mjs` con el parser de esa forma, emitiendo el mismo canónico.
