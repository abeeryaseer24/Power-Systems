"""Day-ahead national demand forecasting for Great Britain, benchmarked against NESO.

The question: at 09:00 on day D-1, forecast every half hour of day D, using only
what was known then. NESO publishes its own day-ahead forecast at about 09:45.

Information rules (no leakage):
  - demand lags: same half hour two days earlier (D-2) and a week earlier (D-7),
    the mean of day D-2, and the D-1 morning up to 08:00 (periods 1-16)
  - weather: in training, ERA5 reanalysis; in the test years, the forecast issued a
    day earlier (Open-Meteo previous-runs), so the model sees forecast errors as NESO does
  - embedded solar and wind capacity (known in advance) times forecast radiation / wind
  - calendar: half hour, weekday, day of year, bank holidays, the Christmas period, clock changes
Backtest: rolling origin, retrained at the start of every month on all earlier data
(test months 2024-01 onward). Metrics: MAPE, MAE, and for the quantile models pinball
loss and the coverage of the 10-90 % interval.

Usage:  ml/.venv/Scripts/python ml/forecast.py            (writes ml/runs/<date>/)
"""
import datetime as dt
import json
import pathlib

import lightgbm as lgb
import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).parent
RAW = HERE / 'data' / 'raw'
TEST_FROM = pd.Timestamp('2024-01-01')
QUANTILES = (0.1, 0.5, 0.9)


# ------------------------------------------------------------------ data

def load_demand():
    frames = []
    for p in sorted(RAW.glob('demand_*.csv')):
        f = pd.read_csv(p)
        # NESO changed date formats over the years: 01-Jan-23, 01-JAN-2024, then ISO 2025-01-01.
        # Parse each file with its own explicit format; a day-first guess swaps ISO months and days.
        s0 = str(f['SETTLEMENT_DATE'].iloc[0]).strip('"')
        fmt = '%Y-%m-%d' if s0[:4].isdigit() and s0[4] == '-' else ('%d-%b-%Y' if len(s0.split('-')[-1]) == 4 else '%d-%b-%y')
        f['date'] = pd.to_datetime(f['SETTLEMENT_DATE'].astype(str).str.strip('"').str.title(), format=fmt)
        frames.append(f)
    d = pd.concat(frames, ignore_index=True)
    d = d.rename(columns={'SETTLEMENT_PERIOD': 'sp'})
    d = d[(d['sp'] >= 1) & (d['sp'] <= 50)]
    # settlement periods run in UK local time: period 1 starts at local midnight
    local_midnight = d['date'].dt.tz_localize('Europe/London', ambiguous=True, nonexistent='shift_forward')
    d['t'] = local_midnight.dt.tz_convert('UTC') + pd.to_timedelta((d['sp'] - 1) * 30, unit='min')
    d = d.drop_duplicates(['date', 'sp']).sort_values('t').reset_index(drop=True)
    return d[['t', 'date', 'sp', 'ND', 'EMBEDDED_SOLAR_CAPACITY', 'EMBEDDED_WIND_CAPACITY']]


def load_weather(name):
    w = pd.read_csv(RAW / name)
    w['time'] = pd.to_datetime(w['time'], utc=True)
    w = w.set_index('time').sort_index()
    w = w.interpolate(limit=6).ffill(limit=3)  # short gaps in the archived forecasts
    return w.resample('30min').interpolate()


def holidays():
    j = json.loads((RAW / 'bank_holidays.json').read_text(encoding='utf-8'))
    days = set()
    for region in ('england-and-wales', 'scotland'):
        for e in j[region]['events']:
            days.add(pd.Timestamp(e['date']))
    # GOV.UK only lists recent years; add fixed-date holidays for earlier years
    for y in range(2018, 2027):
        for m, dd in ((1, 1), (12, 25), (12, 26)):
            days.add(pd.Timestamp(y, m, dd))
    return days


# ------------------------------------------------------------------ features

def build(d, w_train, w_test, hol):
    d = d.copy()
    d['lag_d2'] = d['ND'].shift(96)
    d['lag_d7'] = d['ND'].shift(336)
    daymean = d.groupby('date')['ND'].mean()
    d['mean_d2'] = d['date'].map(daymean.shift(2))
    morn = d[d['sp'] <= 16].groupby('date')['ND'].mean()
    d['morning_d1'] = d['date'].map(morn.shift(1))
    # weather at the target half hour: reanalysis before the test period, day-ahead forecasts after
    w = pd.concat([w_train[w_train.index < TEST_FROM.tz_localize('UTC')], w_test[w_test.index >= TEST_FROM.tz_localize('UTC')]])
    w = w[~w.index.duplicated()]
    d = d.join(w, on='t')
    loc = d['t'].dt.tz_convert('Europe/London')
    d['hour'] = loc.dt.hour + loc.dt.minute / 60
    d['dow'] = d['date'].dt.day_of_week
    doy = d['date'].dt.day_of_year
    d['doy_s'], d['doy_c'] = np.sin(2 * np.pi * doy / 365.25), np.cos(2 * np.pi * doy / 365.25)
    d['holiday'] = d['date'].isin(hol).astype(int)
    d['xmas'] = (((d['date'].dt.month == 12) & (d['date'].dt.day >= 22)) | ((d['date'].dt.month == 1) & (d['date'].dt.day <= 3))).astype(int)
    d['bst'] = ((loc.dt.tz_localize(None) - d['t'].dt.tz_localize(None)) != pd.Timedelta(0)).astype(int)
    d['temp_dmean'] = d.groupby('date')['temperature_2m'].transform('mean')
    d['hdd'] = (15.5 - d['temp_dmean']).clip(lower=0)
    d['cdd'] = (d['temp_dmean'] - 20).clip(lower=0)
    d['temp_lag24'] = d['temperature_2m'].shift(48)
    d['solar_mw'] = d['EMBEDDED_SOLAR_CAPACITY'] * d['shortwave_radiation'] / 1000
    d['wind_mw'] = d['EMBEDDED_WIND_CAPACITY'] * (d['wind_speed_10m'].clip(0, 25) / 25) ** 3
    d['year'] = d['date'].dt.year + d['date'].dt.day_of_year / 366  # slow structural trend
    return d


FEATURES = ['hour', 'dow', 'doy_s', 'doy_c', 'holiday', 'xmas', 'bst', 'lag_d2', 'lag_d7', 'mean_d2', 'morning_d1',
            'temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'cloud_cover', 'shortwave_radiation',
            'temp_dmean', 'hdd', 'cdd', 'temp_lag24', 'solar_mw', 'wind_mw', 'EMBEDDED_SOLAR_CAPACITY', 'year']


# ------------------------------------------------------------------ backtest

def fit(train, alpha=None):
    params = dict(n_estimators=900, learning_rate=0.04, num_leaves=63, min_child_samples=40, subsample=0.8,
                  subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0, verbose=-1)
    if alpha is None:
        m = lgb.LGBMRegressor(objective='l1', **params)
    else:
        m = lgb.LGBMRegressor(objective='quantile', alpha=alpha, **params)
    m.fit(train[FEATURES], train['ND'])
    return m


def pinball(y, q, a):
    e = y - q
    return np.mean(np.maximum(a * e, (a - 1) * e))


def main():
    d = load_demand()
    feats = build(d, load_weather('weather_actual.csv'), load_weather('weather_forecast.csv'), holidays())
    feats = feats.dropna(subset=FEATURES + ['ND'])
    neso = pd.read_csv(RAW / 'da_forecast_performance.csv', encoding='utf-8-sig')
    neso['date'] = pd.to_datetime(neso['Date'])
    neso = neso.rename(columns={'Settlement_Period': 'sp', 'Demand_Forecast': 'neso', 'Demand_Outturn': 'outturn'})[['date', 'sp', 'neso', 'outturn']]

    months = pd.period_range(TEST_FROM, feats['date'].max(), freq='M')
    preds = []
    for mo in months:
        start = mo.start_time
        # retrain on everything that ended two days before the month starts
        train = feats[feats['date'] < start - pd.Timedelta(days=1)]
        test = feats[(feats['date'] >= start) & (feats['date'] <= mo.end_time)]
        if test.empty:
            continue
        out = test[['date', 'sp', 'ND', 'lag_d2', 'lag_d7']].copy()
        for a in QUANTILES:
            out[f'q{int(a * 100)}'] = fit(train, a).predict(test[FEATURES])
        out['point'] = fit(train).predict(test[FEATURES])
        preds.append(out)
        print(f'{mo}: trained on {len(train):,} half hours, tested on {len(test):,}')
    p = pd.concat(preds).merge(neso, on=['date', 'sp'], how='inner')
    p['month'] = p['date'].dt.to_period('M').astype(str)

    def mape(f, y='outturn'):
        return float((100 * (p[f] - p[y]).abs() / p[y]).mean())

    def mae(f, y='outturn'):
        return float((p[f] - p[y]).abs().mean())

    res = {
        'test_half_hours': int(len(p)), 'from': str(p['date'].min().date()), 'to': str(p['date'].max().date()),
        'MAPE': {k: round(mape(k), 3) for k in ['neso', 'point', 'q50', 'lag_d7', 'lag_d2']},
        'MAE_MW': {k: round(mae(k), 1) for k in ['neso', 'point', 'q50', 'lag_d7', 'lag_d2']},
        'pinball_MW': {f'q{int(a * 100)}': round(float(pinball(p['outturn'], p[f'q{int(a * 100)}'], a)), 1) for a in QUANTILES},
        'coverage_10_90': round(float(((p['outturn'] >= p['q10']) & (p['outturn'] <= p['q90'])).mean()), 3),
        'blend_MAPE': round(float((100 * ((p['point'] + p['neso']) / 2 - p['outturn']).abs() / p['outturn']).mean()), 3),
    }
    monthly = p.groupby('month').apply(lambda g: pd.Series({
        'neso': (100 * (g['neso'] - g['outturn']).abs() / g['outturn']).mean(),
        'model': (100 * (g['point'] - g['outturn']).abs() / g['outturn']).mean(),
        'naive_d7': (100 * (g['lag_d7'] - g['outturn']).abs() / g['outturn']).mean(),
    }), include_groups=False).round(2)
    # where the model wins and loses: by hour of day and on holidays
    p['hh'] = p['sp']
    byhh = p.groupby('hh').apply(lambda g: pd.Series({
        'neso': (100 * (g['neso'] - g['outturn']).abs() / g['outturn']).mean(),
        'model': (100 * (g['point'] - g['outturn']).abs() / g['outturn']).mean(),
    }), include_groups=False).round(2)
    imp = pd.Series(fit(feats[feats['date'] < TEST_FROM]).booster_.feature_importance('gain'), index=FEATURES).sort_values(ascending=False)

    run = HERE / 'runs' / dt.date.today().isoformat()
    run.mkdir(parents=True, exist_ok=True)
    (run / 'results.json').write_text(json.dumps(res, indent=1))
    monthly.to_csv(run / 'monthly_mape.csv')
    byhh.to_csv(run / 'mape_by_period.csv')
    (imp / imp.sum()).round(4).to_csv(run / 'importance.csv')
    p[['date', 'sp', 'outturn', 'neso', 'point', 'q10', 'q50', 'q90', 'lag_d7']].to_csv(run / 'predictions.csv', index=False)
    print(json.dumps(res, indent=1))
    print(monthly.to_string())
    print((imp / imp.sum()).round(3).head(10).to_string())


if __name__ == '__main__':
    main()
