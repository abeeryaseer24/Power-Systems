"""Conformal calibration of the 10-90 % range (conformalised quantile regression).

The quantile models were trained on observed weather but are used with forecast weather,
so their ranges are too narrow. For each test month, the widening Q is the 80th percentile
(with the finite-sample correction) of the non-conformity scores max(q10 - y, y - q90)
over all earlier test months - only the past is used, as it would be in operation.
Updates the latest run's results.json and writes calibration.json (the Q to use live).
"""
import json
import math
import pathlib

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).parent


def main():
    run = sorted((HERE / 'runs').glob('20*'))[-1]
    p = pd.read_csv(run / 'predictions.csv', parse_dates=['date'])
    p['month'] = p['date'].dt.to_period('M')
    p['score'] = np.maximum(p['q10'] - p['outturn'], p['outturn'] - p['q90'])
    lo, hi, qs = [], [], []
    months = sorted(p['month'].unique())
    for m in months:
        past = p.loc[p['month'] < m, 'score'].values
        if len(past) < 48 * 28:  # need at least a month of history
            Q = 0.0
        else:
            n = len(past)
            Q = float(np.quantile(past, min(1, math.ceil(0.8 * (n + 1)) / n)))
        qs.append({'month': str(m), 'Q': round(Q, 1)})
        sel = p['month'] == m
        lo.append(p.loc[sel, 'q10'] - Q); hi.append(p.loc[sel, 'q90'] + Q)
    p['q10c'] = pd.concat(lo); p['q90c'] = pd.concat(hi)
    ok = p['month'] > months[0]  # the first month has no history to calibrate from
    cov_raw = float(((p['outturn'] >= p['q10']) & (p['outturn'] <= p['q90']))[ok].mean())
    cov_cal = float(((p['outturn'] >= p['q10c']) & (p['outturn'] <= p['q90c']))[ok].mean())
    width_raw = float((p['q90'] - p['q10'])[ok].mean()); width_cal = float((p['q90c'] - p['q10c'])[ok].mean())
    res = json.loads((run / 'results.json').read_text())
    res['calibration'] = {'coverage_raw': round(cov_raw, 3), 'coverage_calibrated': round(cov_cal, 3), 'width_raw_MW': round(width_raw), 'width_calibrated_MW': round(width_cal)}
    (run / 'results.json').write_text(json.dumps(res, indent=1))
    recent = p.loc[p['month'] >= months[-6], 'score'].values
    Qlive = float(np.quantile(recent, 0.8))
    (run / 'calibration.json').write_text(json.dumps({'Q_live_MW': round(Qlive, 1), 'by_month': qs}, indent=1))
    p.drop(columns=['month', 'score']).to_csv(run / 'predictions.csv', index=False)
    print(json.dumps(res['calibration']), 'live Q', round(Qlive))


if __name__ == '__main__':
    main()
