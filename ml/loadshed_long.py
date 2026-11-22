"""Bangladesh load shedding over 11.5 years: a unified daily series and a long rolling backtest.

Sources, spliced into one daily table (ml/data/pgcb/long_daily.csv):
  2015-04-17 .. 2024-12-30  PGCB hourly record (Rafi & Shekh, Mendeley Data, doi 10.17632/vpk8spw2mm.1, CC BY 4.0),
                            taken at the rows PGCB marks Evening_Peak / Day_Peak. On the 432 days it overlaps the
                            daily reports, its evening-peak load shed equals the reports' zone total exactly.
  2024-12-31 .. today       NLDC daily reports parsed by ml/parse_pgcb.py (ml/data/pgcb/daily.csv).
  Weather                   ERA5 daily maximum temperature (Open-Meteo archive), mean of Dhaka, Chattogram,
                            Khulna and Rajshahi.
  Calendar                  Bangladesh weekend (Fri, Sat); Ramadan and the two Eids from the tabular Islamic
                            calendar shifted one day later (Bangladesh usually sights the moon a day after).

Hourly entry errors (a dropped or doubled digit: 65 359 MW of shedding, 156 050 MW of demand) are removed
before aggregation: shedding above 40 % of demand, and demand or generation above 1.6x its 15-day median.

Backtest: the same information set as ml/loadshed.py but without NLDC's plan, which exists only from 2025.
At 11:00 on day D the last actuals are for D-1. Two horizons: tonight (D, h=1) and tomorrow (D+1, h=2).
Monthly expanding-window retraining, test from 2018-01 to the last day; persistence and 7-day mean baselines.

Usage:  ml/.venv/Scripts/python ml/loadshed_long.py          (writes long_daily.csv, long_bt_h*.csv, long.json)
"""
import json
import math
import pathlib
import urllib.request
import warnings

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

warnings.filterwarnings('ignore')
HERE = pathlib.Path(__file__).parent
DATA = HERE / 'data'
OUT = HERE.parent / 'public' / 'data' / 'loadshed'
HOURLY = DATA / 'pgcb_hourly' / 'pgcb_V1_raw.csv'
WEATHER = DATA / 'pgcb_hourly' / 'weather_bd.csv'
CITIES = [('Dhaka', 23.81, 90.41), ('Chattogram', 22.34, 91.83), ('Khulna', 22.82, 89.55), ('Rajshahi', 24.37, 88.60)]
TEST_FROM = '2018-01-01'
SEVERE = 1000.0
SEEDS = 3


# ------------------------------------------------------------------ calendar
def hijri(ts):
    """Tabular (civil) Islamic date of a Gregorian day."""
    jd = math.floor(ts.to_julian_date()) + 0.5
    y = math.floor((30 * (jd - 1948439.5) + 10646) / 10631)

    def to_jd(y, m, d):
        return d + math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + math.floor((3 + 11 * y) / 30) + 1948439.5 - 1
    m = min(12, math.ceil((jd - (29 + to_jd(y, 1, 1))) / 29.5) + 1)
    d = int(jd - to_jd(y, m, 1) + 1)
    return y, m, d


def islamic_flags(idx):
    h = [hijri(t - pd.Timedelta(days=1)) for t in idx]  # Bangladesh: one day after the tabular date
    ram = np.array([m == 9 for _, m, _ in h], int)
    fitr = np.array([(m == 10 and d <= 3) or (m == 9 and d >= 27) for _, m, d in h], int)
    adha = np.array([m == 12 and 7 <= d <= 14 for _, m, d in h], int)
    return ram, np.maximum(fitr, adha)


# ------------------------------------------------------------------ data
def weather(start, end):
    if WEATHER.exists():
        w = pd.read_csv(WEATHER, parse_dates=['date']).set_index('date')
        if w.index.min() <= pd.Timestamp(start) and w.index.max() >= pd.Timestamp(end) - pd.Timedelta(days=10):
            return w
    cols = []
    for name, la, lo in CITIES:
        url = (f'https://archive-api.open-meteo.com/v1/archive?latitude={la}&longitude={lo}&start_date={start}&end_date={end}'
               '&daily=temperature_2m_max,relative_humidity_2m_mean&timezone=Asia%2FDhaka')
        j = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'blackstart-research/0.1'}), timeout=300))
        cols.append(pd.DataFrame({'date': pd.to_datetime(j['daily']['time']), f'tmax_{name}': j['daily']['temperature_2m_max'],
                                  f'rh_{name}': j['daily']['relative_humidity_2m_mean']}).set_index('date'))
    w = pd.concat(cols, axis=1)
    w['tmax'] = w[[c for c in w if c.startswith('tmax_')]].mean(axis=1)
    w['rh'] = w[[c for c in w if c.startswith('rh_')]].mean(axis=1)
    w[['tmax', 'rh']].to_csv(WEATHER, index_label='date')
    return w[['tmax', 'rh']]


def hourly_daily():
    h = pd.read_csv(HOURLY, parse_dates=['datetime'])
    h['date'] = h.datetime.dt.normalize()
    for c in ['generation_mw', 'demand_mw']:
        med = h[c].rolling(15 * 24, center=True, min_periods=24).median()
        h.loc[h[c] > 1.6 * med, c] = np.nan
    bad = (h.load_shedding > 0.4 * h.demand_mw) | (h.load_shedding < 0) | h.demand_mw.isna()
    h.loc[bad, 'load_shedding'] = np.nan
    imp = h[['india_bheramara_hvdc', 'india_tripura', 'india_adani', 'nepal']].fillna(0).sum(axis=1)
    h['imp'] = imp
    g = h.groupby('date')
    ep = h[h.remarks == 'Evening_Peak'].sort_values('demand_mw').groupby('date').last()
    dp = h[h.remarks == 'Day_Peak'].sort_values('demand_mw').groupby('date').last()
    d = pd.DataFrame({
        'eve_shed': ep.load_shedding, 'eve_dem': ep.demand_mw, 'eve_gen': ep.generation_mw,
        'day_shed': dp.load_shedding, 'day_dem': dp.demand_mw, 'day_gen': dp.generation_mw,
        'min_gen': g.generation_mw.min(),
        'unserved_gwh': g.load_shedding.mean() * 24 / 1000,
        'gas_gwh': g.gas.mean() * 24 / 1000, 'liquid_gwh': g.liquid_fuel.mean() * 24 / 1000,
        'coal_gwh': g.coal.mean() * 24 / 1000, 'import_gwh': g.imp.mean() * 24 / 1000,
    })
    d['src'] = 'hourly'
    return d


def report_daily():
    r = pd.read_csv(DATA / 'pgcb' / 'daily.csv', parse_dates=['date']).set_index('date')
    d = pd.DataFrame({
        'eve_shed': r.ls_total_mw, 'eve_dem': r.eve_peak_dem, 'eve_gen': r.eve_peak_gen,
        'day_shed': (r.day_peak_dem - r.day_peak_gen).clip(lower=0), 'day_dem': r.day_peak_dem, 'day_gen': r.day_peak_gen,
        'min_gen': r.min_gen, 'unserved_gwh': r.energy_unserved_gwh,
        'gas_gwh': r.mix_gas_gwh, 'liquid_gwh': r.mix_hfo_gwh.fillna(0) + r.mix_hsd_gwh.fillna(0),
        'coal_gwh': r.mix_coal_gwh, 'import_gwh': r.mix_import_gwh,
    })
    d['src'] = 'report'
    return d


def build_long():
    a, b = hourly_daily(), report_daily()
    d = pd.concat([a[a.index < b.index.min()], b]).sort_index()
    d = d.asfreq('D')
    w = weather(str(d.index.min().date()), str(d.index.max().date()))
    d = d.join(w)
    d.to_csv(DATA / 'pgcb' / 'long_daily.csv', index_label='date')
    return d


# ------------------------------------------------------------------ features
def features(d, h):
    """Features for target day t from actuals up to t-h (h=1 tonight, h=2 tomorrow)."""
    X = pd.DataFrame(index=d.index)
    s = d.eve_shed
    L = lambda col, k=0: d[col].shift(h + k)
    for k in range(7):
        X[f'shed_l{k}'] = s.shift(h + k)
    X['shed_mean7'] = s.shift(h).rolling(7, min_periods=3).mean()
    X['shed_mean30'] = s.shift(h).rolling(30, min_periods=10).mean()
    X['shed_max7'] = s.shift(h).rolling(7, min_periods=3).max()
    X['shed_days7'] = (s.shift(h) > 0).rolling(7, min_periods=3).mean()
    X['shed_days30'] = (s.shift(h) > 0).rolling(30, min_periods=10).mean()
    X['shed_ratio_l0'] = s.shift(h) / d.eve_dem.shift(h)
    for c in ['day_shed', 'unserved_gwh', 'eve_dem', 'eve_gen', 'day_dem', 'day_gen', 'min_gen', 'gas_gwh', 'liquid_gwh', 'coal_gwh', 'import_gwh', 'tmax']:
        X[f'{c}_l0'] = L(c)
    X['deficit_l0'] = L('eve_dem') - L('eve_gen')
    X['day_deficit_l0'] = L('day_dem') - L('day_gen')
    X['unserved_mean7'] = d.unserved_gwh.shift(h).rolling(7, min_periods=3).mean()
    X['eve_dem_trend7'] = L('eve_dem') - d.eve_dem.shift(h).rolling(7, min_periods=3).mean()
    X['gas_trend7'] = L('gas_gwh') - d.gas_gwh.shift(h).rolling(7, min_periods=3).mean()
    X['gas_trend30'] = L('gas_gwh') - d.gas_gwh.shift(h).rolling(30, min_periods=10).mean()
    X['liquid_trend7'] = L('liquid_gwh') - d.liquid_gwh.shift(h).rolling(7, min_periods=3).mean()
    X['gen_trend7'] = L('eve_gen') - d.eve_gen.shift(h).rolling(7, min_periods=3).mean()
    # weather on the target day itself: ERA5 here, the Open-Meteo forecast when used live
    X['tmax'] = d.tmax
    X['rh'] = d.rh
    X['tmax_chg'] = d.tmax - d.tmax.shift(h)
    idx = d.index
    X['dow'] = idx.day_of_week
    X['weekend'] = idx.day_of_week.isin([4, 5]).astype(int)
    X['doy_s'] = np.sin(2 * np.pi * idx.day_of_year / 365.25)
    X['doy_c'] = np.cos(2 * np.pi * idx.day_of_year / 365.25)
    X['ramadan'], X['eid'] = islamic_flags(idx)
    return X


REG = dict(objective='huber', alpha=300.0, learning_rate=0.03, num_leaves=15, min_data_in_leaf=20, feature_fraction=0.7,
           bagging_fraction=0.8, bagging_freq=1, lambda_l2=5.0, verbose=-1)
TWD = dict(objective='tweedie', tweedie_variance_power=1.3, learning_rate=0.03, num_leaves=15, min_data_in_leaf=20,
           feature_fraction=0.7, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, verbose=-1)
CLS = dict(objective='binary', learning_rate=0.03, num_leaves=15, min_data_in_leaf=20, feature_fraction=0.7,
           bagging_fraction=0.8, bagging_freq=1, lambda_l2=2.0, verbose=-1)
ROUNDS = {'reg': 400, 'twd': 400, 'cls': 300}


def fit(params, X, y, rounds, seeds=SEEDS):
    return [lgb.train({**params, 'seed': s}, lgb.Dataset(X, y), rounds) for s in range(seeds)]


def pred(models, X):
    return np.mean([m.predict(X) for m in models], axis=0)


def block_boot(diff, n=2000, block=7, seed=0):
    rng = np.random.default_rng(seed)
    diff = np.asarray(diff); T = len(diff); nb = int(np.ceil(T / block))
    means = [np.concatenate([diff[s:s + block] for s in rng.integers(0, T - block + 1, nb)])[:T].mean() for _ in range(n)]
    return [float(np.mean(diff)), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))]


def backtest(d, h):
    X = features(d, h)
    y = d.eve_shed
    ok = y.notna() & X['shed_l0'].notna()
    pers = X['shed_l0']
    rows = []
    for mo in pd.period_range(TEST_FROM, d.index[ok].max(), freq='M'):
        tr = ok & (d.index < mo.start_time - pd.Timedelta(days=h - 1))  # the label of day t is known at t+1
        te = ok & (d.index >= mo.start_time) & (d.index <= mo.end_time.normalize())
        if te.sum() == 0:
            continue
        o = pd.DataFrame(index=d.index[te])
        o['actual'] = y[te]
        o['persist'] = pers[te]
        o['mean7'] = X.loc[te, 'shed_mean7']
        o['twd'] = pred(fit(TWD, X[tr], y[tr], ROUNDS['twd']), X[te])
        r = pred(fit(REG, X[tr], (y - pers)[tr], ROUNDS['reg']), X[te])
        o['res'] = np.clip(pers[te].values + r, 0, None)
        o['p_any'] = pred(fit(CLS, X[tr], (y[tr] > 0).astype(int), ROUNDS['cls']), X[te])
        o['p_sev'] = pred(fit(CLS, X[tr], (y[tr] > SEVERE).astype(int), ROUNDS['cls']), X[te])
        rows.append(o)
        print(f'h={h} {mo}: train {tr.sum()} MAE twd {np.mean(np.abs(o.twd - o.actual)):.0f} res {np.mean(np.abs(o.res - o.actual)):.0f} persist {np.mean(np.abs(o.persist - o.actual)):.0f}', flush=True)
    bt = pd.concat(rows)
    bt['blend'] = (bt['twd'] + bt['persist']) / 2
    bt.to_csv(DATA / 'pgcb' / f'long_bt_h{h}.csv', index_label='date')
    return bt, X


def score(bt, keys):
    a = bt.actual.values
    any_, sev = a > 0, a > SEVERE
    r = {'days': int(len(bt)), 'from': str(bt.index.min().date()), 'to': str(bt.index.max().date()), 'days_shed': int(any_.sum()), 'days_severe': int(sev.sum())}
    r['MAE'] = {k: float(np.mean(np.abs(bt[k] - a))) for k in keys}
    r['RMSE'] = {k: float(np.sqrt(np.mean((bt[k] - a) ** 2))) for k in keys}
    best = min((k for k in keys if k not in ('persist', 'mean7')), key=lambda k: r['MAE'][k])
    r['best'] = best
    r['best_vs_persist'] = block_boot(np.abs(bt[best] - a) - np.abs(bt['persist'] - a))
    r['any'] = {'auc_model': float(roc_auc_score(any_, bt.p_any)), 'auc_persist': float(roc_auc_score(any_, bt.persist)),
                'hit_model': float(np.mean(bt.p_any[any_] > 0.5)), 'false_model': float(np.mean(bt.p_any[~any_] > 0.5)),
                'hit_persist': float(np.mean(bt.persist[any_] > 0)), 'false_persist': float(np.mean(bt.persist[~any_] > 0)),
                'brier_model': float(np.mean((bt.p_any - any_) ** 2))}
    if sev.any():
        r['severe'] = {'auc_model': float(roc_auc_score(sev, bt.p_sev)), 'auc_persist': float(roc_auc_score(sev, bt.persist)),
                       'hit_model': float(np.mean(bt.p_sev[sev] > 0.5)), 'false_model': float(np.mean(bt.p_sev[~sev] > 0.5)),
                       'hit_persist': float(np.mean(bt.persist[sev] > SEVERE)), 'false_persist': float(np.mean(bt.persist[~sev] > SEVERE))}
    yr = []
    for y_, g in bt.groupby(bt.index.year):
        yr.append({'year': int(y_), 'mean_shed': float(g.actual.mean()), 'days_shed': int((g.actual > 0).sum()), 'days': int(len(g)),
                   **{f'mae_{k}': float(np.mean(np.abs(g[k] - g.actual))) for k in keys}})
    r['years'] = yr
    return r


def main():
    d = build_long()
    print(f'long series: {d.index.min().date()} .. {d.index.max().date()}, {d.eve_shed.notna().sum()} days with a label, '
          f'{(d.eve_shed > 0).sum()} with shedding, {(d.eve_shed > SEVERE).sum()} above {SEVERE:.0f} MW')
    out = {'series': {'from': str(d.index.min().date()), 'to': str(d.index.max().date()), 'labelled': int(d.eve_shed.notna().sum()),
                      'shed_days': int((d.eve_shed > 0).sum()), 'severe_days': int((d.eve_shed > SEVERE).sum())}}
    for h in (1, 2):
        bt, X = backtest(d, h)
        out[f'h{h}'] = score(bt, ['twd', 'res', 'blend', 'persist', 'mean7'])
        print(json.dumps({k: out[f'h{h}'][k] for k in ['MAE', 'best', 'best_vs_persist', 'any']}, indent=1))
    # monthly mean shed for the long chart
    m = d.eve_shed.resample('MS').mean()
    out['monthly'] = [[str(i.date())[:7], None if pd.isna(v) else round(float(v), 1)] for i, v in m.items()]
    (OUT / 'bd_long.json').write_text(json.dumps(out, separators=(',', ':')))
    print('wrote bd_long.json')


if __name__ == '__main__':
    main()
