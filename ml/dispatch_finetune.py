"""Imitation warm start + PPO fine-tuning for the dispatch agent (see dispatch.py).

1. Perfect-foresight plans for 4000 training days give the decisions an all-knowing dispatcher
   would have made; the policy learns to copy them from forecasts alone (behaviour cloning).
2. PPO then fine-tunes it on its own simulated days: critic warm-up first, small exploration
   noise, low learning rate, and the best policy on 100 validation days is kept.
Saves ml/data/dispatch_ppo_bc.pt. The test days (seeds 1-100) are never touched here.

Usage:  ml/.venv/Scripts/python ml/dispatch_finetune.py [iters]
"""
import sys
import time

import numpy as np
import torch

import dispatch as D


def main():
    iters = int(sys.argv[1]) if len(sys.argv) > 1 else 600
    resume = len(sys.argv) > 2 and sys.argv[2] == 'resume'
    t0 = time.time()
    ck = D.HERE / 'data' / 'dispatch_ppo_bc.pt'
    curve = D.HERE / 'data' / 'dispatch_ppo_bc_curve.txt'
    val = D.make_days(np.arange(900_000, 900_100))
    if resume:  # continue from the saved policy (and its critic) on fresh training days
        net = D.Policy(); net.load_state_dict(torch.load(ck))
        prev, prev_s = curve.read_text().split('\n')[:2]
        net, hist = D.train_ppo(iters, net=net, lr=1e-4, critic_warm=5, val=val, seed0=4_000_000)
        hist = [int(x) for x in prev.split()] + hist; t0 -= int(prev_s)
    else:
        X, A, _ = D.hindsight(np.arange(5_000_000, 5_004_000))
        net = D.imitate(X, A, 40)
        net, hist = D.train_ppo(iters, net=net, lr=1e-4, logstd=-1.6, critic_warm=15, val=val, seed0=2_000_000)
    torch.save(net.state_dict(), ck)
    curve.write_text(' '.join(map(str, hist)) + f'\n{round(time.time() - t0)}\n')
    print('done', round(time.time() - t0), 's')


if __name__ == '__main__':
    main()
