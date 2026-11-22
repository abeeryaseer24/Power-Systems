"""Final load-shedding predictor: one model for tonight, one for tomorrow, trained on the whole 11.5-year series.

Tonight (h=1, made at ~11:00 with actuals to yesterday): the long-history features of ml/loadshed_long.py plus
NLDC's plan for today where it exists (from 2025; missing before, which gradient-boosted trees handle natively).
Tomorrow (h=2): the long-history features only (NLDC publishes no plan that far ahead).

  python ml/loadshed_final.py window   backtest the unified tonight model on 2025-07.. (same months as
                                       ml/loadshed.py) and compare with the plan-only and history-only models
  python ml/loadshed_final.py train    fit the final models and write public/data/loadshed/models.json
                                       (trees evaluated by the page and by the daily job alike)

predict_live() is used by ml/loadshed_live.py: it rebuilds the features from the recent days in the same way.
"""
import json
import pathlib
import sys

import lightgbm as lgb
import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import loadshed_long as LL  # noqa: E402

DATA = HERE / 'data' / 'pgcb'
PUB = HERE.parent / 'public' / 'data' / 'loadshed'
CITIES = LL.CITIES
SEVERE = LL.SEVERE
ZONES = ['dhaka', 'chattogram', 'cumilla', 'mymensingh', 'sylhet', 'khulna', 'barishal', 'rajshahi', 'rangpur']
PLAN = ['f_ls_total_mw', 'f_eve_peak_dem', 'f_eve_peak_gen', 'f_margin', 'f_fuel_short_mw', 'f_out_gas_mw', 'f_out_liquid_mw',
        'f_out_coal_mw', 'f_out_maint_mw', 'gen_promise_miss_l0']
REG_KIND = 'blend'  # mean of a Tweedie model and persistence: the best form in the 2018-2026 backtest of ml/loadshed_long.py


def plan_features(d, fc):
    """NLDC's plan for each target day (h=1), aligned to the long daily index."""
    fc = fc.reindex(d.index)
    P = pd.DataFrame(index=d.index)
    P['f_ls_total_mw'] = fc['f_ls_total_mw']
    P['f_eve_peak_dem'] = fc['f_eve_peak_dem']
    P['f_eve_peak_gen'] = fc['f_eve_peak_gen']
    P['f_margin'] = fc['f_eve_peak_gen'] - fc['f_eve_peak_dem']
    P['f_fuel_short_mw'] = fc['f_out_gas_mw'] + fc['f_out_liquid_mw'] + fc['f_out_coal_mw']
    for k in ('gas', 'liquid', 'coal', 'maint'):
        P[f'f_out_{k}_mw'] = fc[f'f_out_{k}_mw']
    P['gen_promise_miss_l0'] = (fc['f_eve_peak_gen'] - d['eve_gen']).shift(1)
    return P


def tonight_X(d, fc):
    return pd.concat([LL.features(d, 1), plan_features(d, fc)], axis=1)


def tomorrow_X(d):
    return LL.features(d, 2)


def load():
    d = pd.read_csv(DATA / 'long_daily.csv', parse_dates=['date']).set_index('date').asfreq('D')
    fc = pd.read_csv(DATA / 'forecast.csv', parse_dates=['date']).set_index('date')
    return d, fc


def fit_set(X, y, seeds=LL.SEEDS):
    m = {'reg': LL.fit(LL.TWD, X, y, LL.ROUNDS['twd'], seeds),
         'any': LL.fit(LL.CLS, X, (y > 0).astype(int), LL.ROUNDS['cls'], seeds),
         'sev': LL.fit(LL.CLS, X, (y > SEVERE).astype(int), LL.ROUNDS['cls'], seeds)}
    return m


def predict_set(m, X):
    base = X['shed_l0'].fillna(0).values
    r = LL.pred(m['reg'], X)  # Tweedie: LightGBM returns exp(raw score), in MW
    mw = 0.5 * (r + base)
    return mw, LL.pred(m['any'], X), LL.pred(m['sev'], X)


def window():
    """Unified tonight model on the 2025-07 .. test months, against the plan-only and history-only models."""
    d, fc = load()
    X, y = tonight_X(d, fc), d.eve_shed
    ok = y.notna() & X['shed_l0'].notna()
    rows = []
    for mo in pd.period_range('2025-07', d.index[ok].max(), freq='M'):
        tr = ok & (d.index < mo.start_time)
        te = ok & (d.index >= mo.start_time) & (d.index <= mo.end_time.normalize())
        m = fit_set(X[tr], y[tr])
        o = pd.DataFrame(index=d.index[te])
        o['actual'] = y[te]
        o['unified'], o['p_any'], o['p_sev'] = predict_set(m, X[te])
        rows.append(o)
        print(mo, 'MAE unified', round(float(np.mean(np.abs(o.unified - o.actual)))), flush=True)
    bt = pd.concat(rows)
    plan = pd.read_csv(DATA / 'loadshed_bt.csv', parse_dates=['date']).set_index('date')
    hist = pd.read_csv(DATA / 'long_bt_h1.csv', parse_dates=['date']).set_index('date')
    j = bt.join(plan[['pred', 'nldc', 'persist', 'avg2', 'blend']].rename(columns={'pred': 'plan_model', 'blend': 'plan_blend'}), how='inner')
    j = j.join(hist[[LL_KEY]].rename(columns={LL_KEY: 'history'}), how='inner')  # history-only, same blend form
    j['unified_avg'] = (j.unified + j.nldc + j.persist) / 3
    a = j.actual.values
    keys = ['nldc', 'persist', 'avg2', 'plan_model', 'plan_blend', 'history', 'unified', 'unified_avg']
    res = {'days': int(len(j)), 'MAE': {k: float(np.mean(np.abs(j[k] - a))) for k in keys}}
    res['unified_vs_nldc'] = LL.block_boot(np.abs(j.unified - a) - np.abs(j.nldc - a))
    res['unified_vs_avg2'] = LL.block_boot(np.abs(j.unified - a) - np.abs(j.avg2 - a))
    res['unified_vs_persist'] = LL.block_boot(np.abs(j.unified - a) - np.abs(j.persist - a))
    from sklearn.metrics import roc_auc_score
    res['auc_any'] = float(roc_auc_score(a > 0, j.p_any))
    res['hit_any'] = float(np.mean(j.p_any[a > 0] > 0.5))
    res['false_any'] = float(np.mean(j.p_any[a <= 0] > 0.5))
    j.to_csv(DATA / 'unified_bt.csv', index_label='date')
    print(json.dumps(res, indent=1))
    (PUB / 'bd_unified.json').write_text(json.dumps(res, separators=(',', ':')))


LL_KEY = 'blend'


def compact(booster, digits):
    trees = []
    for t in booster.dump_model()['tree_info']:
        feat, thr, left, right, val = [], [], [], [], []

        def walk(n):
            i = len(feat)
            feat.append(-1); thr.append(0.0); left.append(-1); right.append(-1); val.append(0.0)
            if 'leaf_value' in n:
                val[i] = round(n['leaf_value'], digits)
                return i
            feat[i] = n['split_feature']
            thr[i] = float(f"{n['threshold']:.7g}")
            dl = n.get('default_left', True)
            l = walk(n['left_child']); r = walk(n['right_child'])
            left[i], right[i] = l, r
            if not dl:
                feat[i] = -2 - feat[i]
            return i
        walk(t['tree_structure'])
        trees.append([feat, thr, left, right, val])
    return trees


def train():
    d, fc = load()
    y = d.eve_shed
    out = {'regKind': REG_KIND, 'severeMW': SEVERE, 'trainedTo': str(d.index[y.notna()].max().date()), 'sets': {}}
    for name, X in (('tonight', tonight_X(d, fc)), ('tomorrow', tomorrow_X(d))):
        ok = y.notna() & X['shed_l0'].notna()
        m = fit_set(X[ok], y[ok])
        js = {'features': list(X.columns)}
        for k, ms in m.items():
            js[k] = []
            for b in ms:
                js[k].append(compact(b, 5))  # log-space and log-odds leaves: keep 5 decimals
        out['sets'][name] = js
        imp = pd.Series(np.mean([b.feature_importance('gain') for b in m['reg']], axis=0), index=X.columns)
        js['importance'] = [{'f': f, 'v': float(v)} for f, v in (imp / imp.sum()).sort_values(ascending=False).head(12).items()]
        print(name, 'trained on', int(ok.sum()), 'days')
    (PUB / 'models.json').write_text(json.dumps(out, separators=(',', ':')))
    print('wrote models.json', round((PUB / 'models.json').stat().st_size / 1e6, 2), 'MB')


# ------------------------------------------------------------------ live
def _tree(t, x):
    """One exported tree, evaluated exactly as src/ai/gbm.ts does."""
    feat, thr, left, right, val = t
    i = 0
    while True:
        f = feat[i]
        if f == -1:
            return val[i]
        miss_right = f <= -2
        if miss_right:
            f = -2 - f
        v = x[f]
        if v is None or v != v:
            i = right[i] if miss_right else left[i]
        else:
            i = left[i] if v <= thr[i] else right[i]


def eval_set(js, x):
    """Tonight's or tomorrow's forecast from the exported trees (public/data/loadshed/models.json): the same
    numbers the page computes, so the daily job needs neither LightGBM nor model files."""
    raw = lambda trees: sum(_tree(t, x) for t in trees)
    base = x[js['features'].index('shed_l0')] or 0.0
    twd = float(np.mean([np.exp(raw(ts)) for ts in js['reg']]))
    p_any = float(np.mean([1 / (1 + np.exp(-raw(ts))) for ts in js['any']]))
    p_sev = float(np.mean([1 / (1 + np.exp(-raw(ts))) for ts in js['sev']]))
    return 0.5 * (twd + base), p_any, p_sev


def report_to_long(r, w):
    """Report-format daily rows (parse_pgcb.parse_p1) to the long-series columns, as loadshed_long.report_daily()."""
    d = pd.DataFrame({
        'eve_shed': r.ls_total_mw, 'eve_dem': r.eve_peak_dem, 'eve_gen': r.eve_peak_gen,
        'day_shed': (r.day_peak_dem - r.day_peak_gen).clip(lower=0), 'day_dem': r.day_peak_dem, 'day_gen': r.day_peak_gen,
        'min_gen': r.min_gen, 'unserved_gwh': r.energy_unserved_gwh,
        'gas_gwh': r.mix_gas_gwh, 'liquid_gwh': r.mix_hfo_gwh.fillna(0) + r.mix_hsd_gwh.fillna(0),
        'coal_gwh': r.mix_coal_gwh, 'import_gwh': r.mix_import_gwh,
    }).astype(float)
    last = d.index.max()
    d = d.reindex(pd.date_range(d.index.min(), last + pd.Timedelta(days=2), freq='D'))
    return d.join(w[['tmax', 'rh']])


def predict_live(daily, forecast, weather):
    for c in daily.columns:
        if c not in ('date',):
            daily[c] = pd.to_numeric(daily[c], errors='coerce')
    d = report_to_long(daily, weather)
    fc = forecast.apply(pd.to_numeric, errors='coerce')
    last = daily.index.max()
    t0, t1 = last + pd.Timedelta(days=1), last + pd.Timedelta(days=2)
    Xt, Xm = tonight_X(d, fc), tomorrow_X(d)
    models = json.loads((PUB / 'models.json').read_text())
    out = {'lastActual': str(last.date())}
    for name, X, day in (('tonight', Xt, t0), ('tomorrow', Xm, t1)):
        js = models['sets'][name]
        assert list(X.columns) == js['features'], f'{name}: live features differ from the trained ones'
        x = X.loc[[day]]
        xv = [None if pd.isna(v) else float(v) for v in x.iloc[0].values]
        mw, pa, ps = eval_set(js, xv)
        out[name] = {'date': str(day.date()), 'pred': mw, 'p_any': pa, 'p_sev': ps,
                     'persist': float(x['shed_l0'].iloc[0]) if pd.notna(x['shed_l0'].iloc[0]) else None,
                     'tmax': float(x['tmax'].iloc[0]) if pd.notna(x['tmax'].iloc[0]) else None,
                     'x': [None if pd.isna(v) else round(float(v), 4) for v in x.iloc[0].values]}
    pl = fc['f_ls_total_mw'].get(t0)
    out['tonight']['nldc'] = None if pl is None or pd.isna(pl) else float(pl)
    # zone split: the share of each zone in the last 7 days' shedding (equal shares if there was none)
    rec = daily.tail(7)
    tot = rec['ls_total_mw'].sum()
    shares = {z: (float(rec[f'ls_{z}_mw'].sum() / tot) if tot > 0 else 1 / len(ZONES)) for z in ZONES}
    out['zoneShares'] = shares
    out['recent'] = [[str(i.date()), None if pd.isna(r.ls_total_mw) else round(float(r.ls_total_mw)),
                      None if pd.isna(fc['f_ls_total_mw'].get(i, np.nan)) else round(float(fc['f_ls_total_mw'].get(i)))]
                     for i, r in daily.tail(45).iterrows()]
    return out


if __name__ == '__main__':
    {'window': window, 'train': train}[sys.argv[1]]()
