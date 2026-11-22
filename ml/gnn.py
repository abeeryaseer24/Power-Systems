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
Node baselines: hop distance from the contingency (nearer buses are hit first), and LightGBM
on per-bus features plus that distance and the grid-level screen.

Usage:  ml/.venv/Scripts/python ml/gnn.py            (study: random split + six leave-grids-out folds)
        SEEDS=3 ...                                    (repeat the network over seeds)
        FINAL=1 ml/.venv/Scripts/python ml/gnn.py    (train on everything, export for the browser)
"""
import base64
import json
import os
import pathlib
import random
import time
from collections import deque

import lightgbm as lgb
import numpy as np
import torch
import torch.nn as nn

HERE = pathlib.Path(__file__).parent
DATA = HERE / 'data' / 'cascade'
DEV = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
MAJOR = 0.10
HOPS = os.environ.get('HOPS', '1') == '1'      # add 1/(1+hops to the fault) as a node input
NODE_W = float(os.environ.get('NODE_W', 1.0))  # weight of the bus-level loss
NODE_GLOBAL = os.environ.get('NODE_GLOBAL', '1') == '1'  # bus head also sees the pooled grid summary
# v2 features travel between grids: no absolute angles (they depend on each grid's reference bus), angle
# differences across lines instead, and loads/generation relative to the grid's own average bus
FEAT = os.environ.get('FEAT', 'v1')
DROPOUT = float(os.environ.get('DROPOUT', 0.0))   # on messages and the heads
LAYERS = int(os.environ.get('LAYERS', 6))
EPOCHS = int(os.environ.get('EPOCHS', 15))
WD = float(os.environ.get('WD', 1e-4))
# every grid is held out once; Dhaka and its metro sub-grid overlap, so they are held out together
UNSEEN = [['london', 'delhi', 'saopaulo'], ['moscow', 'karachi', 'adelaide'], ['newyork', 'istanbul', 'colombo'],
          ['houston', 'madrid'], ['rome', 'tashkent', 'caracas'], ['dhaka', 'dhaka-metro', 'sapporo']]


def load():
    rows = []
    for f in sorted(DATA.glob('*.jsonl')):
        for line in open(f, encoding='utf8'):
            try:
                r = json.loads(line)
            except json.JSONDecodeError:  # a job stopped mid-write
                continue
            if len(r['edges']) == 0:
                continue
            rows.append(r)
    return rows


def portable(r):
    """v2 node and edge features (see FEAT)."""
    x = np.array(r['x'], dtype=np.float32)
    scale = max(1e-3, float(x[:, 1].mean()))
    xn = np.stack([x[:, 0], x[:, 1] / scale, x[:, 2] / scale, x[:, 3] / scale, x[:, 4], x[:, 6], x[:, 7]], 1)
    e = np.array(r['edges']); th = x[:, 5]
    ea = np.array(r['ea'], dtype=np.float32)
    ea = np.concatenate([ea, np.abs(th[e[:, 0]] - th[e[:, 1]])[:, None].astype(np.float32)], 1)
    return xn, ea, scale


def to_graph(r):
    x = np.array(r['x'], dtype=np.float32)
    if FEAT == 'v2':
        x, ea_v2, scale = portable(r)
    bus_trip = np.array(r['busTrip'], dtype=np.float32)[:, None]
    if FEAT == 'v2':
        bus_trip = bus_trip / scale
    x = np.concatenate([x, bus_trip, np.full((len(x), 1), r['extTrip'], np.float32), np.full((len(x), 1), 1.0 if r['freq'] == 60 else 0.0, np.float32)], 1)
    if HOPS:
        x = np.concatenate([x, (1 / (1 + hops(r)))[:, None].astype(np.float32)], 1)
    e = np.array(r['edges'], dtype=np.int64)
    ea = ea_v2 if FEAT == 'v2' else np.array(r['ea'], dtype=np.float32)
    ea = np.concatenate([ea, np.array(r['edgeTrip'], np.float32)[:, None]], 1)
    # undirected: both directions
    e2 = np.concatenate([e, e[:, ::-1]], 0).T.copy()
    ea2 = np.concatenate([ea, ea], 0)
    return {'x': torch.tensor(x), 'ei': torch.tensor(e2), 'ea': torch.tensor(ea2), 'y': float(r['lost']), 'g': torch.tensor(hand_features(r), dtype=torch.float32),
            'yn': torch.tensor(np.array(r['busLost'], np.float32)), 'region': r['region']}


def hops(r):
    """Hops from every bus to the contingency (ends of tripped lines, buses of tripped plants)."""
    n = len(r['x']); adj = [[] for _ in range(n)]
    src = set(i for i, v in enumerate(r['busTrip']) if v > 0)
    for (a, b), t in zip(r['edges'], r['edgeTrip']):
        if t: src.update((a, b))
        else: adj[a].append(b); adj[b].append(a)  # tripped lines no longer connect
    d = np.full(n, 99.0); q = deque()
    for v in src: d[v] = 0; q.append(v)
    while q:
        u = q.popleft()
        for v in adj[u]:
            if d[v] > d[u] + 1: d[v] = d[u] + 1; q.append(v)
    return d


def node_rows(r):
    """Per-bus features for the node baseline: the bus's own state, its distance, the grid-level screen."""
    x = np.array(r['x']); d = hops(r)
    g = np.array(hand_features(r))[None, :].repeat(len(x), 0)
    return np.concatenate([x, d[:, None], 1 / (1 + d[:, None]), g], 1)


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
        self.msg = nn.Sequential(nn.Linear(2 * h + eh, h), nn.ReLU(), nn.Dropout(DROPOUT), nn.Linear(h, h))
        self.upd = nn.Sequential(nn.Linear(2 * h, h), nn.ReLU(), nn.Dropout(DROPOUT), nn.Linear(h, h))
        self.norm = nn.LayerNorm(h)

    def forward(self, h, ei, ea):
        src, dst = ei
        m = self.msg(torch.cat([h[src], h[dst], ea], 1))
        agg = torch.zeros_like(h).index_add_(0, dst, m)
        deg = torch.zeros(h.size(0), 1, device=h.device).index_add_(0, dst, torch.ones(dst.size(0), 1, device=h.device)).clamp(min=1)
        return self.norm(h + self.upd(torch.cat([h, agg / deg], 1)))


class GNN(nn.Module):
    def __init__(self, nx, ne, ng, h=96, layers=None):
        layers = layers or LAYERS
        super().__init__()
        self.enc = nn.Sequential(nn.Linear(nx, h), nn.ReLU(), nn.Linear(h, h))
        self.eenc = nn.Sequential(nn.Linear(ne, h // 2), nn.ReLU())
        self.layers = nn.ModuleList([Layer(h, h // 2) for _ in range(layers)])
        self.genc = nn.Sequential(nn.Linear(ng, h // 2), nn.ReLU())
        self.node = nn.Sequential(nn.Linear(h + 2 * h + h // 2, h), nn.ReLU(), nn.Linear(h, 1)) if NODE_GLOBAL else nn.Linear(h, 1)
        self.graph = nn.Sequential(nn.Linear(2 * h + h // 2 + 1, h), nn.ReLU(), nn.Linear(h, h // 2), nn.ReLU(), nn.Linear(h // 2, 1))

    def forward(self, x, ei, ea, batch, n_graphs, gf):
        h = self.enc(x)
        e = self.eenc(ea)
        for L in self.layers:
            h = L(h, ei, e)
        mean = torch.zeros(n_graphs, h.size(1), device=h.device).index_add_(0, batch, h)
        cnt = torch.zeros(n_graphs, 1, device=h.device).index_add_(0, batch, torch.ones(h.size(0), 1, device=h.device))
        mx = torch.full((n_graphs, h.size(1)), -1e9, device=h.device).scatter_reduce_(0, batch[:, None].expand_as(h), h, 'amax')
        ge = self.genc(gf)
        if NODE_GLOBAL:  # every bus sees how bad the whole event looks, not only its own neighbourhood
            node = torch.sigmoid(self.node(torch.cat([h, (mean / cnt)[batch], mx[batch], ge[batch]], 1))).squeeze(1)
        else:
            node = torch.sigmoid(self.node(h)).squeeze(1)
        # the share of buses the node head expects to lose is a strong summary for the graph head
        nloss = torch.zeros(n_graphs, 1, device=h.device).index_add_(0, batch, node[:, None]) / cnt
        g = self.graph(torch.cat([mean / cnt, mx, ge, nloss], 1)).squeeze(1)
        return g, node


def collate(gs):
    xs, eis, eas, bs, yns = [], [], [], [], []
    off = 0
    for i, g in enumerate(gs):
        xs.append(g['x']); eas.append(g['ea']); eis.append(g['ei'] + off); yns.append(g['yn'])
        bs.append(torch.full((g['x'].size(0),), i, dtype=torch.long)); off += g['x'].size(0)
        bs[-1] = bs[-1].to(xs[-1].device)
    return (torch.cat(xs).to(DEV), torch.cat(eis, 1).to(DEV), torch.cat(eas).to(DEV), torch.cat(bs).to(DEV),
            torch.tensor([g['y'] for g in gs], device=DEV), torch.cat(yns).to(DEV), torch.stack([g['g'] for g in gs]).to(DEV))


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


def train_gnn(train, test, epochs=None, seed=0):
    epochs = epochs or EPOCHS
    torch.manual_seed(seed); random.seed(seed)
    nx_, ne_ = train[0]['x'].size(1), train[0]['ea'].size(1)
    # normalise features on the training set
    X = torch.cat([g['x'] for g in train]); E = torch.cat([g['ea'] for g in train])
    G = torch.stack([g['g'] for g in train])
    mx, sx = X.mean(0), X.std(0).clamp(min=1e-3); me, se = E.mean(0), E.std(0).clamp(min=1e-3); mg, sg = G.mean(0), G.std(0).clamp(min=1e-3)
    # normalised and moved to the GPU once: batching then never leaves the device
    norm = lambda gs: [{**g, 'x': ((g['x'] - mx) / sx).to(DEV), 'ea': ((g['ea'] - me) / se).to(DEV), 'g': ((g['g'] - mg) / sg).to(DEV),
                        'ei': g['ei'].to(DEV), 'yn': g['yn'].to(DEV)} for g in gs]
    tr, te = norm(train), norm(test)
    model = GNN(nx_, ne_, train[0]['g'].numel()).to(DEV)
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=WD)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, epochs)
    for ep in range(epochs):
        model.train(); random.shuffle(tr)
        for i in range(0, len(tr), 32):
            x, ei, ea, b, y, yn, gf = collate(tr[i:i + 32])
            g, n = model(x, ei, ea, b, int(b.max()) + 1, gf)
            # cross-entropy on the share of load lost (a soft label) trains well near 0 and 1
            loss = nn.functional.binary_cross_entropy_with_logits(g, y) + NODE_W * nn.functional.binary_cross_entropy(n, (yn > 0.5).float())
            opt.zero_grad(); loss.backward(); opt.step()
        sched.step()
    model.eval(); preds, nps, nys = [], [], []
    with torch.no_grad():
        for i in range(0, len(te), 64):
            x, ei, ea, b, y, yn, gf = collate(te[i:i + 64])
            g, n = model(x, ei, ea, b, int(b.max()) + 1, gf)
            preds += torch.sigmoid(g).cpu().tolist(); nps += n.cpu().tolist(); nys += yn.cpu().tolist()
    return preds, nps, nys, model, (mx, sx, me, se, mg, sg)


def node_baselines(train_rows, test_rows):
    """Bus-level baselines: hop distance alone, and LightGBM on per-bus features."""
    rng = np.random.default_rng(0)
    pick = [train_rows[i] for i in rng.choice(len(train_rows), min(2500, len(train_rows)), replace=False)]
    Xtr = np.concatenate([node_rows(r) for r in pick]); ytr = np.concatenate([np.array(r['busLost']) > 0.5 for r in pick])
    m = lgb.LGBMClassifier(n_estimators=300, learning_rate=0.05, num_leaves=63, verbose=-1).fit(Xtr, ytr)
    ny = np.concatenate([np.array(r['busLost']) > 0.5 for r in test_rows])
    dist = np.concatenate([-hops(r) for r in test_rows])
    gb = np.concatenate([m.predict_proba(node_rows(r))[:, 1] for r in test_rows])
    return {'hops': round(auc(dist, ny), 3), 'gbm': round(auc(gb, ny), 3)}, gb, ny


def train_gbm(train_rows, test_rows):
    Xtr = np.array([hand_features(r) for r in train_rows]); ytr = np.array([r['lost'] for r in train_rows])
    m = lgb.LGBMRegressor(n_estimators=500, learning_rate=0.03, num_leaves=31, min_child_samples=20, verbose=-1)
    m.fit(Xtr, ytr)
    return np.clip(m.predict(np.array([hand_features(r) for r in test_rows])), 0, 1).tolist()


def avg(runs):
    """Mean and spread of score dicts over seeds."""
    keys = runs[0].keys()
    return {k: round(float(np.mean([r[k] for r in runs])), 3) for k in keys} | {k + '_sd': round(float(np.std([r[k] for r in runs])), 3) for k in keys}


def main():
    rows = load()
    graphs = [to_graph(r) for r in rows]
    regions = sorted(set(r['region'] for r in rows))
    ys = np.array([r['lost'] for r in rows])
    seeds = int(os.environ.get('SEEDS', 1))
    print(f'{len(rows)} samples on {len(regions)} grids; {100 * (ys > MAJOR).mean():.1f} % major events; device {DEV}', flush=True)
    if os.environ.get('FINAL'):
        return export(rows, graphs)
    results = {'n': len(rows), 'grids': regions, 'per_grid': {g: int(sum(r['region'] == g for r in rows)) for g in regions},
               'major_share': round(float((ys > MAJOR).mean()), 3), 'seeds': seeds, 'splits': {}}
    t0 = time.time()

    # random split: 80/20 within the same grids
    idx = list(range(len(rows))); random.Random(1).shuffle(idx)
    cut = int(0.8 * len(idx)); tr, te = idx[:cut], idx[cut:]
    y_te = [rows[i]['lost'] for i in te]
    runs, node_runs = [], []
    for sd in range(seeds):
        gp, np_, ny, _, _ = train_gnn([graphs[i] for i in tr], [graphs[i] for i in te], seed=sd)
        runs.append(scores(gp, y_te, np_, ny)); node_runs.append(np.array(np_))
    results['splits']['random'] = {
        'mean': scores([float(np.mean([rows[i]['lost'] for i in tr]))] * len(te), y_te),
        'gbm': scores(train_gbm([rows[i] for i in tr], [rows[i] for i in te]), y_te),
        'gnn': avg(runs),
    }
    nb, gbn, nyy = node_baselines([rows[i] for i in tr], [rows[i] for i in te])
    nb['hybrid'] = round(auc((np.mean(node_runs, 0) + gbn) / 2, nyy), 3)  # GNN and bus-level trees, averaged
    results['splits']['random']['node_baselines'] = nb
    print('random', json.dumps(results['splits']['random']), f'{time.time() - t0:.0f} s', flush=True)

    # leave-grids-out folds: pooled predictions over all folds, per seed
    folds, pooled = [], {sd: ([], [], [], []) for sd in range(seeds)}
    pm, pg, py = [], [], []
    for fold in UNSEEN:
        hold = [g for g in fold if g in regions]
        if not hold:
            continue
        tr = [i for i, r in enumerate(rows) if r['region'] not in hold]
        te = [i for i, r in enumerate(rows) if r['region'] in hold]
        y_te = [rows[i]['lost'] for i in te]
        gb = train_gbm([rows[i] for i in tr], [rows[i] for i in te])
        mean = [float(np.mean([rows[i]['lost'] for i in tr]))] * len(te)
        nb, gbn, nyy = node_baselines([rows[i] for i in tr], [rows[i] for i in te])
        fr = {'held_out': hold, 'samples': len(te), 'gbm': scores(gb, y_te), 'mean': scores(mean, y_te), 'node_baselines': nb, 'gnn_seeds': []}
        node_runs = []
        for sd in range(seeds):
            gp, np_, ny, _, _ = train_gnn([graphs[i] for i in tr], [graphs[i] for i in te], seed=sd)
            fr['gnn_seeds'].append(scores(gp, y_te, np_, ny)); node_runs.append(np.array(np_))
            for k, v in zip(range(4), (gp, y_te, np_, ny)): pooled[sd][k].extend(v)
        fr['gnn'] = avg(fr['gnn_seeds'])
        nb['hybrid'] = round(auc((np.mean(node_runs, 0) + gbn) / 2, nyy), 3)
        pm += mean; pg += gb; py += y_te
        folds.append(fr)
        print('held out', hold, 'gnn', fr['gnn'], 'gbm', fr['gbm'], 'nodes', fr['node_baselines'], f'{time.time() - t0:.0f} s', flush=True)
    results['splits']['unseen'] = {'mean': scores(pm, py), 'gbm': scores(pg, py),
                                   'gnn': avg([scores(*pooled[sd]) for sd in range(seeds)]), 'folds': folds}
    # node baselines pooled: sample-weighted mean of fold AUCs
    w = np.array([f['samples'] for f in folds])
    results['splits']['unseen']['node_baselines'] = {k: round(float((np.array([f['node_baselines'][k] for f in folds]) * w).sum() / w.sum()), 3) for k in ('hops', 'gbm', 'hybrid')}
    results['minutes'] = round((time.time() - t0) / 60, 1)
    print('unseen', json.dumps({k: v for k, v in results['splits']['unseen'].items() if k != 'folds'}), flush=True)
    out = HERE / 'runs' / 'gnn'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'results.json').write_text(json.dumps(results, indent=1))


def f16(a):
    return base64.b64encode(np.asarray(a, np.float32).astype('<f2').tobytes()).decode()


def export(rows, graphs):
    """Train on every grid and write the weights and normalisation for the browser."""
    _, _, _, model, norm = train_gnn(graphs, graphs[:64], seed=0)
    sd = {k: v.detach().cpu().numpy() for k, v in model.state_dict().items()}
    spec = {'weights': {k: {'shape': list(v.shape), 'data': f16(v)} for k, v in sd.items()},
            'norm': {k: f16(t.cpu().numpy()) for k, t in zip(('mx', 'sx', 'me', 'se', 'mg', 'sg'), norm)},
            'layers': len(model.layers), 'hidden': model.enc[2].out_features, 'trainedOn': len(rows), 'major': MAJOR}
    # parity check for the browser: the first samples of one file, and what this model says about them
    mx, sx, me, se, mg, sg = norm
    chk = []
    model.eval()
    with torch.no_grad():
        for line in list(open(DATA / 'dhaka-4.jsonl', encoding='utf8'))[:3]:
            g = to_graph(json.loads(line))
            gg = [{**g, 'x': ((g['x'] - mx) / sx).to(DEV), 'ea': ((g['ea'] - me) / se).to(DEV), 'g': ((g['g'] - mg) / sg).to(DEV), 'ei': g['ei'].to(DEV), 'yn': g['yn'].to(DEV)}]
            x, ei, ea, b, y, yn, gf = collate(gg)
            gl, n = model(x, ei, ea, b, 1, gf)
            chk.append({'lost': float(torch.sigmoid(gl)[0]), 'bus': [round(float(v), 4) for v in n.cpu()]})
    spec['check'] = {'file': 'dhaka-4.jsonl', 'samples': chk}
    res = HERE / 'runs' / 'gnn' / 'results.json'
    if res.exists(): spec['results'] = json.loads(res.read_text())
    out = HERE.parent / 'public' / 'data' / 'cascade'; out.mkdir(parents=True, exist_ok=True)
    (out / 'gnn.json').write_text(json.dumps(spec, separators=(',', ':')))
    print('exported', round((out / 'gnn.json').stat().st_size / 1e6, 2), 'MB')


if __name__ == '__main__':
    main()
