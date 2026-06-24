#!/usr/bin/env python3
"""Fase 3: genera el PDF maestro de aranceles desde scripts/out/nomencladores.json.
Estructura: por obra social -> (plan si aplica) -> codigo/descripcion/precio.
OSDE/Biomed se pivotean a matriz (una columna por plan) para legibilidad.
Render a PDF via Brave headless. Salida: ~/Desktop/Nomenclador-Maycenter.pdf
"""
import json, os, subprocess, html, datetime
from collections import defaultdict, OrderedDict

HERE = os.path.dirname(__file__)
JSON = os.path.join(HERE, "out", "nomencladores.json")
HTML = "/tmp/nomenclador-maestro.html"
PDF = os.path.expanduser("~/Desktop/Nomenclador-Maycenter.pdf")
BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"

VIG = {  # vigencia legible por OS
    "Avalian": "01/04/2026", "Swiss Medical": "01/04/2026", "OSPJN": "01/05/2026",
    "Medifé": "01/05/2026", "IOMA": "01/04/2026", "Amebpba": "01/05/2026",
    "Biomed": "01/2026", "Omint": "04/2026", "OSDE": "03/2026", "DX Salud": "s/f",
}
PLAN_ORDER = {
    "OSDE": ["2310", "2410", "2450", "2510", "8360", "8430"],
    "Biomed": ["RD superior", "RD básico", "RD mt"],
}


def money(v):
    if v is None:
        return "—"
    s = f"{v:,.2f}"  # 1,234.56
    s = s.replace(",", "@").replace(".", ",").replace("@", ".")  # -> 1.234,56
    return "$ " + s


def esc(s):
    return html.escape(str(s) if s is not None else "")


def main():
    recs = json.load(open(JSON))
    by_os = defaultdict(list)
    for r in recs:
        by_os[r["obraSocial"]].append(r)

    parts = []
    today = datetime.date.today().strftime("%d/%m/%Y")
    n_rev = sum(1 for r in recs if r.get("revisar"))

    # portada + indice
    parts.append(f"""
    <div class="cover">
      <div class="brand">MAYCENTER</div>
      <h1>Nomenclador maestro de aranceles</h1>
      <div class="sub">Odontología · {len(by_os)} obras sociales · {len(recs)} prestaciones</div>
      <div class="meta">Generado el {today}</div>
    </div>
    <div class="index">
      <h2>Índice</h2>
      <ul>""")
    for os_name in sorted(by_os):
        parts.append(f'<li><a href="#os-{esc(os_name)}">{esc(os_name)}</a> '
                     f'<span class="dim">— {len(by_os[os_name])} prestaciones · vig. {VIG.get(os_name,"")}</span></li>')
    parts.append("</ul>")
    if n_rev:
        parts.append(f'<p class="warn">⚠ {n_rev} filas marcadas <b>para revisar</b> '
                     f'(origen ilegible) — resaltadas en amarillo.</p>')
    parts.append("</div>")

    for os_name in sorted(by_os):
        rows = by_os[os_name]
        has_plan = any(r["plan"] for r in rows)
        parts.append(f'<section class="os"><h2 id="os-{esc(os_name)}">{esc(os_name)}'
                     f'<span class="vig">vigencia {VIG.get(os_name,"")}</span></h2>')

        if not has_plan:
            parts.append('<table><thead><tr><th class="cod">Código</th>'
                         '<th>Prestación</th><th class="pr">Precio</th></tr></thead><tbody>')
            for r in rows:
                cls = ' class="rev"' if r.get("revisar") else ""
                parts.append(f'<tr{cls}><td class="cod">{esc(r["codigo"])}</td>'
                             f'<td>{esc(r["descripcion"])}</td>'
                             f'<td class="pr">{money(r["monto"])}</td></tr>')
            parts.append("</tbody></table>")
        else:
            # pivot: (codigo,desc) x planes
            planes = PLAN_ORDER.get(os_name) or sorted({r["plan"] for r in rows if r["plan"]})
            dual = any(r.get("montoPaciente") is not None for r in rows)  # Biomed: O.S./Paciente
            pivot = OrderedDict()
            for r in rows:
                k = (r["codigo"], r["descripcion"])
                pivot.setdefault(k, {})[r["plan"]] = (r["monto"], r.get("montoPaciente"))
            # header
            th = ['<th class="cod">Código</th>', "<th>Prestación</th>"]
            for p in planes:
                if dual:
                    th.append(f'<th class="pr">{esc(p)}<br><span class="dim">O.S. / Pac.</span></th>')
                else:
                    th.append(f'<th class="pr">{esc(p)}</th>')
            parts.append(f'<table><thead><tr>{"".join(th)}</tr></thead><tbody>')
            for (cod, desc), pm in pivot.items():
                tds = [f'<td class="cod">{esc(cod)}</td>', f"<td>{esc(desc)}</td>"]
                for p in planes:
                    val = pm.get(p)
                    if val is None:
                        tds.append('<td class="pr">—</td>')
                    elif dual:
                        tds.append(f'<td class="pr">{money(val[0])}<br>'
                                   f'<span class="dim">{money(val[1])}</span></td>')
                    else:
                        tds.append(f'<td class="pr">{money(val[0])}</td>')
                parts.append(f'<tr>{"".join(tds)}</tr>')
            parts.append("</tbody></table>")
            if os_name == "OSDE":
                parts.append('<p class="note">Nota: el documento de OSDE solo trae precios '
                             'para estos 6 planes; los planes 2025, 2110, 2210, 8260 y FLUX '
                             'figuran vacíos en el origen.</p>')
        parts.append("</section>")

    doc = f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color:#1a1a1a; margin:0; }}
  .cover {{ text-align:center; padding:120px 40px 60px; }}
  .brand {{ letter-spacing:.4em; font-weight:700; color:#0a7d5a; font-size:14px; }}
  .cover h1 {{ font-size:34px; margin:18px 0 8px; }}
  .cover .sub {{ color:#555; font-size:15px; }}
  .cover .meta {{ color:#999; font-size:12px; margin-top:8px; }}
  .index {{ padding:0 48px 40px; page-break-after: always; }}
  .index h2 {{ font-size:18px; border-bottom:2px solid #0a7d5a; padding-bottom:6px; }}
  .index ul {{ list-style:none; padding:0; columns:2; }}
  .index li {{ margin:5px 0; font-size:13px; }}
  .index a {{ color:#0a7d5a; text-decoration:none; font-weight:600; }}
  .dim {{ color:#999; font-weight:400; font-size:.85em; }}
  .warn {{ color:#9a6b00; background:#fff7e0; padding:8px 12px; border-radius:6px; font-size:12px; }}
  section.os {{ padding:24px 32px; page-break-before: always; }}
  section.os h2 {{ font-size:20px; color:#0a7d5a; border-bottom:2px solid #0a7d5a;
                   padding-bottom:6px; display:flex; justify-content:space-between; align-items:baseline; }}
  .vig {{ font-size:11px; color:#999; font-weight:400; }}
  table {{ width:100%; border-collapse:collapse; font-size:11px; }}
  thead th {{ background:#0a7d5a; color:#fff; text-align:left; padding:6px 8px; font-weight:600; }}
  th.cod, td.cod {{ width:70px; white-space:nowrap; font-variant-numeric:tabular-nums; }}
  th.pr, td.pr {{ text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }}
  tbody td {{ padding:5px 8px; border-bottom:1px solid #eee; vertical-align:top; }}
  tbody tr:nth-child(even) {{ background:#f7faf9; }}
  tbody tr.rev {{ background:#fff7e0; }}
  .note {{ font-size:11px; color:#777; margin-top:8px; font-style:italic; }}
</style></head><body>{"".join(parts)}</body></html>"""

    with open(HTML, "w") as f:
        f.write(doc)

    subprocess.run([BRAVE, "--headless=new", f"--print-to-pdf={PDF}",
                    "--no-pdf-header-footer", "--virtual-time-budget=4000",
                    f"file://{HTML}"], capture_output=True, text=True)
    print("HTML:", HTML)
    print("PDF :", PDF, f"({os.path.getsize(PDF)} bytes)" if os.path.exists(PDF) else "(NO generado)")


if __name__ == "__main__":
    main()
