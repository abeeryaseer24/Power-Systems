"""Download PGCB daily operation reports (Bangladesh national grid) for the load-shedding study.

PGCB publishes one report per day on its ERP site; report ids run roughly in date order (id 5207 is
20-11-2026). This walks ids downward from the newest, keeps whatever file type the server returns
(.xlsx for recent years; older years may be .xls or .pdf), skips files already downloaded, and waits
between requests so the server is not loaded. Gaps and errors go to ml/data/pgcb/log.csv.

Usage:  ml/.venv/Scripts/python ml/fetch_pgcb.py [newest_id] [oldest_id]
"""
import csv
import pathlib
import sys
import time
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).parent
RAW = HERE / 'data' / 'pgcb' / 'raw'
RAW.mkdir(parents=True, exist_ok=True)
LOG = HERE / 'data' / 'pgcb' / 'log.csv'
BASE = 'https://erp.powergrid.gov.bd/web/files/download?location=erp%2Fweb%2Freport_docs%2F{id}.{ext}&title=Daily%20Report'
UA = 'blackstart-research/0.1'
TYPES = {'spreadsheetml': 'xlsx', 'ms-excel': 'xls', 'pdf': 'pdf'}


def get(rid, ext):
    req = urllib.request.Request(BASE.format(id=rid, ext=ext), headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        ctype = r.headers.get('Content-Type', '')
        return ctype, r.read()


def main():
    newest = int(sys.argv[1]) if len(sys.argv) > 1 else 5215
    oldest = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    have = {p.stem for p in RAW.iterdir()}
    log = open(LOG, 'a', newline='')
    w = csv.writer(log)
    got = miss = 0
    for rid in range(newest, oldest - 1, -1):
        if str(rid) in have:
            continue
        saved = False
        for ext in ('xlsx', 'xls', 'pdf'):
            for attempt in range(3):
                try:
                    ctype, data = get(rid, ext)
                    kind = next((v for k, v in TYPES.items() if k in ctype), None)
                    if kind and len(data) > 2000:
                        (RAW / f'{rid}.{kind}').write_bytes(data)
                        saved = True
                    break
                except urllib.error.HTTPError as e:
                    if e.code == 404:  # no such report with this extension: try the next one at once
                        break
                    if attempt == 2:
                        w.writerow([rid, ext, 'error', str(e)[:120]])
                    time.sleep(5 * (attempt + 1))
                except Exception as e:  # server busy or connection dropped: back off and retry
                    if attempt == 2:
                        w.writerow([rid, ext, 'error', str(e)[:120]])
                    time.sleep(5 * (attempt + 1))
            time.sleep(1.0)
            if saved:
                break
        if saved:
            got += 1
        else:
            miss += 1
            w.writerow([rid, '', 'missing', ''])
        log.flush()
        if (got + miss) % 25 == 0:
            print(f'id {rid}: {got} downloaded, {miss} missing', flush=True)
    print(f'done: {got} downloaded, {miss} missing', flush=True)


if __name__ == '__main__':
    main()
