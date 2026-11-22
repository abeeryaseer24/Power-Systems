# Where the paper's data lives

The tables below list every dataset behind `docs/paper.md`, where it is stored, whether it is in git, and how to rebuild it. Paths are relative to the repository root (`E:\Power Systems`).

**Rule of thumb:**
- **Committed (in git, on GitHub):** small, final outputs that the website and the paper read, under `public/data/`.
- **Local only (gitignored):** large raw downloads and generated training data, under `ml/data/` and `scripts/osm/.cache/`. They can all be rebuilt with the commands given, but downloading again takes hours, so back them up (an external drive or cloud folder).

## 1. Grids and cities (OpenStreetMap)

| What | Path | In git | Size | Rebuild |
|---|---|---|---|---|
| Raw OpenStreetMap downloads (Overpass API) | `scripts/osm/.cache/` | no | ~1.1 GB | `node scripts/osm/build.mjs <id>` (grids), `node scripts/osm/city-fetch.mjs` (cities) |
| 17 transmission grids | `public/data/regions/<id>.json` and `index.json` | yes | 7.3 MB | `node scripts/osm/build.mjs <id>` (uses the cache) |
| Real cities (Dhaka, Delhi) | `public/data/cities/<id>.json/.bin` and `index.json` | yes | 7.2 MB | `node scripts/osm/city-build.mjs <id>` |
| Grid and city settings, with sources for every number | `scripts/osm/regions.mjs`, `scripts/osm/cities.mjs` | yes | | |

## 2. Study A: demand forecaster (Great Britain)

| What | Path | In git | Size | Rebuild |
|---|---|---|---|---|
| NESO demand and forecasts, Open-Meteo weather (raw CSV) | `ml/data/raw/` | no | 38 MB | `ml/.venv/Scripts/python ml/fetch_neso.py`, then `ml/fetch_weather.py` |
| Backtest run (predictions, monthly errors, calibration) | `ml/runs/2026-11-21/` | no | | `ml/forecast.py`, then `ml/calibrate.py` |
| Exported model and backtest summary | `public/data/forecast/gb_model.json`, `gb_backtest.json` | yes | 6.3 MB | `ml/export.py` |

## 3. Study B: learned power flow (surrogate)

| What | Path | In git | Size | Rebuild |
|---|---|---|---|---|
| 30,000 load-flow samples per grid | `ml/data/surrogate/<grid>.bin/.json` | no | 269 MB | `DATA=1 REGIONS=dhaka,adelaide,london N=30000 npx vitest run src/ai/surrogate-data.test.ts` |
| Trained models and full results | `public/data/surrogate/<grid>.json` (field `metrics`) | yes | 5.5 MB | `H=256 ml/.venv/Scripts/python ml/surrogate.py <grid>` |

## 4. Study C: RL dispatch (South Australia)

| What | Path | In git | Size | Rebuild |
|---|---|---|---|---|
| Trained policies and the storage-value model | `ml/data/dispatch_*.pt`, `dispatch_value.pkl` | no | ~4 MB | `ml/dispatch.py 400`, then `ml/dispatch_finetune.py 600`, then `ml/dispatch_finetune.py 800 resume` |
| Results and 12 replay days | `public/data/dispatch/sa.json` | yes | 152 KB | `ml/dispatch_eval.py` |

The days are synthetic and generated from seeds, so no raw data is needed. Test days use seeds 1–100, validation days 900000–900099.

## 5. Study D: cascade GNN

| What | Path | In git | Size | Rebuild |
|---|---|---|---|---|
| 9,929 simulated cascades | `ml/data/cascade/<grid>-<seed>.jsonl` | no | 224 MB | `DATA=1 REGIONS=<grids> N=400 SEED=<n> npx vitest run src/ai/cascade-data.test.ts` |
| Full study results (all folds, seeds, baselines) | `ml/runs/gnn/results.json` | no | | `SEEDS=3 ml/.venv/Scripts/python ml/gnn.py` |
| Generalisation experiments | `ml/runs/gnn/gen.jsonl` | no | | `ml/.venv/Scripts/python ml/gnn_gen.py` |
| Deployed model and results (copy of the above) | `public/data/cascade/gnn.json` (field `results`) | yes | 1.2 MB | `FINAL=1 ml/.venv/Scripts/python ml/gnn.py` |

## 6. Bangladesh load shedding (next study)

| What | Path | In git | Size | Rebuild |
|---|---|---|---|---|
| PGCB daily operation reports (one Excel file per day) | `ml/data/pgcb/raw/<id>.xlsx` | no | ~2.5 GB when complete | `ml/.venv/Scripts/python ml/fetch_pgcb.py` |
| Download log (gaps and errors) | `ml/data/pgcb/log.csv` | no | | |

## 7. The paper itself

| What | Path | In git |
|---|---|---|
| Text (Markdown) | `docs/paper.md` | yes |
| PDF | `docs/paper.pdf` | yes |
| Figures (SVG) | `docs/figures/` | yes |
| Figure script | `ml/figures.py` (reads only committed `public/data/` files) | yes |
| PDF build | `scripts/paper/md2html.py`, `scripts/paper/print.mjs` | yes |

Rebuilding the figures and the PDF needs only the repository, not the local data:

```bash
ml/.venv/Scripts/python ml/figures.py
python scripts/paper/md2html.py docs/paper.md docs/_paper.html
node scripts/paper/print.mjs docs/_paper.html docs/paper.pdf
```

## 8. What to back up

Everything in git is safe on GitHub. These local folders are not, and are slow to recreate:

1. `scripts/osm/.cache/`: days of OpenStreetMap downloads.
2. `ml/data/pgcb/`: hours of PGCB downloads.
3. `ml/data/cascade/` and `ml/data/surrogate/`: hours of simulation.
4. `ml/runs/`: full experiment logs behind the paper's tables.
5. `ml/data/raw/`: the forecaster's downloads.

Copying these five folders to an external drive or a cloud folder protects the whole study.
