"""Tonight's and tomorrow's load-shedding forecast for Bangladesh, updated from the newest NLDC daily report.

Runs anywhere with Python, pandas and LightGBM, without the 2.5 GB report archive: the state it needs (the last
60 days of parsed reports and the id of the newest one) lives in public/data/loadshed/live_state.json, and the
trained trees in public/data/loadshed/models.json (written by ml/loadshed_final.py train). Each run
  1. asks PGCB for report ids after the newest one it has and parses any new ones (ml/parse_pgcb.py functions),
  2. fetches the Open-Meteo temperature forecast for the same four cities as training,
  3. builds the features exactly as in training (ml/loadshed_final.py) and predicts,
  4. writes public/data/loadshed/live.json for the /load-shedding page, and the updated state.

Usage:  python ml/loadshed_live.py            (the GitHub workflow .github/workflows/loadshed.yml runs it daily)
        python ml/loadshed_live.py --seed     (create live_state.json from the local parsed archive)
"""
import datetime as dt
import json
import pathlib
import sys
import tempfile
import urllib.request

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import loadshed_final as F  # noqa: E402

PUB = HERE.parent / 'public' / 'data' / 'loadshed'
STATE = PUB / 'live_state.json'
KEEP = 60
UA = {'User-Agent': 'blackstart-research/0.1'}


def seed():
    d = pd.read_csv(HERE / 'data' / 'pgcb' / 'daily.csv')
    f = pd.read_csv(HERE / 'data' / 'pgcb' / 'forecast.csv')
    lt = pd.read_csv(HERE / 'data' / 'pgcb' / 'long_daily.csv')
    st = {'last_id': int(d.report_id.max()), 'daily': d.tail(KEEP).to_dict('records'), 'forecast': f.tail(KEEP + 2).to_dict('records'),
          'weather': lt[['date', 'tmax', 'rh']].tail(KEEP).to_dict('records')}
    STATE.write_text(json.dumps(st, separators=(',', ':'), default=lambda x: None if x != x else x))
    print('seeded', STATE, 'last id', st['last_id'])


def fetch_new(st, tries=12):
    """Download and parse report ids after the newest one; stop after 4 missing ids in a row past a hit."""
    import fetch_pgcb as FP
    import parse_pgcb as PP
    daily = {r['date']: r for r in st['daily']}
    fc = {r['date']: r for r in st['forecast']}
    got, miss = 0, 0
    rid = st['last_id']
    for rid_try in range(st['last_id'] + 1, st['last_id'] + 1 + tries):
        try:
            ctype, data = FP.get(rid_try, 'xlsx')
        except Exception as e:  # 404 or network trouble
            print('id', rid_try, 'not available:', str(e)[:60])
            miss += 1
            if got and miss >= 4:
                break
            continue
        if 'spreadsheetml' not in ctype or len(data) < 2000:
            miss += 1
            continue
        with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as t:
            t.write(data)
            path = pathlib.Path(t.name)
        sh = PP.read_sheets(path, {'P1', 'L-Curve', 'Forecast'})
        path.unlink()
        if 'P1' not in sh:
            continue
        d = PP.parse_p1(sh['P1'])
        if d:
            d['report_id'] = rid_try
            daily[d['date']] = d
        if 'Forecast' in sh:
            f = PP.parse_forecast(sh['Forecast'])
            if f:
                fc[f['date']] = f
        rid, got, miss = rid_try, got + 1, 0
        print('parsed report', rid_try, d and d['date'])
    st['last_id'] = rid
    st['daily'] = [daily[k] for k in sorted(daily)][-KEEP:]
    st['forecast'] = [fc[k] for k in sorted(fc)][-(KEEP + 2):]
    return got


def weather_forecast(st, days):
    """Open-Meteo forecast (past days included) for the four training cities: mean daily max temperature and RH."""
    cols = []
    for name, la, lo in F.CITIES:
        url = (f'https://api.open-meteo.com/v1/forecast?latitude={la}&longitude={lo}&daily=temperature_2m_max,relative_humidity_2m_mean'
               f'&past_days=10&forecast_days=3&timezone=Asia%2FDhaka')
        j = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        cols.append(pd.DataFrame({'date': j['daily']['time'], f't{name}': j['daily']['temperature_2m_max'], f'r{name}': j['daily']['relative_humidity_2m_mean']}).set_index('date'))
    w = pd.concat(cols, axis=1)
    w['tmax'] = w[[c for c in w if c.startswith('t')]].mean(axis=1)
    w['rh'] = w[[c for c in w if c.startswith('r')]].mean(axis=1)
    old = {r['date']: r for r in st['weather']}
    for k, r in w.iterrows():
        old[k] = {'date': k, 'tmax': round(float(r.tmax), 2), 'rh': round(float(r.rh), 1)}
    st['weather'] = [old[k] for k in sorted(old)][-(KEEP + 3):]


def main():
    if '--seed' in sys.argv:
        return seed()
    st = json.loads(STATE.read_text())
    try:
        n = fetch_new(st)
    except Exception as e:
        print('report fetch failed:', e)
        n = 0
    try:
        weather_forecast(st, 3)
    except Exception as e:
        print('weather fetch failed:', e)
    d = pd.DataFrame(st['daily'])
    d['date'] = pd.to_datetime(d['date'])
    f = pd.DataFrame(st['forecast'])
    f['date'] = pd.to_datetime(f['date'])
    w = pd.DataFrame(st['weather'])
    w['date'] = pd.to_datetime(w['date'])
    live = F.predict_live(d.set_index('date'), f.set_index('date'), w.set_index('date'))
    live['updated'] = dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes')
    live['last_report_id'] = st['last_id']
    live['new_reports'] = n
    (PUB / 'live.json').write_text(json.dumps(live, separators=(',', ':')))
    STATE.write_text(json.dumps(st, separators=(',', ':'), default=lambda x: None if x != x else x))
    print('tonight', live['tonight']['date'], round(live['tonight']['pred']), 'MW', 'p_any', round(live['tonight']['p_any'], 2))


if __name__ == '__main__':
    main()
