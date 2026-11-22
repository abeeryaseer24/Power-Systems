"""Generalisation experiments for the cascade GNN on one leave-grids-out fold.

Each variant is a set of environment overrides for gnn.py; every variant is trained with the same
seed on the same grids and scored on grids it never saw. Results append to ml/runs/gnn/gen.jsonl.
Usage:  ml/.venv/Scripts/python ml/gnn_gen.py
"""
import json
import os
import subprocess
import sys

VARIANTS = {
    'base': {},
    'dropout0.2': {'DROPOUT': '0.2'},
    'wd1e-2': {'WD': '1e-2'},
    'short15': {'EPOCHS': '15'},
    'layers3': {'LAYERS': '3'},
    'reg_all': {'DROPOUT': '0.2', 'WD': '1e-2', 'EPOCHS': '20', 'LAYERS': '4'},
}
FOLD = sys.argv[1] if len(sys.argv) > 1 else 'london,delhi,saopaulo'

CODE = '''
import sys, json, numpy as np; sys.path.insert(0, 'ml'); import gnn as G
rows = G.load(); gs = [G.to_graph(r) for r in rows]
hold = sys.argv[1].split(',')
tr = [i for i, r in enumerate(rows) if r['region'] not in hold]; te = [i for i, r in enumerate(rows) if r['region'] in hold]
gp, np_, ny, _, _ = G.train_gnn([gs[i] for i in tr], [gs[i] for i in te], seed=0)
print('RESULT', json.dumps(G.scores(gp, [rows[i]['lost'] for i in te], np_, ny)))
'''

if __name__ == '__main__':
    os.makedirs('ml/runs/gnn', exist_ok=True)
    for name, env in VARIANTS.items():
        out = subprocess.run([sys.executable, '-c', CODE, FOLD], env={**os.environ, **env}, capture_output=True, text=True)
        line = [l for l in out.stdout.splitlines() if l.startswith('RESULT')]
        res = json.loads(line[0][7:]) if line else {'error': out.stderr[-300:]}
        print(f'{name:12s} {res}', flush=True)
        with open('ml/runs/gnn/gen.jsonl', 'a') as f:
            f.write(json.dumps({'variant': name, 'env': env, 'fold': FOLD, **res}) + '\n')
