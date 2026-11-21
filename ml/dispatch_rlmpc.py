"""RL on top of the optimiser (RL-MPC) for the dispatch problem in dispatch.py.

Each half hour the rolling LP (MPC) proposes its decision from the forecasts, as before. The agent
sees the same forecasts plus that proposal and outputs a bounded correction (at most 30 % of each
range). The correction layer starts at zero, so training starts from the optimiser exactly and only
moves where it finds lower cost on simulated days: in particular, how to hedge against forecast error,
which the deterministic LP cannot do. The best policy on 100 validation days is kept.

Usage:  ml/.venv/Scripts/python ml/dispatch_rlmpc.py [iters] [n_env]
Saves ml/data/dispatch_rlmpc.pt.
"""
import copy
import sys
import time
from multiprocessing import Pool

import numpy as np
import torch
import torch.nn as nn

import dispatch as D

SCALE = 0.3
OBS2 = D.OBS + 3


def _lp_one(args):
    L, R, pr, soc, ccp = args
    a = D.lp(L, R, pr, soc, ccp)[0]
    return a


def mpc_norm(pool, days, t, soc, ccp):
    """The optimiser's decision for every day, normalised to [-1, 1] like the agent's actions."""
    Lf, Rf, pf = D.forecasts(days, t)
    acts = np.array(pool.map(_lp_one, [(Lf[d], Rf[d], pf[d], soc[d], ccp[d]) for d in range(len(soc))], chunksize=8))
    cc, b, ic = acts[:, 0], acts[:, 1], acts[:, 2]
    return np.stack([cc / D.CC * 2 - 1, b / D.BP, np.where(ic > 0, ic / D.IMP, ic / D.EXP)], 1).astype(np.float32)


class Residual(nn.Module):
    def __init__(self, h=128):
        super().__init__()
        self.mu = nn.Sequential(nn.Linear(OBS2, h), nn.Tanh(), nn.Linear(h, h), nn.Tanh(), nn.Linear(h, 3))
        nn.init.zeros_(self.mu[-1].weight); nn.init.zeros_(self.mu[-1].bias)  # start exactly at the optimiser
        self.v = nn.Sequential(nn.Linear(OBS2, h), nn.Tanh(), nn.Linear(h, h), nn.Tanh(), nn.Linear(h, 1))
        self.logstd = nn.Parameter(torch.full((3,), -2.5))  # small: exploration noise is costly here

    def dist(self, x):
        return torch.distributions.Normal(self.mu(x), self.logstd.exp())


def decide(base, a):
    return D.act_to_mw(np.clip(base + SCALE * np.clip(a, -1, 1), -1, 1))


def evaluate(pool, net, days):
    n = len(days['L']); soc = np.full(n, D.SOC0); ccp = np.full(n, 600.0); recs = []
    for t in range(D.T):
        base = mpc_norm(pool, days, t, soc, ccp)
        x = torch.tensor(np.concatenate([D.obs(days, t, soc, ccp), base], 1))
        with torch.no_grad():
            a = net.mu(x).numpy()
        soc, ccp, rec = D.step(days, t, soc, ccp, *decide(base, a)); recs.append(rec)
    traj = {k: np.stack([r[k] for r in recs], 1) for k in recs[0]}
    traj['total'] = traj['cost'].sum(1) + D.terminal(soc)
    return traj


def train(pool, iters, n_env, val):
    torch.manual_seed(0); np.random.seed(0)
    net = Residual(); opt = torch.optim.Adam(net.parameters(), 3e-4)
    gamma, lam, clip = 0.995, 0.95, 0.2
    best = (evaluate(pool, net, val)['total'].mean(), copy.deepcopy(net.state_dict()))
    print(f'  start (= optimiser): validation ${best[0] / 1e6:.4f} M', flush=True)
    hist = []
    for it in range(iters):
        days = D.make_days(3_000_000 + it * n_env + np.arange(n_env))
        soc = np.full(n_env, D.SOC0); ccp = np.full(n_env, 600.0)
        O, A, LP, Rw, Vv = [], [], [], [], []
        for t in range(D.T):
            base = mpc_norm(pool, days, t, soc, ccp)
            o = np.concatenate([D.obs(days, t, soc, ccp), base], 1)
            with torch.no_grad():
                x = torch.tensor(o); d = net.dist(x); a = d.sample(); lpb = d.log_prob(a).sum(1); v = net.v(x)[:, 0]
            soc, ccp, rec = D.step(days, t, soc, ccp, *decide(base, a.numpy()))
            r = -rec['cost'] / 2e5
            if t == D.T - 1: r = r - D.terminal(soc) / 2e5
            O.append(o); A.append(a.numpy()); LP.append(lpb.numpy()); Rw.append(r); Vv.append(v.numpy())
        Rw = np.array(Rw); Vv = np.array(Vv); adv = np.zeros_like(Rw); g = 0
        for t in reversed(range(D.T)):
            nv = Vv[t + 1] if t < D.T - 1 else 0
            g = Rw[t] + gamma * nv - Vv[t] + gamma * lam * g; adv[t] = g
        ret = adv + Vv
        O_ = torch.tensor(np.concatenate(O)); A_ = torch.tensor(np.concatenate(A)); LP_ = torch.tensor(np.concatenate(LP))
        AD = torch.tensor(adv.reshape(-1).astype(np.float32)); RT = torch.tensor(ret.reshape(-1).astype(np.float32))
        AD = (AD - AD.mean()) / (AD.std() + 1e-8)
        warm = it < 10  # fit the critic first
        for _ in range(8):
            for b in torch.randperm(len(O_)).split(1024):
                d = net.dist(O_[b]); ratio = (d.log_prob(A_[b]).sum(1) - LP_[b]).exp()
                pl = -torch.min(ratio * AD[b], ratio.clamp(1 - clip, 1 + clip) * AD[b]).mean()
                vl = ((net.v(O_[b])[:, 0] - RT[b]) ** 2).mean()
                loss = 0.5 * vl if warm else pl + 0.5 * vl - 0.002 * d.entropy().sum(1).mean()
                opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(net.parameters(), 0.5); opt.step()
        hist.append(round(float(-Rw.sum(0).mean() * 2e5)))
        if not warm and (it % 10 == 0 or it == iters - 1):
            v = evaluate(pool, net, val)['total'].mean()
            tag = ''
            if v < best[0]:
                best = (v, copy.deepcopy(net.state_dict())); tag = '  new best'
            print(f'  iter {it:4d}  train ${hist[-1] / 1e6:.3f} M  validation ${v / 1e6:.4f} M{tag}', flush=True)
    net.load_state_dict(best[1])
    return net, hist


def main():
    iters = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    n_env = int(sys.argv[2]) if len(sys.argv) > 2 else 96
    t0 = time.time()
    with Pool(8) as pool:
        val = D.make_days(np.arange(900_000, 900_100))
        net, hist = train(pool, iters, n_env, val)
    torch.save(net.state_dict(), D.HERE / 'data' / 'dispatch_rlmpc.pt')
    (D.HERE / 'data' / 'dispatch_rlmpc_curve.txt').write_text(' '.join(map(str, hist)) + f'\n{round(time.time() - t0)}\n')
    print('done', round(time.time() - t0), 's', flush=True)


if __name__ == '__main__':
    main()
