"""Train the final GB day-ahead models on all data and export them for the browser.

Writes public/data/forecast/gb_model.json: the LightGBM trees for the median and the
10 % / 90 % quantiles in a compact form that src/ai/gbm.ts evaluates exactly, plus the
feature list and the latest embedded capacities. Also writes gb_backtest.json, a summary
of the latest backtest run for the page.

Usage:  ml/.venv/Scripts/python ml/export.py
"""
import json
import pathlib

import pandas as pd

import forecast as F

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent / 'public' / 'data' / 'forecast'
OUT.mkdir(parents=True, exist_ok=True)


def compact(booster):
    """Each tree as flat arrays: feature, threshold, left, right, value (leaves have feature -1)."""
    trees = []
    for t in booster.dump_model()['tree_info']:
        feat, thr, left, right, val = [], [], [], [], []

        def walk(n):
            i = len(feat)
            feat.append(-1); thr.append(0.0); left.append(-1); right.append(-1); val.append(0.0)
            if 'leaf_value' in n:
                val[i] = round(n['leaf_value'], 1)  # 0.1 MW: far below the forecast error
                return i
            feat[i] = n['split_feature']
            thr[i] = float(f"{n['threshold']:.6g}")  # 6 significant figures keeps every split on whole-MW data
            # missing values follow the default direction
            dl = n.get('default_left', True)
            l = walk(n['left_child']); r = walk(n['right_child'])
            left[i], right[i] = l, r
            if not dl:
                feat[i] = -2 - feat[i]  # encode "missing goes right"
            return i

        walk(t['tree_structure'])
        trees.append([feat, thr, left, right, val])
    return trees


def main():
    d = F.load_demand()
    feats = F.build(d, F.load_weather('weather_actual.csv'), F.load_weather('weather_forecast.csv'), F.holidays()).dropna(subset=F.FEATURES + ['ND'])
    models = {}
    for name, a in (('q10', 0.1), ('q50', None), ('q90', 0.9)):
        m = F.fit(feats, a)
        models[name] = compact(m.booster_)
        print(name, len(models[name]), 'trees')
    last = d.dropna().iloc[-1]
    spec = {
        'features': F.FEATURES, 'models': models,
        'solarCapacityMW': float(last['EMBEDDED_SOLAR_CAPACITY']), 'windCapacityMW': float(last['EMBEDDED_WIND_CAPACITY']),
        'cities': [{'name': n, 'lat': la, 'lon': lo, 'w': w} for (n, la, lo, w) in __import__('fetch_weather').CITIES],
        'trainedTo': str(feats['date'].max().date()),
        'holidays': sorted(str(h.date()) for h in F.holidays() if h.year >= 2025),
    }
    runs0 = sorted((HERE / 'runs').glob('20*'))
    cal = runs0[-1] / 'calibration.json' if runs0 else None
    spec['calibrationMW'] = json.loads(cal.read_text())['Q_live_MW'] if cal and cal.exists() else 0
    (OUT / 'gb_model.json').write_text(json.dumps(spec, separators=(',', ':')))
    print('model', round((OUT / 'gb_model.json').stat().st_size / 1e6, 2), 'MB')

    runs = sorted((HERE / 'runs').glob('20*'))
    if runs:
        r = runs[-1]
        res = json.loads((r / 'results.json').read_text())
        monthly = pd.read_csv(r / 'monthly_mape.csv')
        byp = pd.read_csv(r / 'mape_by_period.csv')
        imp = pd.read_csv(r / 'importance.csv', header=None, names=['f', 'v'], skiprows=1)
        pr = pd.read_csv(r / 'predictions.csv', parse_dates=['date'])
        # a few sample weeks to draw: a winter week, a summer week, and Christmas
        def week(start):
            w = pr[(pr['date'] >= start) & (pr['date'] < pd.Timestamp(start) + pd.Timedelta(days=7))]
            cols = ['outturn', 'neso', 'point', 'q10c' if 'q10c' in w else 'q10', 'q90c' if 'q90c' in w else 'q90']
            return w[cols].round(0).astype(int).values.tolist()
        samples = {k: week(v) for k, v in {'winter': '2025-01-13', 'summer': '2025-07-07', 'christmas': '2024-12-22'}.items()}
        summary = {'results': res, 'monthly': monthly.to_dict('records'), 'byPeriod': byp.to_dict('records'),
                   'importance': imp.head(12).to_dict('records'), 'samples': samples}
        (OUT / 'gb_backtest.json').write_text(json.dumps(summary, separators=(',', ':')))
        print('backtest summary from', r.name)


if __name__ == '__main__':
    main()
