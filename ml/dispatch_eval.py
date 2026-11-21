"""Final evaluation of every dispatcher on the 100 held-out test days; writes public/data/dispatch/sa.json.

  rule        operator heuristic
  ppo         PPO from scratch (dispatch.py)
  ppo_bc      imitation of perfect-foresight plans + PPO fine-tuning (dispatch_finetune.py)
  mpc         rolling 4-hour LP on the forecasts
  mpc_value   the same LP with a learned value of stored energy at the window's end
  rlmpc       the LP's decision plus a learned bounded correction (dispatch_rlmpc.py)
  perfect     whole-day LP with the actual values (the floor)

Usage:  ml/.venv/Scripts/python ml/dispatch_eval.py
"""
import json
import pickle
import time
from multiprocessing import Pool

import numpy as np
import torch

import dispatch as D
import dispatch_rlmpc as R


def curve(name):
    p = D.HERE / 'data' / name
    if not p.exists():
        return [], 0
    a, b = p.read_text().split('\n')[:2]
    return [int(x) for x in a.split()], int(b)


def main():
    test = D.make_days(np.arange(1, 101))
    net = D.Policy(); net.load_state_dict(torch.load(D.HERE / 'data' / 'dispatch_ppo.pt'))
    bc = D.Policy(); bc.load_state_dict(torch.load(D.HERE / 'data' / 'dispatch_ppo_bc.pt'))
    rl_path = D.HERE / 'data' / 'dispatch_rlmpc.pt'
    rl = None
    if rl_path.exists():
        rl = R.Residual(); rl.load_state_dict(torch.load(rl_path))
    value = pickle.load(open(D.HERE / 'data' / 'dispatch_value.pkl', 'rb'))
    old = json.loads((D.OUT / 'sa.json').read_text())['results']
    trajs, timing = {}, {}
    with Pool(8 if rl else 1) as pool:
        for name, fn in (('rule', lambda: D.run(test, D.rule)), ('ppo', lambda: D.run(test, D.ppo_policy(net))), ('ppo_bc', lambda: D.run(test, D.ppo_policy(bc))),
                         ('mpc', lambda: D.run(test, D.mpc)), ('mpc_value', lambda: D.run(test, D.mpc_learned(value))),
                         ('rlmpc', lambda: R.evaluate(pool, rl, test) if rl else None), ('perfect', lambda: D.run(test, D.perfect_policy(test)))):
            t0 = time.time(); tr = fn(); timing[name] = time.time() - t0
            if tr is not None: trajs[name] = tr
    # decision time per half hour for one day, measured serially (the parallel pool would flatter rlmpc)
    one = D.make_days(np.array([1]))
    for name, pol in (('rule', D.rule), ('ppo', D.ppo_policy(net)), ('ppo_bc', D.ppo_policy(bc)), ('mpc', D.mpc), ('mpc_value', D.mpc_learned(value))):
        t0 = time.perf_counter(); D.run(one, pol); timing[name] = (time.perf_counter() - t0) / D.T * 1000
    if rl: timing['rlmpc'] = timing['mpc'] + timing['ppo_bc']  # one LP plus one network pass
    best = trajs['perfect']['total']
    res = {}
    for name, tr in trajs.items():
        gap = tr['total'] - best
        res[name] = {
            'cost_M': round(float(tr['total'].mean()) / 1e6, 4), 'gap_pct': round(float(gap.sum() / best.sum() * 100), 2),
            'gap_p90_k': round(float(np.quantile(gap, 0.9)) / 1e3, 1),
            'unserved_MWh': round(float(tr['uns'].sum(1).mean() * D.DT), 2), 'curtailed_MWh': round(float(tr['curt'].sum(1).mean() * D.DT), 1),
            'backstop_MWh': round(float(tr['bk'].sum(1).mean() * D.DT), 2), 'ocgt_MWh': round(float(tr['oc'].sum(1).mean() * D.DT)),
            'battery_cycles': round(float(tr['dis'].sum(1).mean() * D.DT / D.BE), 2), 'import_MWh': round(float(tr['imp'].sum(1).mean() * D.DT)),
            'decide_ms': round(timing[name], 3) if name != 'perfect' else None,
            'beats_mpc_days': int((tr['total'] < trajs['mpc']['total'] - 1).sum()),
            'loses_mpc_days': int((tr['total'] > trajs['mpc']['total'] + 1).sum()),
        }
        print(f"{name:10s} ${res[name]['cost_M']:.4f} M/day  +{res[name]['gap_pct']:5.2f} %  OCGT {res[name]['ocgt_MWh']} MWh  curtailed {res[name]['curtailed_MWh']}  beats MPC on {res[name]['beats_mpc_days']} days, loses on {res[name]['loses_mpc_days']}  {res[name]['decide_ms']} ms")
    # paired comparison with the optimiser: mean daily saving and a bootstrap 95 % interval
    rng = np.random.default_rng(0)
    for name in [k for k in ('ppo_bc', 'rlmpc', 'mpc_value') if k in trajs]:
        diff = trajs['mpc']['total'] - trajs[name]['total']
        boots = [diff[rng.integers(0, 100, 100)].mean() for _ in range(4000)]
        res[name]['saving_vs_mpc_k'] = [round(float(diff.mean()) / 1e3, 1), round(float(np.quantile(boots, 0.025)) / 1e3, 1), round(float(np.quantile(boots, 0.975)) / 1e3, 1)]
        print(f'  {name}: saving vs MPC ${res[name]["saving_vs_mpc_k"][0]} k/day (95 % CI {res[name]["saving_vs_mpc_k"][1]} .. {res[name]["saving_vs_mpc_k"][2]})')
    res['learning_curve'], res['train_s'] = old.get('learning_curve', []), old.get('train_s', 0)
    res['curve_bc'], res['train_s_bc'] = curve('dispatch_ppo_bc_curve.txt')
    res['curve_rlmpc'], res['train_s_rlmpc'] = curve('dispatch_rlmpc_curve.txt')
    spread = np.argsort((test['L'] - test['R']).mean(1))[np.linspace(0, 99, 12).astype(int)]
    days = []
    for d in spread:
        day = {k: np.round(test[k][d]).astype(int).tolist() for k in ('demand', 'roof', 'wind', 'usol', 'price', 'temp')}
        day['seed'] = int(d + 1)
        day['runs'] = {name: {k: np.round(trajs[name][k][d]).astype(int).tolist() for k in ('cc', 'oc', 'oil', 'dis', 'ch', 'imp', 'curt', 'bk', 'uns', 'soc', 'cost')} | {'total': round(float(trajs[name]['total'][d]))} for name in trajs}
        days.append(day)
    spec = {'results': res, 'days': days, 'fleet': {'wind': D.WIND, 'usol': D.USOL, 'roof': D.ROOF, 'cc': D.CC, 'oc': D.OC, 'oil': D.OIL, 'bp': D.BP, 'be': D.BE, 'imp': D.IMP, 'exp': D.EXP, 'sync': D.SYNC},
            'costs': {'cc': D.C_CC, 'oc': D.C_OC, 'oil': D.C_OIL, 'deg': D.C_DEG, 'backstop': D.C_BK, 'voll': D.C_VOLL}}
    (D.OUT / 'sa.json').write_text(json.dumps(spec, separators=(',', ':')))
    print('exported', round((D.OUT / 'sa.json').stat().st_size / 1e3), 'kB')


if __name__ == '__main__':
    main()
