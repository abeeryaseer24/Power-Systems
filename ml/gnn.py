"""Cascade prediction on real transmission grids with a graph neural network.

Each sample (from src/ai/cascade-data.test.ts) is a grid snapshot as a graph - buses with
load, generation, headroom, voltage, angle and voltage class; lines with reactance,
rating, loading - plus a contingency (tripped lines, tripped plants, a lost external tie).
The label is what the simulator lost 90 s later: the share of load for the whole grid, and
per bus.

Models
  mean        the average loss in the training set
  gbm         LightGBM on hand-made features of the contingency and the grid
  gnn         message passing with edge features (pure PyTorch), graph and node heads
Splits
  random      held-out samples from the same grids (in distribution)
  unseen      leave-grids-out: test grids never seen in training (generalisation)
Metrics: MAE of the load lost, AUC for "major event" (more than 10 % of load lost),
Spearman rank correlation, and node-level AUC for "this bus loses supply".

Usage:  ml/.venv/Scripts/python ml/gnn.py
"""
import json
import pathlib
import random

import lightgbm as lgb
import numpy as np
import torch
import torch.nn as nn

HERE = pathlib.Path(__file__).parent
DATA = HERE / 'data' / 'cascade'
DEV = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
MAJOR = 0.10
UNSEEN = [['london', 'delhi', 'saopaulo'], ['moscow', 'karachi', 'adelaide'], ['newyork', 'istanbul', 'colombo']]


def load():
    rows = []
    for f in sorted(DATA.glob('*.jsonl')):
        for line in open(f, encoding='utf8'):
            r = json.loads(line)
            if len(r['edges']) == 0:
                continue
            rows.append(r)
    return rows


def to_graph(r):
    x = np.array(r['x'], dtype=np.float32)
    bus_trip = np.array(r['busTrip'], dtype=np.float32)[:, None]
    x = np.concatenate([x, bus_trip, np.full((len(x), 1), r['extTrip'], np.float32), np.full((len(x), 1), 1.0 if r['freq'] == 60 else 0.0, np.float32)], 1)
    e = np.array(r['edges'], dtype=np.int64)
    ea = np.array(r['ea'], dtype=np.float32)
    ea = np.concatenate([ea, np.array(r['edgeTrip'], np.float32)[:, None]], 1)
    # undirected: both directions
    e2 = np.concatenate([e, e[:, ::-1]], 0).T.copy()
    ea2 = np.concatenate([ea, ea], 0)
    return {'x': torch.tensor(x), 'ei': torch.tensor(e2), 'ea': torch.tensor(ea2), 'y': float(r['lost']),
            'yn': torch.tensor(np.array(r['busLost'], np.float32)), 'region': r['region']}


def hand_features(r):
    """Features a power engineer would compute for a quick screen."""
    ea = np.array(r['ea']); trip = np.array(r['edgeTrip']) > 0
    x = np.array(r['x'])
    load = x[:, 1].sum(); gen = x[:, 2].sum(); head = x[:, 3].sum()
    tl = ea[trip] if trip.any() else np.zeros((1, ea.shape[1]))
    return [trip.sum(), tl[:, 2].max(), (tl[:, 2] * tl[:, 1]).sum(), tl[:, 3].max(), sum(r['busTrip']), r['extTrip'],
            load, gen, head / max(load, 1e-3), ea[:, 2].max(), ea[:, 2].mean(), (ea[:, 2] > 0.8).mean(), len(x), len(ea), 1.0 if r['freq'] == 60 else 0.0]


class Layer(nn.Module):
    def __init__(self, h, eh):
        super().__init__()
        self.msg = nn.Sequential(nn.Linear(2 * h + eh, h), nn.ReLU(), nn.Linear(h, h))
        self.upd = nn.Sequential(nn.Linear(2 * h, h), nn.ReLU(), nn.Linear(h, h))
        self.norm = nn.LayerNorm(h)

    def forward(self, h, ei, ea):
        src, dst = ei
        m = self.msg(torch.cat([h[src], h[dst], ea], 1))
        agg = torch.zeros_like(h).index_add_(0, dst, m)
        deg = torch.zeros(h.size(0), 1, device=h.device).index_add_(0, dst, torch.ones(dst.size(0), 1, device=h.device)).clamp(min=1)
        return self.norm(h + self.upd(torch.cat([h, agg / deg], 1)))


class GNN(nn.Module):
    def __init__(self, nx, ne, h=96, layers=6):
        super().__init__()
        self.enc = nn.Sequential(nn.Linear(nx, h), nn.ReLU(), nn.Linear(h, h))
        self.eenc = nn.Sequential(nn.Linear(ne, h // 2), nn.ReLU())
        self.layers = nn.ModuleList([Layer(h, h // 2) for _ in range(layers)])
        self.node = nn.Linear(h, 1)
        self.graph = nn.Sequential(nn.Linear(2 * h, h), nn.ReLU(), nn.Linear(h, 1))

    def forward(self, x, ei, ea, batch, n_graphs):
        h = self.enc(x)
        e = self.eenc(ea)
        for L in self.layers:
            h = L(h, ei, e)
        node = torch.sigmoid(self.node(h)).squeeze(1)
        mean = torch.zeros(n_graphs, h.size(1), device=h.device).index_add_(0, batch, h)
        cnt = torch.zeros(n_graphs, 1, device=h.device).index_add_(0, batch, torch.ones(h.size(0), 1, device=h.device))
        mx = torch.full((n_graphs, h.size(1)), -1e9, device=h.device).scatter_reduce_(0, batch[:, None].expand_as(h), h, 'amax')
        g = torch.sigmoid(self.graph(torch.cat([mean / cnt, mx], 1))).squeeze(1)
        return g, node


def collate(gs):
    xs, eis, eas, bs, yns = [], [], [], [], []
    off = 0
    for i, g in enumerate(gs):
        xs.append(g['x']); eas.append(g['ea']); eis.append(g['ei'] + off); yns.append(g['yn'])
        bs.append(torch.full((g['x'].size(0),), i, dtype=torch.long)); off += g['x'].size(0)
    return (torch.cat(xs).to(DEV), torch.cat(eis, 1).to(DEV), torch.cat(eas).to(DEV), torch.cat(bs).to(DEV),
            torch.tensor([g['y'] for g in gs], device=DEV), torch.cat(yns).to(DEV))


def auc(s, y):
    s, y = np.asarray(s), np.asarray(y).astype(bool)
    if y.all() or not y.any():
        return float('nan')
    order = np.argsort(s); ranks = np.empty(len(s)); ranks[order] = np.arange(1, len(s) + 1)
    return float((ranks[y].sum() - y.sum() * (y.sum() + 1) / 2) / (y.sum() * (~y).sum()))


def spearman(a, b):
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def scores(pred, y, node_pred=None, node_y=None):
    out = {'MAE_pct': round(float(np.mean(np.abs(np.array(pred) - np.array(y)))) * 100, 2),
           'AUC_major': round(auc(pred, np.array(y) > MAJOR), 3), 'spearman': round(spearman(pred, y), 3)}
    if node_pred is not None:
        out['AUC_bus'] = round(auc(node_pred, np.array(node_y) > 0.5), 3)
    return out


def train_gnn(train, test, epochs=60, seed=0):
    torch.manual_seed(seed); random.seed(seed)
    nx_, ne_ = train[0]['x'].size(1), train[0]['ea'].size(1)
    # normalise features on the training set
    X = torch.cat([g['x'] for g in train]); E = torch.cat([g['ea'] for g in train])
    mx, sx = X.mean(0), X.std(0).clamp(min=1e-3); me, se = E.mean(0), E.std(0).clamp(min=1e-3)
    norm = lambda gs: [{**g, 'x': (g['x'] - mx) / sx, 'ea': (g['ea'] - me) / se} for g in gs]
    tr, te = norm(train), norm(test)
    model = GNN(nx_, ne_).to(DEV)
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, epochs)
    for ep in range(epochs):
        model.train(); random.shuffle(tr)
        for i in range(0, len(tr), 32):
            x, ei, ea, b, y, yn = collate(tr[i:i + 32])
            g, n = model(x, ei, ea, b, int(b.max()) + 1)
            # graph loss weights large events more: they are rare and they matter
            w = 1 + 4 * (y > MAJOR).float()
            loss = (w * (g - y).abs()).mean() + 0.5 * nn.functional.binary_cross_entropy(n, (yn > 0.5).float())
            opt.zero_grad(); loss.backward(); opt.step()
        sched.step()
    model.eval(); preds, nps, nys = [], [], []
    with torch.no_grad():
        for i in range(0, len(te), 64):
            x, ei, ea, b, y, yn = collate(te[i:i + 64])
            g, n = model(x, ei, ea, b, int(b.max()) + 1)
            preds += g.cpu().tolist(); nps += n.cpu().tolist(); nys += yn.cpu().tolist()
    return preds, nps, nys, model


def train_gbm(train_rows, test_rows):
    Xtr = np.array([hand_features(r) for r in train_rows]); ytr = np.array([r['lost'] for r in train_rows])
    m = lgb.LGBMRegressor(n_estimators=500, learning_rate=0.03, num_leaves=31, min_child_samples=20, verbose=-1)
    m.fit(Xtr, ytr)
    return np.clip(m.predict(np.array([hand_features(r) for r in test_rows])), 0, 1).tolist()


def main():
    rows = load()
    graphs = [to_graph(r) for r in rows]
    regions = sorted(set(r['region'] for r in rows))
    ys = np.array([r['lost'] for r in rows])
    print(f'{len(rows)} samples on {len(regions)} grids; {100 * (ys > MAJOR).mean():.1f} % major events; device {DEV}')
    results = {'n': len(rows), 'grids': regions, 'major_share': round(float((ys > MAJOR).mean()), 3), 'splits': {}}

    # random split: 80/20 within the same grids
    idx = list(range(len(rows))); random.Random(1).shuffle(idx)
    cut = int(0.8 * len(idx)); tr, te = idx[:cut], idx[cut:]
    y_te = [rows[i]['lost'] for i in te]
    gp, np_, ny, _ = train_gnn([graphs[i] for i in tr], [graphs[i] for i in te])
    results['splits']['random'] = {
        'mean': scores([float(np.mean([rows[i]['lost'] for i in tr]))] * len(te), y_te),
        'gbm': scores(train_gbm([rows[i] for i in tr], [rows[i] for i in te]), y_te),
        'gnn': scores(gp, y_te, np_, ny),
    }
    print('random', json.dumps(results['splits']['random']))

    # leave-grids-out folds
    agg = {'gbm': ([], []), 'gnn': ([], [], [], []), 'mean': ([], [])}
    for fold in UNSEEN:
        hold = [g for g in fold if g in regions]
        if not hold:
            continue
        tr = [i for i, r in enumerate(rows) if r['region'] not in hold]
        te = [i for i, r in enumerate(rows) if r['region'] in hold]
        y_te = [rows[i]['lost'] for i in te]
        gp, np_, ny, _ = train_gnn([graphs[i] for i in tr], [graphs[i] for i in te])
        gb = train_gbm([rows[i] for i in tr], [rows[i] for i in te])
        agg['gnn'][0].extend(gp); agg['gnn'][1].extend(y_te); agg['gnn'][2].extend(np_); agg['gnn'][3].extend(ny)
        agg['gbm'][0].extend(gb); agg['gbm'][1].extend(y_te)
        agg['mean'][0].extend([float(np.mean([rows[i]['lost'] for i in tr]))] * len(te)); agg['mean'][1].extend(y_te)
        print('held out', hold, 'gnn', scores(gp, y_te, np_, ny), 'gbm', scores(gb, y_te))
    results['splits']['unseen'] = {'mean': scores(*agg['mean']), 'gbm': scores(*agg['gbm']), 'gnn': scores(agg['gnn'][0], agg['gnn'][1], agg['gnn'][2], agg['gnn'][3])}
    print('unseen', json.dumps(results['splits']['unseen']))
    out = HERE / 'runs' / 'gnn'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'results.json').write_text(json.dumps(results, indent=1))


if __name__ == '__main__':
    main()
