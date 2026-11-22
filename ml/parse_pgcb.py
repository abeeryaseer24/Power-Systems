"""Parse PGCB/NLDC daily reports (ml/data/pgcb/raw/<id>.xlsx) into three tables for the load-shedding study.

  daily.csv     one row per operating day from sheet P1 (system summary): peaks, energy, unserved energy,
                temperature, gas supply, fuel mix, imports, zone load shed + demand at the evening peak
  curve.csv     48 half-hourly generation points per day from sheet L-Curve (east / west / total MW)
  forecast.csv  NLDC's own next-day forecast from sheet Forecast (probable peaks, temperature, load shed),
                keyed by the day it forecasts: the baseline a predictor has to beat

Only the P1-format daily report (ids >= ~4433, 31-12-2024 onwards) is parsed; QF-MIS-03 files are
monthly summaries and are skipped. The xlsx reader is stdlib-only (zip + XML), so no extra packages.
If two ids carry the same date, the higher id (later re-issue) wins.

Usage:  ml/.venv/Scripts/python ml/parse_pgcb.py
"""
import csv
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

HERE = pathlib.Path(__file__).parent
RAW = HERE / 'data' / 'pgcb' / 'raw'
OUT = HERE / 'data' / 'pgcb'
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
ZONES = ['Dhaka', 'Chattogram', 'Cumilla', 'Mymensingh', 'Sylhet', 'Khulna', 'Barishal', 'Rajshahi', 'Rangpur']
FUELS = ['Gas', 'Coal', 'HFO', 'HSD', 'Hydro', 'Solar', 'Import', 'Wind', 'Nuclear']


def col_index(col):
    n = 0
    for ch in col:
        n = n * 26 + ord(ch) - 64
    return n


def read_sheets(path, wanted):
    """{sheet name: {row: {col letters: text}}} for the wanted sheets (names stripped)."""
    z = zipfile.ZipFile(path)
    names = z.namelist()
    ss = []
    if 'xl/sharedStrings.xml' in names:
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(M + 'si'):
            ss.append(''.join(t.text or '' for t in si.iter(M + 't')))
    rels = {}
    for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels')):
        t = r.get('Target').lstrip('/')
        rels[r.get('Id')] = t if t.startswith('xl/') else 'xl/' + t
    out = {}
    for s in ET.fromstring(z.read('xl/workbook.xml')).iter(M + 'sheet'):
        nm = s.get('name').strip()
        if nm not in wanted:
            continue
        rows = {}
        for c in ET.fromstring(z.read(rels[s.get(REL)])).iter(M + 'c'):
            ref = c.get('r')
            col = re.match(r'[A-Z]+', ref).group()
            t = c.get('t')
            v = c.find(M + 'v')
            if t == 'inlineStr':
                val = ''.join(x.text or '' for x in c.iter(M + 't'))
            elif v is None or v.text is None:
                continue
            elif t == 's':
                val = ss[int(v.text)]
            else:
                val = v.text
            val = val.strip()
            if val:
                rows.setdefault(int(ref[len(col):]), {})[col] = val
        out[nm] = rows
    return out


def num(s):
    if s is None:
        return None
    m = re.search(r'-?\d[\d,]*\.?\d*(?:[eE]-?\d+)?', s)
    if not m:
        return None
    try:
        return float(m.group().replace(',', ''))
    except ValueError:
        return None


def right_of(row, col):
    """Cells to the right of col, in column order."""
    k = col_index(col)
    return [row[c] for c in sorted(row, key=col_index) if col_index(c) > k]


def find(rows, pattern):
    """(row number, col) of the first cell matching pattern."""
    rx = re.compile(pattern, re.I)
    for r in sorted(rows):
        for c in sorted(rows[r], key=col_index):
            if rx.search(rows[r][c]):
                return r, c
    return None, None


def value_after(rows, pattern, nth=0):
    """nth numeric cell to the right of the label matching pattern."""
    r, c = find(rows, pattern)
    if r is None:
        return None
    vals = [num(x) for x in right_of(rows[r], c)]
    vals = [v for v in vals if v is not None]
    return vals[nth] if len(vals) > nth else None


def time_after(rows, pattern):
    r, c = find(rows, pattern)
    if r is None:
        return None
    for x in right_of(rows[r], c):
        m = re.search(r'(\d{1,2}):(\d{2})', x)
        if m:
            return f'{int(m.group(1)):02d}:{m.group(2)}'
    return None


def date_of(text):
    m = re.search(r'(\d{1,2})-(\d{1,2})-(\d{4})', text or '')
    return f'{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}' if m else None


def parse_p1(p1):
    r, c = find(p1, r'^Date\s*:')
    day = date_of(' '.join(right_of(p1[r], c))) if r else None
    if not day:
        return None
    d = {'date': day}
    for key, pat in [('day_peak_gen', r'^Day Peak Generation'), ('day_peak_dem', r'^Day Peak Demand'),
                     ('eve_peak_gen', r'^Evening Peak Generation'), ('eve_peak_dem', r'^Evening Peak Demand'),
                     ('min_gen', r'^Minimum Generation of the Day'), ('max_gen', r'^Maximum Generation of the Day')]:
        d[key] = value_after(p1, pat)
        d[key + '_t'] = time_after(p1, pat)
    for key, pat in [('energy_gen_gwh', r'^Energy Generated'), ('energy_unserved_gwh', r'^Energy Unser'),
                     ('energy_dem_gwh', r'^Energy Demand'), ('tmax_c', r'^Maximum Temperature'),
                     ('gas_mmcfd', r'^Total Gas Supplied'), ('cost_tk_kwh', r'^Production Cost per'),
                     ('ew_flow_peak_mw', r'^Power Flow during Peak'), ('ew_flow_max_mw', r'^Maximum Power Flow'),
                     ('import_gwh', r'^Total Import through')]:
        d[key] = value_after(p1, pat)
    # fuel mix: header row with Gas | Coal | ... then a 'Total' row in the same columns
    hr, _ = find(p1, r'^Gas$')
    if hr:
        cols = {p1[hr][c]: c for c in p1[hr]}
        tr = next((r for r in sorted(p1) if r > hr and any(v == 'Total' for v in p1[r].values())), None)
        for f in FUELS:
            c = cols.get(f)
            d['mix_' + f.lower() + '_gwh'] = num(p1[tr].get(c)) if tr and c else None
    # zone table at the evening peak: Zone | Load-Shed | Demand
    zr, zc = find(p1, r'Load-?\s*Shed$')
    if zr:
        lc = zc
        dc = next((c for c in p1[zr] if re.match(r'(?i)demand', p1[zr][c])), None)
        name_col = next((c for c in p1[zr] if re.match(r'(?i)zone', p1[zr][c])), None)
        for r in range(zr + 1, zr + 14):
            row = p1.get(r, {})
            nm = row.get(name_col, '')
            key = 'Chattogram' if nm.startswith('Chatt') else nm
            if key in ZONES or key == 'Total':
                k = key.lower()
                d[f'ls_{k}_mw'] = num(row.get(lc))
                d[f'dem_{k}_mw'] = num(row.get(dc)) if dc else None
        m = re.search(r'\((\d{1,2}:\d{2})', ' '.join(p1.get(zr - 1, {}).values()))
        d['zone_table_t'] = m.group(1) if m else None
    # reports up to 22-01-2025 give energies in MWh (~220 000/day) where later ones use GWh (~320/day)
    if (d.get('energy_gen_gwh') or 0) > 2000:
        for k in list(d):
            if k.endswith('_gwh') and d[k] is not None:
                d[k] /= 1000.0
        d['energy_unit_fixed'] = 1
    return d


def parse_curve(lc):
    r, c = find(lc, r'^Date$')
    day = date_of(' '.join(right_of(lc[r], c))) if r else None
    out = []
    for r in sorted(lc):
        row = lc[r]
        t = row.get('A', '')
        if re.fullmatch(r'\d{1,2}:\d{2}', t):
            out.append({'date': day, 'time': f'{int(t.split(":")[0]):02d}:{t.split(":")[1]}',
                        'east_mw': num(row.get('B')), 'west_mw': num(row.get('C')), 'total_mw': num(row.get('D'))})
        elif re.fullmatch(r'0?\.\d+|0', t):  # some days store times as fractions of a day
            mins = round(float(t) * 1440)
            out.append({'date': day, 'time': f'{mins // 60:02d}:{mins % 60:02d}',
                        'east_mw': num(row.get('B')), 'west_mw': num(row.get('C')), 'total_mw': num(row.get('D'))})
    return day, out


def parse_forecast(fc):
    r, c = find(fc, r'^Forecast Scenario')
    day = date_of(fc[r][c]) if r else None
    if not day:
        r, c = find(fc, r'^Date\s*:')
        day = date_of(' '.join(right_of(fc[r], c))) if r else None
    if not day:
        return None
    d = {'date': day}
    for key, pat in [('f_tmax_c', r'^Probable Maximum Temperature'), ('f_day_peak_dem', r'^Probable Maximum Demand at Day'),
                     ('f_eve_peak_dem', r'^Probable Maximum Demand at Evening'),
                     ('f_eve_peak_gen', r'^Probable Maximum Generation at Evening'),
                     ('f_energy_gwh', r'^Probable Total Energy')]:
        r, c = find(fc, pat)
        d[key] = num(right_of(fc[r], c)[0]) if r and right_of(fc[r], c) else None
    # area-wise load-shed forecast: header row Dhaka | Chittagong | ... | Total, values on the next row
    hr, _ = find(fc, r'^Rangpur$')
    if hr:
        for c, nm in fc[hr].items():
            key = 'chattogram' if nm.startswith('Chitt') or nm.startswith('Chatt') else nm.lower()
            if key in [z.lower() for z in ZONES] + ['total']:
                d[f'f_ls_{key}_mw'] = num(fc.get(hr + 1, {}).get(c))
    # hourly forecast table: Hour | Generation | Load-Shed | Demand -> keep the evening-peak load-shed max
    hr, _ = find(fc, r'^Load-?Shed$')
    if hr:
        lcol = next(c for c in fc[hr] if re.match(r'(?i)load-?shed', fc[hr][c]))
        vals = [num(fc[r].get(lcol)) for r in range(hr + 1, hr + 30) if r in fc and num(fc[r].get(lcol)) is not None]
        d['f_ls_hourly_max_mw'] = max(vals) if vals else None
    return d


def write(path, rows):
    keys = []
    for r in rows:
        for k in r:
            if k not in keys:
                keys.append(k)
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)


def main():
    files = sorted(RAW.glob('*.xlsx'), key=lambda p: int(p.stem))
    daily, curve, fcast, bad = {}, {}, {}, []
    for p in files:
        try:
            sh = read_sheets(p, {'P1', 'L-Curve', 'Forecast'})
        except Exception as e:
            bad.append((p.stem, str(e)[:80]))
            continue
        if 'P1' not in sh:
            continue  # monthly QF-MIS-03 summary or another layout
        try:
            d = parse_p1(sh['P1'])
            if d:
                d['report_id'] = int(p.stem)
                daily[d['date']] = d
            if 'L-Curve' in sh:
                day, pts = parse_curve(sh['L-Curve'])
                if day and pts:
                    curve[day] = pts
            if 'Forecast' in sh:
                f = parse_forecast(sh['Forecast'])
                if f:
                    fcast[f['date']] = f
        except Exception as e:
            bad.append((p.stem, repr(e)[:80]))
    write(OUT / 'daily.csv', [daily[k] for k in sorted(daily)])
    write(OUT / 'curve.csv', [pt for k in sorted(curve) for pt in curve[k]])
    write(OUT / 'forecast.csv', [fcast[k] for k in sorted(fcast)])
    print(f'{len(files)} files -> {len(daily)} days ({min(daily)} .. {max(daily)}), '
          f'{len(curve)} curves, {len(fcast)} forecasts, {len(bad)} unreadable')
    for b in bad[:10]:
        print('  bad', *b)


if __name__ == '__main__':
    sys.exit(main())
