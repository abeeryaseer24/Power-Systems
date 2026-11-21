"""Train the AC power-flow surrogate for one grid and export it for the browser.

Input:  bus active and reactive injections (pu) and a one-hot of the line taken out (N-1).
Output: every bus voltage (pu), every line loading (fraction of rating), and a logit for
        "the load flow solves at all" (voltage collapse / divergence).
Data:   ml/data/surrogate/<id>.{json,bin} from src/ai/surrogate-data.test.ts.

Two tests, both reported:
  random   - 10 % of samples never seen in training;
  unseen   - 20 % of the N-1 lines are never taken out in training, only at test time,
             so the network must generalise to contingencies it has not seen.
Baselines: the base-case answer (no model), and ridge regression on the same inputs.

Usage:  ml/.venv/Scripts/python ml/surrogate.py dhaka [epochs]
"""
import base64
import json
import pathlib
import sys
import time

import numpy as np
import torch
import torch.nn as nn

HERE = pathlib.Path(__file__).parent
DATA = HERE / 'data' / 'surrogate'
OUT = HERE.parent / 'public' / 'data' / 'surrogate'
OUT.mkdir(parents=True, exist_ok=True)
dev = 'cuda' if torch.cuda.is_available() else 'cpu'


def load(rid):
    meta = json.loads((DATA / f'{rid}.json').read_text(encoding='utf8'))
    n, L, W = meta['n'], meta['L'], meta['W']
    rows = np.fromfile(DATA / f'{rid}.bin', dtype=np.float32).reshape(-1, W)
    P, Q, out = rows[:, :n], rows[:, n:2 * n], rows[:, 2 * n].astype(int)
    V, load_, conv = rows[:, 2 * n + 1:3 * n + 1], rows[:, 3 * n + 1:3 * n + 1 + L], rows[:, -1]
    oh = np.zeros((len(rows), L), np.float32)
    oh[np.arange(len(rows))[out >= 0], out[out >= 0]] = 1
    dc = dc_post(meta, rid, P, out)
    X = np.concatenate([P, Q, oh, dc], 1)
    Y = np.concatenate([V, load_], 1)
    return meta, X, Y, conv, out


def dc_matrices(meta, rid):
    """PTDF (L x n, reference bus 0) and LODF (L x L) of the base topology, from the line reactances."""
    n, L = meta['n'], meta['L']
    if 'from' in meta:
        fr, to, x = meta['from'], meta['to'], meta['x']
    else:  # older files: rebuild from the region file
        reg = json.loads((HERE.parent / 'public' / 'data' / 'regions' / f'{rid}.json').read_text(encoding='utf8'))
        local = {b: i for i, b in enumerate(meta['buses'])}
        br = [reg['branches'][i] for i in meta['branches']]
        fr, to, x = [local[b['a']] for b in br], [local[b['b']] for b in br], [b['x'] for b in br]
    A = np.zeros((L, n))
    A[np.arange(L), fr] = 1; A[np.arange(L), to] = -1
    y = 1 / np.maximum(6e-4, np.array(x))
    B = A.T @ (y[:, None] * A)
    Binv = np.zeros((n, n)); Binv[1:, 1:] = np.linalg.inv(B[1:, 1:])
    ptdf = (y[:, None] * A) @ Binv
    h = ptdf @ A.T  # flow on line i per unit transfer across line k
    den = 1 - np.diag(h)
    lodf = h / np.where(np.abs(den) < 1e-9, np.nan, den)[None, :]
    np.fill_diagonal(lodf, -1)
    return ptdf, np.nan_to_num(lodf), np.array(meta['mva'])


def dc_post(meta, rid, P, out):
    """DC post-contingency loading of every line, % of rating / 100: the classic screening estimate."""
    ptdf, lodf, mva = dc_matrices(meta, rid)
    f = P @ ptdf.T
    k = np.where(out >= 0)[0]
    f[k] = f[k] + lodf[:, out[k]].T * f[k, out[k]][:, None]
    f[k, out[k]] = 0
    return (np.abs(f) * 100 / mva[None, :]).astype(np.float32)


class Net(nn.Module):
    def __init__(self, i, o, h=int(__import__('os').environ.get('H', 256)), depth=3):
        super().__init__()
        layers, d = [], i
        for _ in range(depth):
            layers += [nn.Linear(d, h), nn.SiLU()]
            d = h
        layers.append(nn.Linear(d, o + 1))
        self.f = nn.Sequential(*layers)

    def forward(self, x):
        return self.f(x)


def auc(y, s):
    o = np.argsort(s); y = y[o]
    pos = y.sum(); neg = len(y) - pos
    if pos == 0 or neg == 0:
        return float('nan')
    ranks = np.arange(1, len(y) + 1)
    return float((ranks[y == 1].sum() - pos * (pos + 1) / 2) / (pos * neg))


def metrics(n, Yt, Yp, out, conv_t=None, logit=None):
    """Errors on the solved cases; the outaged line's loading is excluded."""
    V_err = np.abs(Yp[:, :n] - Yt[:, :n])
    mask = np.ones_like(Yt[:, n:], bool)
    mask[np.arange(len(out))[out >= 0], out[out >= 0]] = False
    l_err = np.abs(Yp[:, n:] - Yt[:, n:])[mask]
    ov_t = (Yt[:, n:] > 1.0) & mask; ov_p = (Yp[:, n:] > 1.0) & mask
    tp = (ov_t & ov_p).sum(); fp = (~ov_t & ov_p).sum(); fn = (ov_t & ~ov_p).sum()
    lv_t = (Yt[:, :n] < 0.95); lv_p = (Yp[:, :n] < 0.95)
    tpv = (lv_t & lv_p).sum(); fpv = (~lv_t & lv_p).sum(); fnv = (lv_t & ~lv_p).sum()
    m = {
        'V_MAE_pu': float(V_err.mean()), 'V_p99_pu': float(np.quantile(V_err, 0.99)), 'V_max_pu': float(V_err.max()),
        'loading_MAE_pct': float(l_err.mean() * 100), 'loading_p99_pct': float(np.quantile(l_err, 0.99) * 100),
        'overload_recall': float(tp / max(1, tp + fn)), 'overload_precision': float(tp / max(1, tp + fp)), 'overloads': int(ov_t.sum()),
        'lowV_recall': float(tpv / max(1, tpv + fnv)), 'lowV_precision': float(tpv / max(1, tpv + fpv)), 'lowV': int(lv_t.sum()),
    }
    if logit is not None:
        m['solve_AUC'] = auc(1 - conv_t, -logit)
    return {k: round(v, 5) if isinstance(v, float) else v for k, v in m.items()}


def train(X, Y, C, out, tr, n, L, epochs, cols=None):
    xm, xs = X[tr].mean(0), X[tr].std(0) + 1e-6
    xm[2 * n:2 * n + L], xs[2 * n:2 * n + L] = 0, 1  # one-hot outage columns stay 0/1
    ok = tr & (C == 1)
    ym, ys = Y[ok].mean(0), Y[ok].std(0) + 1e-6
    Xn = (X - xm) / xs
    if cols is not None:
        Xn = Xn * cols[None, :]  # ablation: switch input groups off
    Xt = torch.tensor(Xn.astype(np.float32), device=dev)
    Yt = torch.tensor((Y - ym) / ys, device=dev)
    Ct = torch.tensor(C, device=dev)
    # the outaged line's loading is zero by definition: don't spend capacity learning it
    Mt = torch.ones_like(Yt)
    idx = np.where(out >= 0)[0]
    Mt[torch.tensor(idx, device=dev), torch.tensor(n + out[idx], device=dev)] = 0
    net = Net(X.shape[1], Y.shape[1]).to(dev)
    opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-5)
    tri = np.where(tr)[0]
    steps = epochs * (len(tri) // 512 + 1)
    sch = torch.optim.lr_scheduler.OneCycleLR(opt, 2e-3, total_steps=steps)
    bce = nn.BCEWithLogitsLoss()
    for ep in range(epochs):
        perm = torch.tensor(np.random.permutation(tri), device=dev)
        tot = 0.0
        for b in perm.split(512):
            o = net(Xt[b])
            c = Ct[b]
            reg = (((o[:, :-1] - Yt[b]) ** 2) * Mt[b]).mean(1)
            loss = (reg * c).sum() / c.sum().clamp(min=1) + 0.1 * bce(o[:, -1], c)
            opt.zero_grad(); loss.backward(); opt.step(); sch.step()
            tot += loss.item() * len(b)
        if ep % 10 == 0 or ep == epochs - 1:
            print(f'  epoch {ep:3d}  loss {tot / len(tri):.5f}')
    net.eval()
    with torch.no_grad():
        o = net(Xt).cpu().numpy()
    return net, (xm, xs, ym, ys), o[:, :-1] * ys + ym, o[:, -1]


def ridge(X, Y, C, tr, lam=1e-2):
    ok = tr & (C == 1)
    xm, xs = X[ok].mean(0), X[ok].std(0) + 1e-6
    A = np.c_[(X[ok] - xm) / xs, np.ones(ok.sum())]
    Wr = np.linalg.solve(A.T @ A + lam * np.eye(A.shape[1]), A.T @ Y[ok])
    return np.c_[(X - xm) / xs, np.ones(len(X))] @ Wr


def f16(a):
    return base64.b64encode(np.asarray(a, np.float32).astype('<f2').tobytes()).decode()


def f32(a):
    return base64.b64encode(np.asarray(a, '<f4').tobytes()).decode()


def main():
    rid = sys.argv[1]
    epochs = int(sys.argv[2]) if len(sys.argv) > 2 else 80
    np.random.seed(0); torch.manual_seed(0)
    meta, X, Y, C, out = load(rid)
    n, L, N = meta['n'], meta['L'], len(X)
    print(f'{rid}: {N} samples, {n} buses, {L} lines, {int((C == 0).sum())} unsolved')
    res = {}
    # test 1: random hold-out
    test = np.random.rand(N) < 0.1
    # test 2: contingencies never seen in training
    cand = np.array(meta['cand']); held = np.random.choice(cand, max(1, len(cand) // 5), replace=False)
    unseen = np.isin(out, held)
    tr = ~test & ~unseen
    t0 = time.time()
    dcY = Y.copy(); dcY[:, n:] = X[:, 2 * n + L:]
    # main model: the outage is described only by physics (DC post-contingency loadings, no line identity),
    # and the network learns the AC correction to the DC estimate
    phys = np.ones(X.shape[1], np.float32); phys[2 * n:2 * n + L] = 0
    R = Y.copy(); R[:, n:] -= X[:, 2 * n + L:]
    net, norm, Rp, logit = train(X, R, C, out, tr, n, L, epochs, phys)
    Yp = Rp.copy(); Yp[:, n:] += X[:, 2 * n + L:]
    res['train_s'] = round(time.time() - t0, 1)
    # ablation: a plain black box - one-hot outage, no physics features, direct targets
    blind = np.ones(X.shape[1], np.float32); blind[2 * n + L:] = 0
    _, _, Yp_nodc, _ = train(X, Y, C, out, tr, n, L, epochs, blind)
    Yr = ridge(X, Y, C, tr)
    base = np.tile(Y[(out < 0) & (C == 1)].mean(0), (N, 1))  # "no model": the average no-outage state
    for name, sel in (('random', test & ~unseen), ('unseen_contingency', unseen)):
        ok = sel & (C == 1)
        res[name] = {
            'samples': int(sel.sum()), 'unsolved': int((sel & (C == 0)).sum()),
            'surrogate': metrics(n, Y[ok], Yp[ok], out[ok]),
            'black_box_one_hot': metrics(n, Y[ok], Yp_nodc[ok], out[ok]),
            'dc_screening': {k: v for k, v in metrics(n, Y[ok], dcY[ok], out[ok]).items() if k.startswith(('loading', 'overload'))},
            'ridge': metrics(n, Y[ok], Yr[ok], out[ok]),
            'mean_state': metrics(n, Y[ok], base[ok], out[ok]),
        }
        if (sel & (C == 0)).sum():
            res[name]['surrogate']['solve_AUC'] = round(auc((C[sel] == 0).astype(int), -logit[sel]), 4)
    # speed: one case at a time and a whole N-1 sweep as one batch, on CPU (as in a browser) and GPU
    Xs = X * phys[None, :]
    cpu = Net(X.shape[1], Y.shape[1]); cpu.load_state_dict({k: v.cpu() for k, v in net.state_dict().items()}); cpu.eval()
    xs1 = torch.tensor(((Xs[:1] - norm[0]) / norm[1]).astype(np.float32))
    xsb = torch.tensor(((Xs[:len(cand)] - norm[0]) / norm[1]).astype(np.float32))
    with torch.no_grad():
        for _ in range(20): cpu(xs1)
        t = time.perf_counter(); [cpu(xs1) for _ in range(500)]; one = (time.perf_counter() - t) / 500
        t = time.perf_counter(); [cpu(xsb) for _ in range(50)]; sweep = (time.perf_counter() - t) / 50
    res['speed'] = {'fdlf_ms': round(meta['ms'], 3), 'surrogate_cpu_ms': round(one * 1e3, 4), 'n1_sweep_cpu_ms': round(sweep * 1e3, 3),
                    'n1_sweep_fdlf_ms': round(meta['ms'] * len(cand), 1), 'contingencies': len(cand)}
    res['held_out_lines'] = sorted(int(h) for h in held)
    for split in ('random', 'unseen_contingency'):
        print(f"--- {split}: {res[split]['samples']} samples, {res[split]['unsolved']} unsolved")
        for k, v in res[split].items():
            if isinstance(v, dict):
                print(f"  {k:26s}", '  '.join(f"{a}={b}" for a, b in v.items() if a in ('V_MAE_pu', 'loading_MAE_pct', 'loading_p99_pct', 'overload_recall', 'overload_precision', 'lowV_recall', 'solve_AUC')))
    print(json.dumps(res['speed']))
    (DATA / f'{rid}_results.json').write_text(json.dumps(res, indent=1))
    dcm = dc_matrices(meta, rid)
    lin = [m for m in net.f if isinstance(m, nn.Linear)]
    spec = {
        'region': rid, 'n': n, 'L': L, 'cand': meta['cand'], 'buses': meta['buses'], 'branches': meta['branches'],
        'xMean': norm[0].round(6).tolist(), 'xStd': norm[1].round(6).tolist(), 'yMean': norm[2].round(6).tolist(), 'yStd': norm[3].round(6).tolist(),
        'layers': [{'w': f16(l.weight.detach().cpu().numpy()), 'b': f16(l.bias.detach().cpu().numpy()), 'inn': l.in_features, 'out': l.out_features} for l in lin],
        'metrics': res, 'samples': N, 'residual': True,
        'ptdf': f32(dcm[0]), 'lodf': f32(dcm[1]), 'mva': meta['mva'],
    }
    (OUT / f'{rid}.json').write_text(json.dumps(spec, separators=(',', ':')))
    print('exported', round((OUT / f'{rid}.json').stat().st_size / 1e6, 2), 'MB')


if __name__ == '__main__':
    main()
