"""Figures for docs/loadshed-paper.md, as SVG from the result files (same drawing helpers as ml/figures.py).

Usage:  ml/.venv/Scripts/python ml/figures_loadshed.py      -> docs/figures/ls_fig*.svg
"""
import json
import pathlib
import sys

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from figures import C, INK, MUTE, Svg, axes  # noqa: E402

DATA = HERE / 'data' / 'pgcb'


def fig_series():
    d = pd.read_csv(DATA / 'long_daily.csv', parse_dates=['date']).set_index('date')
    m = d.eve_shed.resample('MS').mean()
    s = Svg(760, 260)
    x0, x1, y0, y1 = 60, 740, 20, 210
    top = 1800
    Y = axes(s, x0, y0, x1, y1, 0, top, (0, 600, 1200, 1800), label='MW')
    n = len(m)
    bw = (x1 - x0) / n
    for i, (t, v) in enumerate(m.items()):
        if pd.notna(v) and v > 0:
            s.rect(x0 + i * bw, Y(min(v, top)), max(bw - 0.6, 0.8), y1 - Y(min(v, top)), C['ours'])
        if t.month == 1:
            s.line(x0 + i * bw, y1, x0 + i * bw, y1 + 4, MUTE)
            s.text(x0 + i * bw + 2, y1 + 15, str(t.year), 9.5, 'start', MUTE)
    cut = list(m.index).index(pd.Timestamp('2024-12-01'))
    s.line(x0 + cut * bw, y0, x0 + cut * bw, y1, INK, 1, '3 3')
    s.text(x0 + cut * bw - 4, y0 + 10, 'hourly record', 9, 'end', MUTE)
    s.text(x0 + cut * bw + 4, y0 + 10, 'daily reports', 9, 'start', MUTE)
    s.text(400, 250, 'Monthly mean load shed at the evening peak', 10, 'middle', MUTE)
    s.save('ls_fig1_series.svg')


def fig_years():
    r1 = json.loads((DATA / 'long_score_h1.json').read_text())
    r2 = json.loads((DATA / 'long_score_h2.json').read_text())
    yrs = [y for y in r1['years'] if y['mean_shed'] > 1]
    s = Svg(760, 280)
    for p, (r, title) in enumerate(((r1, 'Tonight (h = 1)'), (r2, 'Tomorrow (h = 2)'))):
        ys = {y['year']: y for y in r['years']}
        ox = 60 + p * 360
        x0, x1, y0, y1 = ox, ox + 310, 34, 220
        top = 450
        Y = axes(s, x0, y0, x1, y1, 0, top, (0, 150, 300, 450), label='MAE, MW' if p == 0 else None)
        s.text((x0 + x1) / 2, 18, title, 11, 'middle', INK, 'bold')
        bw = (x1 - x0) / len(yrs)
        for i, y in enumerate(yrs):
            row = ys[y['year']]
            for j, (k, col) in enumerate((('mae_persist', C['base']), ('mae_blend', C['ours']))):
                v = min(row[k], top)
                s.rect(x0 + i * bw + 6 + j * (bw - 12) / 2, Y(v), (bw - 12) / 2 - 1, y1 - Y(v), col)
            s.text(x0 + i * bw + bw / 2, y1 + 13, str(y['year']), 9.5, 'middle', MUTE)
    s.rect(250, 250, 11, 11, C['base']); s.text(266, 259, 'Persistence', 10)
    s.rect(370, 250, 11, 11, C['ours']); s.text(386, 259, 'Model averaged with persistence', 10)
    s.text(380, 276, 'Years with shedding; 2018-2021 had almost none and every method scores near zero', 9.5, 'middle', MUTE)
    s.save('ls_fig2_years.svg')


def fig_window():
    r = json.loads((HERE.parent / 'public' / 'data' / 'loadshed' / 'bd_unified.json').read_text())
    who = [('nldc', 'NLDC plan', C['neso']), ('persist', 'Persistence', C['base']), ('avg2', 'Plan and persistence, averaged', C['base']),
           ('plan_model', 'Model on two years with the plan', C['ours']), ('history', 'Model on 11 years, no plan', C['ours']),
           ('unified', 'Model on 11 years, plan where it exists', C['ours'])]
    s = Svg(760, 250)
    x0, x1, y0 = 270, 700, 14
    top = 300
    X = lambda v: x0 + v / top * (x1 - x0)
    for t in (0, 100, 200, 300):
        s.line(X(t), y0, X(t), y0 + len(who) * 32); s.text(X(t), y0 + len(who) * 32 + 14, f'{t} MW', 9.5, 'middle', MUTE)
    for i, (k, lab, col) in enumerate(who):
        y = y0 + i * 32 + 6
        v = r['MAE'][k]
        s.rect(x0, y, X(v) - x0, 20, col)
        s.text(x0 - 8, y + 14, lab, 10.5, 'end')
        s.text(X(v) + 6, y + 14, f'{v:.0f} MW', 10)
    s.text(450, 244, f"Mean absolute error of tonight's forecast, {r['days']} test days from July 2025", 10, 'middle', MUTE)
    s.save('ls_fig3_window.svg')


if __name__ == '__main__':
    fig_series(); fig_window()
    if (DATA / 'long_score_h2.json').exists():
        fig_years()
