"""Figures for docs/paper.md, written as SVG from the committed result files (no plotting library).

Usage:  ml/.venv/Scripts/python ml/figures.py     -> docs/figures/fig*.svg
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).parent.parent
OUT = ROOT / 'docs' / 'figures'
OUT.mkdir(parents=True, exist_ok=True)
FONT = "font-family='Georgia, serif'"
INK, MUTE, GRID = '#1b1b1b', '#6b6b6b', '#e2e2e2'
C = {'ours': '#c8611b', 'neso': '#2f6f8f', 'base': '#8a8a8a', 'trees': '#2f6f8f', 'dc': '#8a8a8a', 'ridge': '#a3b8c2', 'bb': '#d6c6a8', 'out': '#1b1b1b'}


def load(p):
    return json.loads((ROOT / p).read_text(encoding='utf8'))


class Svg:
    def __init__(self, w, h):
        self.w, self.h, self.parts = w, h, []

    def add(self, s):
        self.parts.append(s)

    def text(self, x, y, s, size=11, anchor='start', color=INK, weight='normal', rotate=None):
        tr = f" transform='rotate({rotate} {x} {y})'" if rotate else ''
        s = str(s).replace('&', '&amp;').replace('<', '&lt;')
        self.add(f"<text x='{x:.1f}' y='{y:.1f}' font-size='{size}' text-anchor='{anchor}' fill='{color}' font-weight='{weight}' {FONT}{tr}>{s}</text>")

    def line(self, x1, y1, x2, y2, color=GRID, w=1, dash=None):
        d = f" stroke-dasharray='{dash}'" if dash else ''
        self.add(f"<line x1='{x1:.1f}' y1='{y1:.1f}' x2='{x2:.1f}' y2='{y2:.1f}' stroke='{color}' stroke-width='{w}'{d}/>")

    def poly(self, pts, color, w=1.6, dash=None, fill='none', opacity=1):
        d = f" stroke-dasharray='{dash}'" if dash else ''
        p = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
        tag = 'polygon' if fill != 'none' else 'polyline'
        stroke = 'none' if fill != 'none' else color
        self.add(f"<{tag} points='{p}' fill='{fill}' stroke='{stroke}' stroke-width='{w}' opacity='{opacity}'{d} stroke-linejoin='round'/>")

    def rect(self, x, y, w, h, color, opacity=1):
        self.add(f"<rect x='{x:.1f}' y='{y:.1f}' width='{max(0, w):.1f}' height='{max(0, h):.1f}' fill='{color}' opacity='{opacity}'/>")

    def save(self, name):
        (OUT / name).write_text(f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {self.w} {self.h}' width='{self.w}' height='{self.h}'><rect width='100%' height='100%' fill='white'/>" + ''.join(self.parts) + '</svg>', encoding='utf8')
        print('wrote', name)


def axes(s, x0, y0, x1, y1, ymin, ymax, ticks, fmt=lambda v: f'{v:g}', label=None):
    Y = lambda v: y1 - (v - ymin) / (ymax - ymin) * (y1 - y0)
    for t in ticks:
        s.line(x0, Y(t), x1, Y(t)); s.text(x0 - 6, Y(t) + 4, fmt(t), 10, 'end', MUTE)
    if label: s.text(x0 - 40, (y0 + y1) / 2, label, 10.5, 'middle', MUTE, rotate=-90)
    return Y


def legend(s, x, y, items):
    for i, (label, color, dash) in enumerate(items):
        yy = y + i * 16
        s.line(x, yy - 4, x + 22, yy - 4, color, 2.4, dash); s.text(x + 28, yy, label, 10.5)


# ---------------------------------------------------------------- Fig. 1: the 17 grids
def fig_grids():
    idx = load('public/data/regions/index.json')
    cols, cw, ch = 6, 160, 150
    rows = (len(idx) + cols - 1) // cols
    s = Svg(cols * cw, rows * ch + 10)
    for k, r in enumerate(idx):
        d = load(f"public/data/regions/{r['id']}.json")
        bx = [b['x'] for b in d['buses']]; bz = [b['z'] for b in d['buses']]
        x0, x1, z0, z1 = min(bx), max(bx), min(bz), max(bz)
        span = max(x1 - x0, z1 - z0, 1e-6)
        ox, oy = (k % cols) * cw + 10, (k // cols) * ch + 8
        P = lambda x, z: (ox + 5 + (x - x0) / span * (cw - 30) + (span - (x1 - x0)) / span * (cw - 30) / 2, oy + 5 + (z - z0) / span * (ch - 45) + (span - (z1 - z0)) / span * (ch - 45) / 2)
        for b in d['branches']:
            a, c = P(bx[b['a']], bz[b['a']]), P(bx[b['b']], bz[b['b']])
            s.line(*a, *c, '#c8611b' if b['kv'] >= 300 else '#7b8794', 1.1 if b['kv'] >= 300 else 0.6)
        s.text(ox + (cw - 20) / 2, oy + ch - 22, r['city'], 11, 'middle', INK, 'bold')
        s.text(ox + (cw - 20) / 2, oy + ch - 9, f"{r['buses']} buses · {r['branches']} lines", 9, 'middle', MUTE)
    s.save('fig1_grids.svg')


# ---------------------------------------------------------------- Fig. 2-3: forecaster
def fig_forecast():
    b = load('public/data/forecast/gb_backtest.json')
    m = b['monthly']
    s = Svg(760, 300); x0, x1, y0, y1 = 60, 600, 20, 250
    Y = axes(s, x0, y0, x1, y1, 0, 12, [0, 2, 4, 6, 8, 10, 12], lambda v: f'{v:g} %', 'MAPE')
    X = lambda i: x0 + i / (len(m) - 1) * (x1 - x0)
    for key, color, dash in (('naive_d7', C['base'], '3 3'), ('neso', C['neso'], None), ('model', C['ours'], None)):
        s.poly([(X(i), Y(r[key])) for i, r in enumerate(m)], color, 2 if key == 'model' else 1.6, dash)
    for i, r in enumerate(m):
        if r['month'].endswith('-01') or i == 0:
            s.text(X(i), y1 + 16, r['month'], 9.5, 'middle', MUTE)
    legend(s, 615, 40, [('This model', C['ours'], None), ('NESO day-ahead', C['neso'], None), ('Same as last week', C['base'], '3 3')])
    s.save('fig2_forecast_monthly.svg')
    # winter week with the calibrated band
    w = b['samples']['winter']
    s = Svg(760, 300); x0, x1, y0, y1 = 60, 600, 20, 250
    lo = min(min(r) for r in w) // 2000 * 2000; hi = (max(max(r) for r in w) // 2000 + 1) * 2000
    Y = axes(s, x0, y0, x1, y1, lo / 1000, hi / 1000, [v / 1000 for v in range(int(lo), int(hi) + 1, 4000)], lambda v: f'{v:g} GW', 'National demand')
    Y2 = lambda mw: Y(mw / 1000)
    X = lambda i: x0 + i / (len(w) - 1) * (x1 - x0)
    band = [(X(i), Y2(r[4])) for i, r in enumerate(w)] + [(X(i), Y2(r[3])) for i, r in reversed(list(enumerate(w)))]
    s.poly(band, '', fill=C['ours'], opacity=0.16)
    s.poly([(X(i), Y2(r[1])) for i, r in enumerate(w)], C['neso'], 1.4, '5 3')
    s.poly([(X(i), Y2(r[2])) for i, r in enumerate(w)], C['ours'], 1.8)
    s.poly([(X(i), Y2(r[0])) for i, r in enumerate(w)], C['out'], 1.3)
    for dday in range(7):
        s.text(X(dday * 48 + 24), y1 + 16, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dday], 9.5, 'middle', MUTE)
    legend(s, 615, 40, [('Actual', C['out'], None), ('This model', C['ours'], None), ('NESO day-ahead', C['neso'], '5 3')])
    s.rect(615, 92, 22, 10, C['ours'], 0.16); s.text(643, 101, '10–90 % range', 10.5)
    s.save('fig3_forecast_week.svg')


# ---------------------------------------------------------------- Fig. 4: surrogate on unseen outages
def fig_surrogate():
    grids = [('dhaka', 'Dhaka'), ('adelaide', 'South Australia'), ('london', 'London')]
    meth = [('surrogate', 'Surrogate', C['ours']), ('ridge', 'Ridge', C['ridge']), ('black_box_one_hot', 'Black box', C['bb']), ('dc_screening', 'DC screening', C['dc'])]
    s = Svg(760, 280)
    for g, (gid, name) in enumerate(grids):
        u = load(f'public/data/surrogate/{gid}.json')['metrics']['unseen_contingency']
        vals = [u[k]['loading_MAE_pct'] for k, _, _ in meth]
        ox = 60 + g * 235; x0, x1, y0, y1 = ox, ox + 190, 30, 220
        top = max(vals) * 1.15
        Y = lambda v: y1 - v / top * (y1 - y0)
        s.line(x0, y1, x1, y1, MUTE)
        for i, (v, (_, label, color)) in enumerate(zip(vals, meth)):
            bx = x0 + 10 + i * 45
            s.rect(bx, Y(v), 34, y1 - Y(v), color)
            s.text(bx + 17, Y(v) - 4, f'{v:.2f}', 9.5, 'middle')
        s.text((x0 + x1) / 2, 18, name, 11.5, 'middle', INK, 'bold')
    for i, (_, label, color) in enumerate(meth):
        s.rect(60 + i * 150, 248, 12, 12, color); s.text(78 + i * 150, 258, label, 10.5)
    s.text(380, 276, 'Mean line-loading error on outages never seen in training (% of rating)', 10, 'middle', MUTE)
    s.save('fig4_surrogate.svg')


# ---------------------------------------------------------------- Fig. 5: dispatch
def fig_dispatch():
    d = load('public/data/dispatch/sa.json')
    r = d['results']
    who = [('rule', 'Operator rule'), ('ppo', 'RL from scratch'), ('ppo_bc', 'RL, warm-started'), ('mpc', 'Forecast optimiser'), ('mpc_value', 'Optimiser + learned value'), ('perfect', 'Perfect foresight')]
    s = Svg(760, 280); x0, x1, y0 = 200, 700, 20
    top = 2.0
    X = lambda v: x0 + v / top * (x1 - x0)
    for t in (0, 0.5, 1.0, 1.5, 2.0):
        s.line(X(t), y0, X(t), y0 + 6 * 36); s.text(X(t), y0 + 6 * 36 + 14, f'${t:g} M', 9.5, 'middle', MUTE)
    for i, (k, label) in enumerate(who):
        y = y0 + i * 36 + 6
        color = C['ours'] if k in ('ppo_bc', 'mpc_value') else C['neso'] if k == 'mpc' else C['base']
        s.rect(x0, y, X(r[k]['cost_M']) - x0, 22, color)
        s.text(x0 - 8, y + 15, label, 10.5, 'end')
        s.text(X(r[k]['cost_M']) + 6, y + 15, f"${r[k]['cost_M']:.3f} M" + ('' if k == 'perfect' else f"  (+{r[k]['gap_pct']:.1f} %)"), 10)
    s.text(450, 272, 'Mean cost per day over 100 held-out days (extra cost over perfect foresight)', 10, 'middle', MUTE)
    s.save('fig5_dispatch.svg')


# ---------------------------------------------------------------- Fig. 6: cascade GNN per fold
def fig_gnn():
    r = load('public/data/cascade/gnn.json')['results']['splits']['unseen']['folds']
    names = {'london': 'London', 'delhi': 'Delhi', 'saopaulo': 'São Paulo', 'moscow': 'Moscow', 'karachi': 'Karachi', 'adelaide': 'Adelaide', 'newyork': 'New York',
             'istanbul': 'Istanbul', 'colombo': 'Colombo', 'houston': 'Houston', 'madrid': 'Madrid', 'rome': 'Rome', 'tashkent': 'Tashkent', 'caracas': 'Caracas',
             'dhaka': 'Dhaka', 'dhaka-metro': 'Dhaka metro', 'sapporo': 'Sapporo'}
    s = Svg(760, 330)
    for p, (title, gk, tk, top, fmt) in enumerate((('Load lost: mean error (lower is better)', ('gnn', 'MAE_pct'), ('gbm', 'MAE_pct'), 60, lambda v: f'{v:.0f} %'),
                                                   ('Which bus loses supply: AUC (higher is better)', ('gnn', 'AUC_bus'), ('node_baselines', 'gbm'), 1.0, lambda v: f'{v:.2f}'))):
        ox = 50 + p * 360; x0, x1, y0, y1 = ox, ox + 320, 34, 230
        Y = lambda v: y1 - v / top * (y1 - y0)
        s.text((x0 + x1) / 2, 18, title, 11, 'middle', INK, 'bold')
        s.line(x0, y1, x1, y1, MUTE)
        for i, f in enumerate(r):
            bx = x0 + 6 + i * 52
            gv, tv = f[gk[0]][gk[1]], f[tk[0]][tk[1]]
            s.rect(bx, Y(gv), 20, y1 - Y(gv), C['ours']); s.rect(bx + 22, Y(min(tv, top)), 20, y1 - Y(min(tv, top)), C['trees'])
            s.text(bx + 10, Y(gv) - 3, fmt(gv), 8, 'middle'); s.text(bx + 32, Y(min(tv, top)) - 3, fmt(tv), 8, 'middle')
            for j, g in enumerate(f['held_out']):
                s.text(bx + 21, y1 + 13 + j * 11, names.get(g, g), 8, 'middle', MUTE)
    s.rect(250, 300, 12, 12, C['ours']); s.text(268, 310, 'Graph neural network', 10.5)
    s.rect(420, 300, 12, 12, C['trees']); s.text(438, 310, 'Gradient-boosted trees', 10.5)
    s.text(380, 326, 'Each pair: one group of grids held out of training entirely', 10, 'middle', MUTE)
    s.save('fig6_gnn_folds.svg')


if __name__ == '__main__':
    fig_grids(); fig_forecast(); fig_surrogate(); fig_dispatch(); fig_gnn()
