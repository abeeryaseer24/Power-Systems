"""Reinforcement-learning dispatch for a South-Australia-like grid, against three references.

The grid (aggregated, single bus, half-hourly):
  wind 2730 MW and utility solar 450 MW (curtailable), rooftop solar 2400 MW (not curtailable
  except by the emergency backstop), combined-cycle gas 1300 MW (ramp 250 MW per half hour),
  open-cycle gas 2100 MW, oil 181 MW, a battery fleet 600 MW / 750 MWh, and the Heywood
  interconnector to Victoria (import 650 MW, export 500 MW) priced at the Victorian spot price.
  System strength: synchronous generation (gas + oil) must stay at or above 300 MW.

Each half hour a dispatcher sets the combined-cycle target, the battery and the interconnector
from forecasts; then the real demand and renewables arrive and the fast plant balances the rest
(open-cycle gas and oil up, renewables curtailed down, rooftop backstop and unserved energy as
the last resorts). The same real-time balancing applies to every dispatcher.

Dispatchers:
  rule      - an operator heuristic (charge on low residual demand or cheap imports, etc.)
  mpc       - rolling 4-hour linear programme on the forecasts, first step applied
  ppo       - a policy trained by proximal policy optimisation on simulated days
  perfect   - one linear programme over the whole day with the actual values (lower bound)

Days are synthetic but calibrated to published South Australian ranges: underlying demand
1.1-3 GW, rooftop solar driving midday operational demand toward zero in spring, wind from a
mean-reverting speed process, Victorian prices from a solar-dipped evening-peaked shape.

Usage:  ml/.venv/Scripts/python ml/dispatch.py [train_iters]
"""
import json
import pathlib
import sys
import time

import numpy as np
import torch
import torch.nn as nn
from scipy.optimize import linprog

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent / 'public' / 'data' / 'dispatch'
OUT.mkdir(parents=True, exist_ok=True)

T, DT, K = 48, 0.5, 8                     # half hours per day, hours per step, forecast steps seen
WIND, USOL, ROOF = 2730.0, 450.0, 2400.0
CC, CC_RAMP, OC, OIL = 1300.0, 250.0, 2100.0, 181.0
BP, BE, ETA = 600.0, 750.0, 0.9 ** 0.5    # battery MW, MWh, one-way efficiency
IMP, EXP, SYNC = 650.0, 500.0, 300.0
C_CC, C_OC, C_OIL, C_DEG, C_BK, C_VOLL, C_SOC = 85.0, 170.0, 320.0, 8.0, 600.0, 15000.0, 120.0
SOC0 = 0.5 * BE


# ---------------------------------------------------------------- days

def make_days(seeds):
    """Actual operational demand L (demand minus rooftop), curtailable renewables R, Victorian price,
    and the forecast errors each dispatcher sees: eL/eR[day, issue step, lead]."""
    n = len(seeds)
    out = {k: np.zeros((n, T)) for k in ('L', 'R', 'price', 'demand', 'roof', 'wind', 'usol', 'temp')}
    eL = np.zeros((n, T, K)); eR = np.zeros((n, T, K))
    h = (np.arange(T) + 0.5) * DT
    for d, s in enumerate(seeds):
        g = np.random.default_rng(int(s))
        doy = g.uniform(0, 365)
        tmean = 17 + 6.5 * np.cos(2 * np.pi * (doy - 20) / 365) + g.normal(0, 2.5)
        if g.random() < 0.08 and np.cos(2 * np.pi * (doy - 20) / 365) > 0.5:
            tmean += g.uniform(8, 13)        # heatwave
        temp = tmean + 6 * np.sin(2 * np.pi * (h - 9) / 24)
        shape = 0.55 * np.exp(-((h - 8) / 1.6) ** 2) + 1.0 * np.exp(-((h - 19) / 2.2) ** 2) + 0.25 * np.exp(-((h - 13) / 4) ** 2)
        ou = np.zeros(T)
        for t in range(1, T): ou[t] = 0.9 * ou[t - 1] + g.normal(0, 18)
        demand = 1150 + 520 * shape + 55 * np.maximum(0, temp - 22) + 35 * np.maximum(0, 14 - temp) + ou
        daylen = 12 + 2.2 * np.cos(2 * np.pi * (doy + 10) / 365)
        rise = 12.6 - daylen / 2
        clear = np.clip(np.sin(np.pi * (h - rise) / daylen), 0, None) ** 1.25
        kday = g.beta(5, 2)
        kt = np.zeros(T); x = 0.0
        for t in range(T): x = 0.8 * x + g.normal(0, 0.08); kt[t] = np.clip(kday + x, 0.05, 1)
        roof = ROOF * 0.62 * clear * kt  # inverter clipping, orientation, soiling: peak ~1.5 GW of 2.4 GW installed
        usol = USOL * clear * kt
        v = np.zeros(T); mu = g.uniform(4.5, 10.5); v[0] = mu + g.normal(0, 2)
        for t in range(1, T): v[t] = v[t - 1] + 0.12 * (mu - v[t - 1]) + g.normal(0, 0.9)
        frac = np.clip((np.clip(v, 0, None) ** 3 - 27) / (1728 - 27), 0, 1) * (v < 25)
        wind = WIND * 0.92 * frac
        price = 75 + 85 * np.exp(-((h - 19) / 2.3) ** 2) - 70 * clear * g.uniform(0.6, 1.2) + g.normal(0, 8, T) + 2.5 * np.maximum(0, temp - 30)
        out['L'][d] = demand - roof; out['R'][d] = wind + usol; out['price'][d] = np.clip(price, -40, 300)
        out['demand'][d] = demand; out['roof'][d] = roof; out['wind'][d] = wind; out['usol'][d] = usol; out['temp'][d] = temp
        lead = np.sqrt(np.arange(1, K + 1))
        eL[d] = g.normal(0, 1, (T, K)) * np.minimum(250, 35 * lead)[None, :]
        eR[d] = g.normal(0, 1, (T, K)) * np.minimum(500, 90 * lead)[None, :]
    out['eL'], out['eR'] = eL, eR
    return out


def forecasts(days, t):
    """What every dispatcher knows at the start of step t: forecasts of L and R for t..t+K-1
    (beyond the day: the last value), and the Victorian price (published day-ahead, exact)."""
    idx = np.minimum(np.arange(t, t + K), T - 1)
    Lf = days['L'][:, idx] + days['eL'][:, t, :]
    Rf = np.clip(days['R'][:, idx] + days['eR'][:, t, :], 0, WIND + USOL)
    return Lf, Rf, days['price'][:, idx]


# ---------------------------------------------------------------- real-time balancing (shared)

def step(days, t, soc, ccp, cc_tgt, batt, ic):
    """Apply decisions (MW) and balance with the actual values. batt > 0 discharges; ic > 0 imports."""
    L, R, pr = days['L'][:, t], days['R'][:, t], days['price'][:, t]
    cc = np.clip(cc_tgt, np.maximum(0, ccp - CC_RAMP), np.minimum(CC, ccp + CC_RAMP))
    dis = np.clip(batt, 0, np.minimum(BP, soc * ETA / DT))
    ch = np.clip(-batt, 0, np.minimum(BP, (BE - soc) / ETA / DT))
    imp = np.clip(ic, -EXP, IMP)
    res = L - R - cc - dis + ch - imp
    oc = np.clip(res, 0, OC); oil = np.clip(res - OC, 0, OIL); uns = np.clip(res - OC - OIL, 0, None)
    over = np.clip(-res, 0, None)
    # system strength: keep enough synchronous machines on, and absorb their output by curtailing
    short = np.clip(SYNC - (cc + oc + oil), 0, None)
    oc = oc + short; over = over + short
    curt = np.minimum(over, R); bk = over - curt
    soc2 = soc + (ch * ETA - dis / ETA) * DT
    cost = DT * (C_CC * cc + C_OC * oc + C_OIL * oil + pr * imp + C_DEG * dis + C_BK * bk + C_VOLL * uns)
    rec = dict(cc=cc, oc=oc, oil=oil, dis=dis, ch=ch, imp=imp, curt=curt, bk=bk, uns=uns, soc=soc2, cost=cost, short=short)
    return soc2, cc, rec


def terminal(soc):
    return C_SOC * np.clip(SOC0 - soc, 0, None)  # energy borrowed from tomorrow is paid back


def run(days, policy):
    n = len(days['L']); soc = np.full(n, SOC0); ccp = np.full(n, 600.0)
    recs = []
    for t in range(T):
        cc_tgt, batt, ic = policy(days, t, soc, ccp)
        soc, ccp, rec = step(days, t, soc, ccp, cc_tgt, batt, ic)
        recs.append(rec)
    traj = {k: np.stack([r[k] for r in recs], 1) for k in recs[0]}
    traj['total'] = traj['cost'].sum(1) + terminal(soc)
    return traj


# ---------------------------------------------------------------- references

def rule(days, t, soc, ccp):
    """A sensible operator heuristic: combined-cycle plant follows the forecast residual demand (never
    below the system-strength floor), the battery charges on surplus or cheap power and discharges on
    tight or expensive periods, and the interconnector covers what is left, exporting surplus only at
    positive prices."""
    Lf, Rf, pf = forecasts(days, t)
    res = Lf[:, 0] - Rf[:, 0]
    ahead = (Lf - Rf).max(1)
    cc = np.clip(np.maximum(res, 0.7 * ahead) - 200, SYNC, CC)
    batt = np.where((res < 300) | (pf[:, 0] < 30), -BP, np.where((res > 1500) | (pf[:, 0] > 150), BP, 0.0))
    r2 = res - cc - batt
    ic = np.where(r2 > 0, np.where(pf[:, 0] < C_OC, np.minimum(r2, IMP), 0.0), np.where(pf[:, 0] > 0, -np.minimum(-r2, EXP), 0.0))
    return cc, batt, ic


def lp(L, R, pr, soc0, cc0, horizon_soc_value=True):
    """Dispatch LP over len(L) steps for one day. Returns the first-step (cc, batt, ic) and the full plan."""
    H = len(L)
    names = ['cc', 'oc', 'oil', 'ch', 'dis', 'soc', 'imp', 'exp', 'curt', 'bk', 'uns']
    V = len(names); ix = lambda k, t: names.index(k) * H + t
    c = np.zeros(V * H)
    for t in range(H):
        c[ix('cc', t)] = C_CC * DT; c[ix('oc', t)] = C_OC * DT; c[ix('oil', t)] = C_OIL * DT
        c[ix('dis', t)] = C_DEG * DT; c[ix('imp', t)] = pr[t] * DT; c[ix('exp', t)] = -pr[t] * DT
        c[ix('bk', t)] = C_BK * DT; c[ix('uns', t)] = C_VOLL * DT
        c[ix('ch', t)] = 1e-3; c[ix('curt', t)] = 1e-3   # tie-breaks: don't cycle or spill for nothing
    if horizon_soc_value:
        c[ix('soc', H - 1)] -= C_SOC * 0.999   # stored energy at the end is worth the payback price
    bounds = []
    for k in names:
        for t in range(H):
            ub = {'cc': CC, 'oc': OC, 'oil': OIL, 'ch': BP, 'dis': BP, 'soc': BE, 'imp': IMP, 'exp': EXP, 'curt': max(0, R[t]), 'bk': None, 'uns': None}[k]
            bounds.append((0, ub))
    Ae, be, Au, bu = [], [], [], []
    for t in range(H):
        row = np.zeros(V * H)  # balance: cc+oc+oil+dis-ch+imp-exp+R-curt+uns = L+bk
        for k, s in (('cc', 1), ('oc', 1), ('oil', 1), ('dis', 1), ('ch', -1), ('imp', 1), ('exp', -1), ('curt', -1), ('uns', 1), ('bk', -1)):
            row[ix(k, t)] = s
        Ae.append(row); be.append(L[t] - R[t])
        row = np.zeros(V * H)  # battery energy
        row[ix('soc', t)] = 1; row[ix('ch', t)] = -ETA * DT; row[ix('dis', t)] = DT / ETA
        if t > 0: row[ix('soc', t - 1)] = -1
        Ae.append(row); be.append(soc0 if t == 0 else 0)
        row = np.zeros(V * H)  # system strength
        row[ix('cc', t)] = row[ix('oc', t)] = row[ix('oil', t)] = -1
        Au.append(row); bu.append(-SYNC)
        for sgn in (1, -1):  # ramp
            row = np.zeros(V * H); row[ix('cc', t)] = sgn
            if t > 0: row[ix('cc', t - 1)] = -sgn
            Au.append(row); bu.append(CC_RAMP + (sgn * cc0 if t == 0 else 0))
    r = linprog(c, A_ub=np.array(Au), b_ub=np.array(bu), A_eq=np.array(Ae), b_eq=np.array(be), bounds=bounds, method='highs')
    x = r.x
    get = lambda k: x[names.index(k) * H:(names.index(k) + 1) * H]
    return (get('cc')[0], get('dis')[0] - get('ch')[0], get('imp')[0] - get('exp')[0]), {k: get(k) for k in names}


def mpc(days, t, soc, ccp, H=12):
    n = len(soc); Lf, Rf, pf = forecasts(days, t)
    out = np.zeros((3, n))
    for d in range(n):
        h = min(H, K)
        L, R, pr = Lf[d, :h], Rf[d, :h], pf[d, :h]
        out[:, d] = lp(L, R, pr, soc[d], ccp[d], horizon_soc_value=True)[0]
    return out[0], out[1], out[2]


def perfect_policy(days):
    plans = [lp(days['L'][d], days['R'][d], days['price'][d], SOC0, 600.0)[1] for d in range(len(days['L']))]
    def pol(_days, t, soc, ccp):
        return (np.array([p['cc'][t] for p in plans]), np.array([p['dis'][t] - p['ch'][t] for p in plans]), np.array([p['imp'][t] - p['exp'][t] for p in plans]))
    return pol


# ---------------------------------------------------------------- PPO

def obs(days, t, soc, ccp):
    Lf, Rf, pf = forecasts(days, t)
    n = len(soc); ph = 2 * np.pi * t / T
    return np.concatenate([np.stack([np.full(n, np.sin(ph)), np.full(n, np.cos(ph)), np.full(n, t / T), soc / BE, ccp / CC], 1),
                           Lf / 2000, Rf / 3000, pf / 200], 1).astype(np.float32)


OBS = 5 + 3 * K


class Policy(nn.Module):
    def __init__(self, h=128):
        super().__init__()
        self.mu = nn.Sequential(nn.Linear(OBS, h), nn.Tanh(), nn.Linear(h, h), nn.Tanh(), nn.Linear(h, 3))
        self.v = nn.Sequential(nn.Linear(OBS, h), nn.Tanh(), nn.Linear(h, h), nn.Tanh(), nn.Linear(h, 1))
        self.logstd = nn.Parameter(torch.full((3,), -0.5))

    def dist(self, x):
        return torch.distributions.Normal(self.mu(x), self.logstd.exp())


def act_to_mw(a):
    a = np.clip(a, -1, 1)
    return (a[:, 0] + 1) / 2 * CC, a[:, 1] * BP, np.where(a[:, 2] > 0, a[:, 2] * IMP, a[:, 2] * EXP)


def train_ppo(iters, n_env=256, seed0=100000):
    torch.manual_seed(0); np.random.seed(0)
    net = Policy(); opt = torch.optim.Adam(net.parameters(), 3e-4)
    gamma, lam, clip = 0.995, 0.95, 0.2
    hist = []
    for it in range(iters):
        days = make_days(seed0 + it * n_env + np.arange(n_env))
        soc = np.full(n_env, SOC0); ccp = np.full(n_env, 600.0)
        O, A, LP, Rw, Vv = [], [], [], [], []
        for t in range(T):
            o = obs(days, t, soc, ccp)
            with torch.no_grad():
                x = torch.tensor(o); d = net.dist(x); a = d.sample(); lpb = d.log_prob(a).sum(1); v = net.v(x)[:, 0]
            cc, batt, ic = act_to_mw(a.numpy())
            soc, ccp, rec = step(days, t, soc, ccp, cc, batt, ic)
            r = -rec['cost'] / 2e5
            if t == T - 1: r = r - terminal(soc) / 2e5
            O.append(o); A.append(a.numpy()); LP.append(lpb.numpy()); Rw.append(r); Vv.append(v.numpy())
        Rw = np.array(Rw); Vv = np.array(Vv)
        adv = np.zeros_like(Rw); g = 0
        for t in reversed(range(T)):
            nv = Vv[t + 1] if t < T - 1 else 0
            delta = Rw[t] + gamma * nv - Vv[t]
            g = delta + gamma * lam * g; adv[t] = g
        ret = adv + Vv
        O_ = torch.tensor(np.concatenate(O)); A_ = torch.tensor(np.concatenate(A)); LP_ = torch.tensor(np.concatenate(LP))
        AD = torch.tensor(adv.reshape(-1).astype(np.float32)); RT = torch.tensor(ret.reshape(-1).astype(np.float32))
        AD = (AD - AD.mean()) / (AD.std() + 1e-8)
        N = len(O_)
        for _ in range(8):
            for b in torch.randperm(N).split(2048):
                d = net.dist(O_[b]); lp_ = d.log_prob(A_[b]).sum(1)
                ratio = (lp_ - LP_[b]).exp()
                pl = -torch.min(ratio * AD[b], ratio.clamp(1 - clip, 1 + clip) * AD[b]).mean()
                vl = ((net.v(O_[b])[:, 0] - RT[b]) ** 2).mean()
                loss = pl + 0.5 * vl - 0.002 * d.entropy().sum(1).mean()
                opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(net.parameters(), 0.5); opt.step()
        day_cost = -Rw.sum(0).mean() * 2e5
        hist.append(round(float(day_cost)))
        if it % 20 == 0 or it == iters - 1:
            print(f'  iter {it:4d}  mean day cost ${day_cost / 1e6:.3f} M  std {net.logstd.exp().detach().numpy().round(3)}')
    return net, hist


def ppo_policy(net):
    def pol(days, t, soc, ccp):
        with torch.no_grad():
            a = net.mu(torch.tensor(obs(days, t, soc, ccp))).numpy()
        return act_to_mw(a)
    return pol


# ---------------------------------------------------------------- main

def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else '400'
    test = make_days(np.arange(1, 101))   # held-out days: seeds never used in training
    res, trajs = {}, {}
    ckpt = HERE / 'data' / 'dispatch_ppo.pt'
    if arg == 'eval':  # re-evaluate the saved policy without retraining
        net = Policy(); net.load_state_dict(torch.load(ckpt)); old = json.loads((OUT / 'sa.json').read_text())['results']
        hist, res['train_s'] = old['learning_curve'], old['train_s']
    else:
        t0 = time.time(); net, hist = train_ppo(int(arg)); res['train_s'] = round(time.time() - t0)
    for name, pol in (('rule', rule), ('ppo', ppo_policy(net)), ('mpc', mpc), ('perfect', perfect_policy(test))):
        t0 = time.time(); tr = run(test, pol); trajs[name] = tr
        res[name] = {
            'cost_M': round(float(tr['total'].mean()) / 1e6, 4), 'unserved_MWh': round(float(tr['uns'].sum(1).mean() * DT), 2),
            'curtailed_MWh': round(float(tr['curt'].sum(1).mean() * DT), 1), 'backstop_MWh': round(float(tr['bk'].sum(1).mean() * DT), 2),
            'gas_MWh': round(float((tr['cc'] + tr['oc']).sum(1).mean() * DT)), 'battery_cycles': round(float(tr['dis'].sum(1).mean() * DT / BE), 2),
            'import_MWh': round(float(tr['imp'].sum(1).mean() * DT)), 'decide_ms': round((time.time() - t0) / T * 1000 / len(test['L']), 3),
        }
    best = trajs['perfect']['total']
    for name in ('rule', 'ppo', 'mpc', 'perfect'):
        gap = trajs[name]['total'] - best
        res[name]['gap_pct'] = round(float(gap.sum() / best.sum() * 100), 2)   # extra cost over the period, % of the floor
        res[name]['gap_p90_k'] = round(float(np.quantile(gap, 0.9)) / 1e3, 1)  # a bad day: 90th percentile extra cost, $k
        res[name]['beats_mpc_days'] = int((trajs[name]['total'] < trajs['mpc']['total'] - 1).sum())
        print(f"{name:8s} ${res[name]['cost_M']:.3f} M/day  gap {res[name]['gap_pct']:5.2f} %  unserved {res[name]['unserved_MWh']} MWh  curtailed {res[name]['curtailed_MWh']} MWh  cycles {res[name]['battery_cycles']}")
    res['learning_curve'] = hist
    # replays of twelve test days for the page: a spread of days by residual demand
    spread = np.argsort((test['L'] - test['R']).mean(1))[np.linspace(0, 99, 12).astype(int)]
    days = []
    for d in spread:
        day = {k: np.round(test[k][d]).astype(int).tolist() for k in ('demand', 'roof', 'wind', 'usol', 'price', 'temp')}
        day['seed'] = int(d + 1)
        day['runs'] = {name: {k: np.round(trajs[name][k][d]).astype(int).tolist() for k in ('cc', 'oc', 'oil', 'dis', 'ch', 'imp', 'curt', 'bk', 'uns', 'soc', 'cost')} | {'total': round(float(trajs[name]['total'][d]))} for name in trajs}
        days.append(day)
    spec = {'results': res, 'days': days, 'fleet': {'wind': WIND, 'usol': USOL, 'roof': ROOF, 'cc': CC, 'oc': OC, 'oil': OIL, 'bp': BP, 'be': BE, 'imp': IMP, 'exp': EXP, 'sync': SYNC},
            'costs': {'cc': C_CC, 'oc': C_OC, 'oil': C_OIL, 'deg': C_DEG, 'backstop': C_BK, 'voll': C_VOLL}}
    (OUT / 'sa.json').write_text(json.dumps(spec, separators=(',', ':')))
    if arg != 'eval': torch.save(net.state_dict(), ckpt)
    print('exported', round((OUT / 'sa.json').stat().st_size / 1e3), 'kB')


if __name__ == '__main__':
    main()
