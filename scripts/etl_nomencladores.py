#!/usr/bin/env python3
"""ETL de aranceles: parsea los 10 documentos fuente (PDF/XLSX) y emite un JSON
normalizado por obra social -> plan -> prestacion -> precio.

Salida: scripts/out/nomencladores.json  +  resumen por stdout.
No toca la base de datos: produce un intermedio revisable (Fase 2 del plan).
"""
import os, re, json, subprocess, sys
import openpyxl

DL = os.path.expanduser("~/Downloads")
OUT_DIR = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT_DIR, exist_ok=True)

records = []  # {obraSocial, plan, codigo, descripcion, monto, montoPaciente, vigencia}


def add(obra, codigo, desc, monto, plan=None, monto_paciente=None, vigencia=None, revisar=False):
    if monto is None:
        return
    records.append({
        "obraSocial": obra,
        "plan": plan,
        "codigo": str(codigo).strip(),
        "descripcion": " ".join(str(desc).split()),
        "monto": round(float(monto), 2),
        "montoPaciente": round(float(monto_paciente), 2) if monto_paciente is not None else None,
        "vigencia": vigencia,
        "revisar": revisar,
    })


def num(s):
    """Parser de montos tolerante a es-AR (1.234,56), US (14,900=miles) y 19271.74."""
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    s = re.sub(r"[^0-9.,]", "", str(s))
    if not s:
        return None
    m = re.search(r"[.,](\d{1,2})$", s)
    if m:
        int_part = s[:m.start()].replace(".", "").replace(",", "")
        frac = m.group(1)
        int_part = int_part or "0"
        return float(f"{int_part}.{frac}")
    return float(re.sub(r"[.,]", "", s))


def pdf_lines(fname, layout=True, fp=None, lp=None):
    args = ["pdftotext"]
    if layout:
        args.append("-layout")
    if fp:
        args += ["-f", str(fp)]
    if lp:
        args += ["-l", str(lp)]
    args += [os.path.join(DL, fname), "-"]
    out = subprocess.run(args, capture_output=True, text=True).stdout
    return out.splitlines()


def pdf_pages(fname):
    info = subprocess.run(["pdfinfo", os.path.join(DL, fname)], capture_output=True, text=True).stdout
    m = re.search(r"Pages:\s+(\d+)", info)
    return int(m.group(1)) if m else 1


def xlsx(fname, sheet=None):
    wb = openpyxl.load_workbook(os.path.join(DL, fname), read_only=True, data_only=True)
    ws = wb[sheet] if sheet else wb.worksheets[0]
    return list(ws.iter_rows(values_only=True))


# ---------- Parsers simples: codigo  descripcion  $ precio ----------
def _multi_price(ln):
    """True si la linea tiene mas de un precio (seccion multi-columna/protesis garabateada)."""
    return len(re.findall(r"\$\s*[\d]", ln)) > 1


def parse_simple(fname, obra, vigencia, code_re):
    """PDF con lineas '<codigo> <descripcion> $ <precio>'. Junta desc multilinea."""
    pend_code = pend_desc = None
    for ln in pdf_lines(fname):
        if not ln.strip():
            continue
        m = re.match(rf"^\s*({code_re})\s+(.*)$", ln)
        rev = _multi_price(ln)
        if m:
            code = m.group(1).strip()
            rest = m.group(2)
            pm = re.search(r"\$\s*([\d][\d.,]*\d)", rest)
            if pm:
                desc = rest[:pm.start()].strip()
                add(obra, code, desc, num(pm.group(1)), vigencia=vigencia, revisar=rev)
                pend_code = pend_desc = None
            else:
                pend_code, pend_desc = code, rest.strip()
        elif pend_code:
            pm = re.search(r"\$\s*([\d][\d.,]*\d)", ln)
            if pm:
                pend_desc = (pend_desc + " " + ln[:pm.start()].strip()).strip()
                add(obra, pend_code, pend_desc, num(pm.group(1)), vigencia=vigencia, revisar=_multi_price(ln))
                pend_code = pend_desc = None
            elif not re.search(r"CAPITULO|CAP\b|Vigencia|ANEXO|PROTESIS", ln, re.I):
                pend_desc = (pend_desc + " " + ln.strip()).strip()


def parse_avalian():
    parse_simple("AVALIAN ABRIL.pdf", "Avalian", "2026-04-01", r"\d{4}")


def parse_swiss():
    parse_simple("nomenclador swiss medical.pdf", "Swiss Medical", "2026-04-01", r"O\d{4,6}")


def parse_ospjn():
    parse_simple("nomenclador OSPJN mayo26.pdf", "OSPJN", "2026-05-01", r"\d{2}\.\d{2}\.\d{2}")


def parse_medife_pdf():
    parse_simple("Medife Mayo.pdf", "Medifé", "2026-05-01", r"\d{2}\.\d{2}")


# ---------- DX Salud: capitulo + desc multilinea + precio; codigo sintetico ----------
def parse_dx():
    obra, vig = "DX Salud", None
    cap = None
    cap_counter = {}
    pend = []
    for ln in pdf_lines("DX SALUD.pdf"):
        if not ln.strip():
            continue
        if re.search(r"CAPITULO", ln, re.I):
            pend = []
            mc = re.search(r"CAPITULO\s+([IVX]+)", ln, re.I)
            cap = mc.group(1) if mc else cap
            continue
        m = re.match(r"^\s*(\d)\s{2,}(.*)$", ln)
        price = re.search(r"\$\s*([\d][\d.,]*\d)", ln)
        if m:
            capn = m.group(1)
            rest = m.group(2)
            if price:
                desc = rest[:price.start()].strip()
                cap_counter[capn] = cap_counter.get(capn, 0) + 1
                add(obra, f"C{capn}-{cap_counter[capn]:02d}", desc, num(price.group(1)), vigencia=vig)
                pend = []
            else:
                pend = [capn, rest.strip()]
        elif pend:
            if price:
                desc = (pend[1] + " " + ln[:price.start()].strip()).strip()
                capn = pend[0]
                cap_counter[capn] = cap_counter.get(capn, 0) + 1
                add(obra, f"C{capn}-{cap_counter[capn]:02d}", desc, num(price.group(1)), vigencia=vig)
                pend = []
            else:
                pend[1] = (pend[1] + " " + ln.strip()).strip()


# ---------- IOMA xlsx: codigo | desc | valor ----------
def parse_ioma():
    for r in xlsx("NOMENCLADOR ioma abril 26.xlsx"):
        if len(r) < 3:
            continue
        code, desc, val = r[0], r[1], r[2]
        if code and desc and re.match(r"^\d{2}\.\d{2}", str(code)) and num(val):
            add("IOMA", code, desc, num(val), vigencia="2026-04-01")


# ---------- Amebpba xlsx: tomar ARANCEL vigencia 01/05/2026 (col idx 9) ----------
def parse_amebpba():
    for r in xlsx("nom amebpba mayo 2026.xlsx", "Amebpba"):
        if len(r) < 10:
            continue
        code, desc, arancel = r[2], r[3], r[9]
        if code and desc and re.match(r"^\d+\.\d+", str(code)) and num(arancel):
            add("Amebpba", code, desc, num(arancel), vigencia="2026-05-01")


# ---------- Biomed xlsx: 3 planes con desglose O.S./Paciente; codigo sintetico ----------
def parse_biomed():
    rows = xlsx("biomed enero 2026.xlsx", "Hoja1")
    planes = [("RD superior", 3, 4), ("RD básico", 5, 6), ("RD mt", 7, 8)]
    cap_counter = {}
    cur_cap = None
    for r in rows:
        c0 = str(r[0]).strip() if r[0] is not None else ""
        desc = r[1]
        if desc and "CAPÍTULO" in str(desc).upper():
            mc = re.search(r"CAP[IÍ]TULO\s+([IVX]+)", str(desc), re.I)
            cur_cap = mc.group(1) if mc else cur_cap
            continue
        if c0.isdigit() and desc and num(r[2]):
            cap_counter[c0] = cap_counter.get(c0, 0) + 1
            code = f"C{c0}-{cap_counter[c0]:02d}"
            for plan, osi, pi in planes:
                os_val = num(r[osi]) if len(r) > osi else None
                pac_val = num(r[pi]) if len(r) > pi else None
                add("Biomed", code, desc, os_val, plan=plan,
                    monto_paciente=pac_val, vigencia="2026-01-01")


# ---------- Omint xlsx: codigo | desc | ... | 3 vigencias; tomar la ultima ----------
def parse_omint():
    rows = xlsx("Omint.xlsx", "GRUPO 1")
    # cols de precio por vigencia estan al final; la ultima vigencia = ultima col con numero
    for r in rows:
        if len(r) < 6:
            continue
        code, desc = r[0], r[1]
        if code and desc and re.match(r"^\d{2}\.\d{2}", str(code)):
            prices = [num(c) for c in r[5:] if num(c)]
            if prices:
                add("Omint", code, desc, prices[-1], vigencia="2026-04-01")


# ---------- OSDE: parseo por offset de columnas, pagina por pagina ----------
PLAN_LABELS = ["2 025", "2 110", "2 210", "2 310", "2 410", "2 450",
               "2 510", "8 260", "8 360", "8 430", "FLUX"]


def parse_osde():
    obra, vig = "OSDE", "2026-03-01"
    for p in range(1, pdf_pages("Nomenclador osde.marzo 26.PDF") + 1):
        lines = pdf_lines("Nomenclador osde.marzo 26.PDF", fp=p, lp=p)
        header = next((l for l in lines if "Prestacion" in l and "FLUX" in l), None)
        if not header:
            continue
        offs = []
        idx = 0
        for lbl in PLAN_LABELS:
            pos = header.find(lbl, idx)
            offs.append(pos)
            idx = pos + len(lbl)
        for ln in lines:
            m = re.match(r"^\s*(\d{6})\s+(.+?)\s{2,}", ln)
            if not m:
                continue
            code = m.group(1)
            desc = m.group(2).strip()
            for i, lbl in enumerate(PLAN_LABELS):
                start = offs[i]
                end = offs[i + 1] if i + 1 < len(offs) else len(ln) + 50
                seg = ln[start:end] if start >= 0 and start < len(ln) else ""
                val = num(seg) if re.search(r"\d", seg) else None
                if val:
                    add(obra, code, desc, val, plan=lbl.replace(" ", ""), vigencia=vig)


def main():
    parse_avalian(); parse_swiss(); parse_ospjn(); parse_medife_pdf()
    parse_dx(); parse_ioma(); parse_amebpba(); parse_biomed()
    parse_omint(); parse_osde()

    out = os.path.join(OUT_DIR, "nomencladores.json")
    with open(out, "w") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    # resumen
    from collections import Counter, defaultdict
    by_os = Counter(r["obraSocial"] for r in records)
    planes = defaultdict(set)
    for r in records:
        if r["plan"]:
            planes[r["obraSocial"]].add(r["plan"])
    rev_by_os = Counter(r["obraSocial"] for r in records if r.get("revisar"))
    print(f"\nTOTAL filas: {len(records)}  (a revisar: {sum(rev_by_os.values())})  -> {out}\n")
    print(f"{'OBRA SOCIAL':<16} {'FILAS':>6} {'REVISAR':>8}  PLANES")
    for os_name in sorted(by_os):
        pl = planes.get(os_name)
        pl_str = f"{len(pl)} planes" if pl else "(sin plan)"
        print(f"{os_name:<16} {by_os[os_name]:>6} {rev_by_os.get(os_name,0):>8}  {pl_str}")
    # muestra
    print("\nMUESTRA (1 fila por OS):")
    seen = set()
    for r in records:
        if r["obraSocial"] not in seen:
            seen.add(r["obraSocial"])
            print(" ", json.dumps(r, ensure_ascii=False))


if __name__ == "__main__":
    main()
