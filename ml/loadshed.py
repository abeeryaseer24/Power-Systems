"""Bangladesh load-shedding predictor: same-day evening-peak load shed from what NLDC knows at ~11:00.

Information set. PGCB's daily report for day D is issued at about 11:00 on D+1 and carries D's actuals
together with NLDC's forecast for D+1. So when the forecast for day D is published, the latest actuals are
for D-1. The predictor uses exactly that: actuals up to D-1, NLDC's forecast for D, and the calendar.
Target: load shed (MW, substation end) at the evening-peak hour of day D, national and per zone.

Protocol. Expanding window, retrained at the start of every month on all earlier days, test from
2025-07-01. Baselines: NLDC's own load-shed forecast, persistence (yesterday's evening-peak shed),
and the 7-day mean. Intervals: paired block bootstrap (7-day blocks) on MAE differences.

Outputs: ml/data/pgcb/loadshed_bt.csv (every test day) and public/data/loadshed/bd_backtest.json.
Usage:   ml/.venv/Scripts/python ml/loadshed.py
"""
import json
import pathlib
import warnings

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

warnings.filterwarnings('ignore', category=pd.errors.PerformanceWarning)

HERE = pathlib.Path(__file__).parent
DATA = HERE / 'data' / 'pgcb'
OUT = HERE.parent / 'public' / 'data' / 'loadshed'
OUT.mkdir(parents=True, exist_ok=True)
ZONES = ['dhaka', 'chattogram', 'cumilla', 'mymensingh', 'sylhet', 'khulna', 'barishal', 'rajshahi', 'rangpur']
TEST_FROM = '2025-07-01'
SEVERE = 1000.0  # MW at the evening peak
SEEDS = 5

# Ramadan and Eid holiday windows for Bangladesh (moon-sighting dates, may be off by one day)
RAMADAN = [('2025-03-02', '2025-03-30'), ('2026-02-19', '2026-03-20')]
EID = [('2025-03-28', '2025-04-05'), ('2025-06-05', '2025-06-14'), ('2026-03-18', '2026-03-25'), ('2026-05-24', '2026-06-01')]


def in_windows(dates, wins):
    m = np.zeros(len(dates), bool)
    for a, b in wins:
        m |= (dates >= a) & (dates <= b)
    return m.astype(int)


def build(d=None, f=None):
    """Feature and target frames. d, f: daily and forecast tables indexed by date (default: the parsed CSVs);
    ml/loadshed_live.py passes the recent days kept in the repository so the live features match training."""
    if d is None:
        d = pd.read_csv(DATA / 'daily.csv', parse_dates=['date']).set_index('date')
    if f is None:
        f = pd.read_csv(DATA / 'forecast.csv', parse_dates=['date']).set_index('date')
    d = d.asfreq('D')
    idx = pd.date_range(d.index.min(), f.index.max(), freq='D')
    d, f = d.reindex(idx), f.reindex(idx)
    X = pd.DataFrame(index=idx)
    # NLDC's forecast for the day itself
    for c in ['f_tmax_c', 'f_day_peak_dem', 'f_eve_peak_dem', 'f_eve_peak_gen', 'f_energy_gwh', 'f_ls_total_mw', 'f_ls_hourly_max_mw']:
        X[c] = f[c]
    X['f_margin'] = f['f_eve_peak_gen'] - f['f_eve_peak_dem']
    # capacity NLDC expects to be out today, by the reason in the plant table, and availability by fuel
    for k in ('gas', 'liquid', 'coal', 'maint', 'contract', 'other'):
        X[f'f_out_{k}_mw'] = f[f'f_out_{k}_mw']
        X[f'f_out_{k}_chg'] = f[f'f_out_{k}_mw'] - f[f'f_out_{k}_mw'].shift(1)
    for k in ('gas', 'hfo', 'coal', 'import'):
        X[f'f_eff_{k}_mw'] = f[f'f_eff_{k}_mw']
    X['f_fuel_short_mw'] = f['f_out_gas_mw'] + f['f_out_liquid_mw'] + f['f_out_coal_mw']
    # how far NLDC's promises missed yesterday: forecast generation vs generation actually delivered
    X['gen_promise_miss_d1'] = (f['f_eve_peak_gen'] - d['eve_peak_gen']).shift(1)
    X['dem_fc_err_d1'] = (d['eve_peak_dem'] - f['f_eve_peak_dem']).shift(1)
    X['f_margin_adj'] = X['f_margin'] - X['gen_promise_miss_d1']
    # yesterday's (and recent) actuals
    lag = {'ls_total_mw': [1, 2, 7], 'energy_unserved_gwh': [1, 2], 'eve_peak_dem': [1, 7], 'eve_peak_gen': [1, 7],
           'gas_mmcfd': [1, 2], 'mix_hfo_gwh': [1], 'mix_coal_gwh': [1], 'mix_import_gwh': [1], 'mix_gas_gwh': [1],
           'cost_tk_kwh': [1], 'tmax_c': [1], 'min_gen': [1], 'day_peak_dem': [1], 'day_peak_gen': [1]}
    for c, ls in lag.items():
        for k in ls:
            X[f'{c}_d{k}'] = d[c].shift(k)
    X['ls_mean7'] = d['ls_total_mw'].shift(1).rolling(7, min_periods=3).mean()
    X['ls_max7'] = d['ls_total_mw'].shift(1).rolling(7, min_periods=3).max()
    X['unserved_mean7'] = d['energy_unserved_gwh'].shift(1).rolling(7, min_periods=3).mean()
    X['gas_trend7'] = d['gas_mmcfd'].shift(1) - d['gas_mmcfd'].shift(1).rolling(7, min_periods=3).mean()
    X['shortfall_d1'] = (d['eve_peak_dem'] - d['eve_peak_gen']).shift(1)
    X['day_short_d1'] = (d['day_peak_dem'] - d['day_peak_gen']).shift(1)
    for z in ZONES:
        X[f'ls_{z}_d1'] = d[f'ls_{z}_mw'].shift(1)
        X[f'share_{z}_d1'] = (d[f'ls_{z}_mw'] / d['ls_total_mw'].where(d['ls_total_mw'] > 0)).shift(1)
    ds = idx.strftime('%Y-%m-%d')
    X['dow'] = idx.day_of_week  # Friday = 4, Saturday = 5: the Bangladesh weekend
    X['weekend'] = idx.day_of_week.isin([4, 5]).astype(int)
    X['doy_s'] = np.sin(2 * np.pi * idx.day_of_year / 365.25)
    X['doy_c'] = np.cos(2 * np.pi * idx.day_of_year / 365.25)
    X['ramadan'] = in_windows(ds, RAMADAN)
    X['eid'] = in_windows(ds, EID)
    Y = pd.DataFrame(index=idx)
    Y['total'] = d['ls_total_mw']
    for z in ZONES:
        Y[z] = d[f'ls_{z}_mw']
    return X, Y, d, f


PARAMS = dict(objective='tweedie', tweedie_variance_power=1.3, learning_rate=0.03, num_leaves=15, min_data_in_leaf=12,
              feature_fraction=0.7, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, verbose=-1)
# national MW: a Huber-loss correction to NLDC's own load-shed forecast (trees cannot extrapolate to shed levels
# never seen in training; a residual on NLDC's number can). Chosen over direct Tweedie, residual-on-persistence
# and ridge in ml/loadshed.py's development runs (MAE 242 vs 274 / 244 / 253 MW).
RES = dict(objective='huber', alpha=300.0, learning_rate=0.03, num_leaves=7, min_data_in_leaf=15, feature_fraction=0.7,
           bagging_fraction=0.8, bagging_freq=1, lambda_l2=5.0, verbose=-1)
CLS = dict(objective='binary', learning_rate=0.03, num_leaves=7, min_data_in_leaf=15, feature_fraction=0.7,
           bagging_fraction=0.8, bagging_freq=1, lambda_l2=2.0, verbose=-1)


def fit_predict(params, Xtr, ytr, Xte, rounds, seeds=SEEDS):
    p = np.zeros(len(Xte))
    if ytr.fillna(0).sum() == 0 or ytr.nunique() < 2:  # zone never shed in the training window
        return p + float(ytr.fillna(0).mean()), None
    for s in range(seeds):
        m = lgb.train({**params, 'seed': s}, lgb.Dataset(Xtr, ytr), rounds)
        p += m.predict(Xte) / seeds
    return p, m


def block_boot(a, b, n=2000, block=7, seed=0):
    """95 % CI of mean(a - b) by moving-block bootstrap over days."""
    rng = np.random.default_rng(seed)
    diff = np.asarray(a) - np.asarray(b)
    T = len(diff)
    nb = int(np.ceil(T / block))
    means = []
    for _ in range(n):
        starts = rng.integers(0, T - block + 1, nb)
        sample = np.concatenate([diff[s:s + block] for s in starts])[:T]
        means.append(sample.mean())
    return float(np.mean(diff)), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def main():
    X, Y, d, f = build()
    have = Y['total'].notna()
    months = pd.period_range(TEST_FROM, X.index[have].max(), freq='M')
    rows, gains = [], None
    for mo in months:
        start, end = mo.start_time, mo.end_time.normalize()
        tr = have & (X.index < start)
        te = (X.index >= start) & (X.index <= end) & have
        if te.sum() == 0:
            continue
        Xtr, Xte = X[tr], X[te]
        out = pd.DataFrame(index=X.index[te])
        out['actual'] = Y.loc[te, 'total']
        base_tr, base_te = X.loc[tr, 'f_ls_total_mw'].fillna(0), X.loc[te, 'f_ls_total_mw'].fillna(0)
        r, m = fit_predict(RES, Xtr, Y.loc[tr, 'total'] - base_tr, Xte, 300)
        out['pred'] = np.clip(base_te.values + r, 0, None)
        g = pd.Series(m.feature_importance('gain'), index=X.columns)
        gains = g if gains is None else gains + g
        out['p_any'], _ = fit_predict(CLS, Xtr, (Y.loc[tr, 'total'] > 0).astype(int), Xte, 300)
        ysev = (Y.loc[tr, 'total'] > SEVERE).astype(int)
        out['p_severe'] = fit_predict(CLS, Xtr, ysev, Xte, 300)[0] if ysev.sum() >= 5 else 0.0
        for z in ZONES:
            out[f'act_{z}'] = Y.loc[te, z]
            out[f'pred_{z}'], _ = fit_predict(PARAMS, Xtr, Y.loc[tr, z], Xte, 300, seeds=2)
        rows.append(out)
        print(f'{mo}: train {tr.sum()} test {te.sum()}  MAE model {np.mean(np.abs(out.pred - out.actual)):.0f}'
              f'  NLDC {np.mean(np.abs(X.loc[te, "f_ls_total_mw"] - out.actual)):.0f}'
              f'  persist {np.mean(np.abs(X.loc[te, "ls_total_mw_d1"] - out.actual)):.0f}')
    bt = pd.concat(rows)
    bt['nldc'] = X.loc[bt.index, 'f_ls_total_mw'].fillna(0)
    bt['persist'] = X.loc[bt.index, 'ls_total_mw_d1'].fillna(0)
    bt['mean7'] = X.loc[bt.index, 'ls_mean7'].fillna(0)
    bt['avg2'] = 0.5 * (bt['nldc'] + bt['persist'])          # no learning at all
    bt['blend'] = (bt['pred'] + bt['nldc'] + bt['persist']) / 3  # model + both baselines
    bt.to_csv(DATA / 'loadshed_bt.csv', index_label='date')

    a = bt['actual'].values
    any_, sev = a > 0, a > SEVERE
    res = {'test_days': int(len(bt)), 'from': str(bt.index.min().date()), 'to': str(bt.index.max().date()),
           'days_with_shed': int(any_.sum()), 'days_severe': int(sev.sum()), 'severe_mw': SEVERE}
    res['MAE_MW'] = {k: float(np.mean(np.abs(bt[k] - a))) for k in ['pred', 'nldc', 'persist', 'mean7', 'avg2', 'blend']}
    res['RMSE_MW'] = {k: float(np.sqrt(np.mean((bt[k] - a) ** 2))) for k in ['pred', 'nldc', 'persist', 'mean7', 'avg2', 'blend']}
    res['bias_MW'] = {k: float(np.mean(bt[k] - a)) for k in ['pred', 'nldc', 'persist']}
    res['energy_MWh_peak'] = float(a.sum())
    res['vs_nldc'] = block_boot(np.abs(bt['pred'] - a), np.abs(bt['nldc'] - a))
    res['vs_persist'] = block_boot(np.abs(bt['pred'] - a), np.abs(bt['persist'] - a))
    res['avg2_vs_nldc'] = block_boot(np.abs(bt['avg2'] - a), np.abs(bt['nldc'] - a))
    res['blend_vs_nldc'] = block_boot(np.abs(bt['blend'] - a), np.abs(bt['nldc'] - a))
    res['blend_vs_avg2'] = block_boot(np.abs(bt['blend'] - a), np.abs(bt['avg2'] - a))
    # the 2026 surge: months with mean evening-peak shed above 500 MW
    surge = bt.groupby(bt.index.to_period('M'))['actual'].transform('mean') > 500
    res['surge_days'] = int(surge.sum())
    res['MAE_surge'] = {k: float(np.mean(np.abs(bt[k][surge] - a[surge]))) for k in ['pred', 'nldc', 'persist', 'avg2', 'blend']}
    res['MAE_calm'] = {k: float(np.mean(np.abs(bt[k][~surge] - a[~surge]))) for k in ['pred', 'nldc', 'persist', 'avg2', 'blend']}
    # will there be load shedding at the evening peak today?
    res['any'] = {
        'auc_model': float(roc_auc_score(any_, bt['p_any'])),
        'auc_nldc': float(roc_auc_score(any_, bt['nldc'])),
        'auc_persist': float(roc_auc_score(any_, bt['persist'])),
        'acc_model': float(np.mean((bt['p_any'] > 0.5) == any_)),
        'acc_nldc': float(np.mean((bt['nldc'] > 0) == any_)),
        'acc_persist': float(np.mean((bt['persist'] > 0) == any_)),
        'hit_model': float(np.mean(bt['p_any'][any_] > 0.5)), 'hit_nldc': float(np.mean(bt['nldc'][any_] > 0)),
        'hit_persist': float(np.mean(bt['persist'][any_] > 0)),
        'false_model': float(np.mean(bt['p_any'][~any_] > 0.5)), 'false_nldc': float(np.mean(bt['nldc'][~any_] > 0)),
        'false_persist': float(np.mean(bt['persist'][~any_] > 0)),
        'brier_model': float(np.mean((bt['p_any'] - any_) ** 2)),
    }
    if sev.any() and (~sev).any():
        res['severe'] = {'auc_model': float(roc_auc_score(sev, bt['p_severe'])),
                         'auc_nldc': float(roc_auc_score(sev, bt['nldc'])),
                         'auc_persist': float(roc_auc_score(sev, bt['persist'])),
                         'hit_model': float(np.mean(bt['p_severe'][sev] > 0.5)),
                         'hit_nldc': float(np.mean(bt['nldc'][sev] > SEVERE)),
                         'hit_persist': float(np.mean(bt['persist'][sev] > SEVERE)),
                         'false_model': float(np.mean(bt['p_severe'][~sev] > 0.5)),
                         'false_nldc': float(np.mean(bt['nldc'][~sev] > SEVERE)),
                         'false_persist': float(np.mean(bt['persist'][~sev] > SEVERE))}
    # calibration of P(any) in five bins
    bins = np.linspace(0, 1, 6)
    cal = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        m = (bt['p_any'] >= lo) & (bt['p_any'] < hi if hi < 1 else bt['p_any'] <= hi)
        if m.sum():
            cal.append({'p': float(bt['p_any'][m].mean()), 'obs': float(any_[m].mean()), 'n': int(m.sum())})
    res['calibration_any'] = cal
    zones = []
    for z in ZONES:
        az = bt[f'act_{z}'].values
        pz = bt[f'pred_{z}'].values
        pers = X.loc[bt.index, f'ls_{z}_d1'].fillna(0).values
        nz = X.loc[bt.index, f'f_ls_{z}_mw'].fillna(0).values if f'f_ls_{z}_mw' in X else np.zeros(len(az))
        zones.append({'zone': z, 'mean_actual': float(az.mean()), 'mae_model': float(np.mean(np.abs(pz - az))),
                      'mae_persist': float(np.mean(np.abs(pers - az))), 'days': int((az > 0).sum())})
    res['zones'] = zones
    print(json.dumps({k: res[k] for k in ['MAE_MW', 'vs_nldc', 'vs_persist', 'avg2_vs_nldc', 'blend_vs_nldc', 'blend_vs_avg2', 'MAE_surge', 'MAE_calm', 'any']}, indent=1))
    if 'severe' in res:
        print('severe', json.dumps(res['severe']))

    # NLDC's zone forecasts were not in the X frame above: attach them for the zone table
    for zr in res['zones']:
        col = f'f_ls_{zr["zone"]}_mw'
        if col in f:
            zr['mae_nldc'] = float(np.mean(np.abs(f.loc[bt.index, col].fillna(0).values - bt[f'act_{zr["zone"]}'].values)))

    # final model on every labelled day, for the days with a forecast but no actual yet
    fut = X.index[(~have) & X['f_eve_peak_dem'].notna() & (X.index > X.index[have].max())]
    nowcast = []
    if len(fut):
        Xtr = X[have]
        r, _ = fit_predict(RES, Xtr, Y.loc[have, 'total'] - X.loc[have, 'f_ls_total_mw'].fillna(0), X.loc[fut], 300)
        p = np.clip(X.loc[fut, 'f_ls_total_mw'].fillna(0).values + r, 0, None)
        pa, _ = fit_predict(CLS, Xtr, (Y.loc[have, 'total'] > 0).astype(int), X.loc[fut], 300)
        ps, _ = fit_predict(CLS, Xtr, (Y.loc[have, 'total'] > SEVERE).astype(int), X.loc[fut], 300)
        zp = {z: fit_predict(PARAMS, Xtr, Y.loc[have, z], X.loc[fut], 300, seeds=2)[0] for z in ZONES}
        for i, day in enumerate(fut):
            nowcast.append({'date': str(day.date()), 'pred': float(p[i]),
                            'persist': float(X.loc[day, 'ls_total_mw_d1'] or 0), 'p_any': float(pa[i]), 'p_severe': float(ps[i]),
                            'nldc': float(X.loc[day, 'f_ls_total_mw'] or 0), 'f_eve_peak_dem': float(X.loc[day, 'f_eve_peak_dem']),
                            'f_eve_peak_gen': float(X.loc[day, 'f_eve_peak_gen']), 'f_tmax_c': float(X.loc[day, 'f_tmax_c']),
                            'zones': {z: float(zp[z][i]) for z in ZONES}})
        print('nowcast', nowcast)

    imp = (gains / gains.sum()).sort_values(ascending=False)
    monthly = []
    for mo, g in bt.groupby(bt.index.to_period('M')):
        monthly.append({'month': str(mo), 'actual': float(g.actual.mean()), 'model': float(np.mean(np.abs(g.pred - g.actual))),
                        'nldc': float(np.mean(np.abs(g.nldc - g.actual))), 'persist': float(np.mean(np.abs(g.persist - g.actual)))})
    days = [[str(i.date()), round(float(r.actual)), round(float(r.pred)), round(float(r.nldc)), round(float(r.persist)), round(float(r.blend)),
             round(float(r.p_any), 3), round(float(r.p_severe), 3)] for i, r in bt.iterrows()]
    zdays = [[str(i.date())] + [round(float(r[f'act_{z}'])) for z in ZONES] + [round(float(r[f'pred_{z}'])) for z in ZONES]
             for i, r in bt.iterrows()]
    out = {'results': res, 'monthly': monthly, 'days': days, 'zoneDays': zdays, 'zones': ZONES,
           'importance': [{'f': k, 'v': float(v)} for k, v in imp.head(15).items()], 'nowcast': nowcast,
           'history': [[str(i.date()), None if pd.isna(v) else round(float(v))] for i, v in Y['total'].items() if i < pd.Timestamp(TEST_FROM)]}
    (OUT / 'bd_backtest.json').write_text(json.dumps(out, separators=(',', ':')))
    print('wrote', OUT / 'bd_backtest.json')


if __name__ == '__main__':
    main()
