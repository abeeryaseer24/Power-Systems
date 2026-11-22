# Tested on What They Have Never Seen: Four Machine-Learning Studies for Power-System Operation on Open, Map-Derived Grids

*Draft, 22 November 2026. Author: Talha Yaseer Abeer. Every number in this draft comes from the result files in the repository (see Section 8); figures are listed as placeholders.*

---

## Abstract

Machine-learning methods for power-system operation are usually evaluated on the same networks and conditions they were trained on, which says little about how they behave when the grid, the contingency or the day is new. We built an open platform: a dynamic simulator with AC power flow, protection and frequency control, running on 17 real transmission grids reconstructed from OpenStreetMap. On it we ran four studies, each judged on data its model never saw.

1. **Day-ahead demand forecasting for Great Britain.** A gradient-boosted model was backtested over 46,478 half-hours from March 2024 to October 2026, retrained monthly and fed only the weather forecasts available at the time. It reaches a 3.52 % mean absolute percentage error (MAPE), against 2.79 % for the system operator's (NESO's) published forecast. Averaging the two gives 2.64 %, better than either alone. Conformal calibration raises the coverage of the 10–90 % range from 59 % to 79 %.
2. **A learned AC power flow for N-1 screening.** The network's inputs describe each outage only through classical DC distribution factors, never the line's identity. On outages withheld from training it predicts line loadings with a mean error of 0.04–0.52 % of rating, against 0.22–1.83 % for DC screening. It catches 96–99.6 % of overloads, and screens a full N-1 set 200–770 times faster than the fast decoupled load flow (FDLF).
3. **Reinforcement-learning dispatch for a South-Australia-like grid** under forecast error, on 100 held-out days:
   - PPO trained from scratch costs 29.6 % above the perfect-foresight optimum.
   - Warm-started by imitating hindsight-optimal decisions, the agent statistically ties a rolling-horizon optimiser at about 14 %, while deciding 23 times faster.
   - A learned terminal value of stored energy inside the optimiser gives a small but significant saving: $3.8 k/day, 95 % CI $2.8–4.7 k.
4. **Cascade prediction with a graph neural network (GNN)** on 9,929 simulated cascades across 17 grids, evaluated with every grid held out once. On unseen grids the GNN predicts the share of load lost with 23.7 % mean error, against 31.7 % for gradient boosting on screening features, and major events with an AUC of 0.82 against 0.74. Bus-level boosted trees remain slightly better at naming the substations that lose supply (AUC 0.86 against 0.83).

Across the four studies, the gap between in-distribution and out-of-distribution accuracy is large, method-dependent, and invisible without the right test.

---

## 1. Introduction

Operators already rely on fast approximations: DC screening, rule-based dispatch, a forecaster's point estimate. Machine learning promises better approximations, but a model that has only been scored on the grid and conditions it was trained on has not been tested on the property that matters in operation: what happens when something new arrives. That might be a contingency the model never saw, a day unlike the training days, or a network it was not built for.

This work makes that test the centre of the evaluation. Its contributions are:

1. **An open simulation platform** of 17 transmission grids rebuilt from OpenStreetMap.
   - Each grid has an AC power flow (FDLF with a Newton–Raphson reference), governor droop and AGC, under-frequency load shedding, thermal, distance and out-of-step protection, voltage-collapse detection, and an external equivalent for interconnections.
   - It runs in a web browser, so every result can be inspected interactively.
2. **Four studies, each with a held-out test built for its task:** later months for forecasting, withheld outages for power flow, unseen days for dispatch, and unseen grids for cascades.
3. **Physics-informed designs that generalise better than black boxes:**
   - DC distribution factors as the outage encoding for the power-flow surrogate;
   - hindsight imitation as the warm start for reinforcement learning;
   - learned storage values inside an optimiser.
4. **Negative results reported alongside positive ones.** These include a residual RL-on-MPC agent that never beat its starting point, and five regularisation strategies that barely moved the GNN's bus-level generalisation.

## 2. Related work

*To be completed with a literature review. Planned coverage: (i) load forecasting benchmarks against system-operator forecasts; (ii) neural power-flow and OPF surrogates and their topology handling; (iii) RL for economic dispatch and storage scheduling, and its comparison with MPC; (iv) GNNs for cascading-failure and contingency analysis, especially studies that test on unseen topologies.*

The methods used here build on:
- fast decoupled load flow [1] and DC distribution factors [2];
- gradient boosting [3];
- conformalised quantile regression [4];
- proximal policy optimisation [5];
- neural message passing [6];
- the HiGHS linear programming solver [7];
- ERA5 reanalysis for historical weather [8];
- OpenStreetMap [9].

## 3. Platform

### 3.1 Grids from OpenStreetMap

A build pipeline queries OpenStreetMap through the Overpass API for each region and assembles a single-line model:
- **Network:** power lines, cables, substations and plants above a minimum voltage. HVDC ways are excluded.
- **Line parameters:** reactance, resistance, charging and thermal ratings estimated per voltage class and circuit count.
- **Demand:** spread from population to the three nearest substations, capped at 45 % of the incident line capacity.

Seventeen grids were built: Adelaide, Caracas, Colombo, Delhi, Dhaka, Dhaka metro, Houston, Istanbul, Karachi, London, Madrid, Moscow, New York, Rome, São Paulo, Sapporo and Tashkent. They range from 33 to 345 buses.

Where mapping is incomplete, per-region options correct the model:
- series compensation;
- must-run units;
- extra lines that exist but are not mapped;
- demand correction areas.

Each correction is documented in the configuration file.

*[Figure 1: the 17 grids, drawn from their bus coordinates.]*

### 3.2 Simulator

The simulator advances in steps of 0.05–0.1 s:
- **Swing equation:** one per electrical island, with inertia from synchronous machines.
- **Frequency control:** governor droop and automatic generation control (AGC).
- **AC power flow:** FDLF every 0.25 s, warm-started; if the first solution fails, a Newton–Raphson solve provides the initial operating point.
- **Voltage control:** switched shunts, with reactors and capacitors moved toward the 0.97–1.05 pu band.
- **Protection:** thermal, distance, out-of-step, generator voltage and undervoltage load shedding.
- **Frequency-triggered actions:** rooftop solar trips on fast rate of change of frequency (RoCoF); load shedding in steps from 48.8 Hz; island collapse below 47.5 Hz.
- **Interconnection:** an external equivalent represents the wider system, as AC ties or an HVDC link.

The same simulator replays 24 historical blackouts in the accompanying web application.

---

## 4. Study A: day-ahead demand forecasting (Great Britain)

### 4.1 Data and protocol

- **Demand:** GB national demand outturn, eight years at half-hour resolution, with NESO's published day-ahead forecast as the benchmark.
- **Weather:** ten population-weighted cities. Historical values come from ERA5; for the backtest we used the previous-run day-ahead forecasts that would have been available at the time, not observed weather.
- **Calendar:** bank holidays and the Christmas period.
- **Model:** LightGBM, retrained each month on all earlier data, then used to forecast that month a day ahead.
- **Uncertainty:** 10 % and 90 % quantile models give a range, widened by conformalised quantile regression. The widening uses only scores from earlier test months, so no future data leaks in.

### 4.2 Results

Test period: 6 March 2024 to 30 October 2026, 46,478 half-hours.

| Forecast | MAPE | MAE |
|---|---|---|
| Naive: same half-hour a week earlier | 8.20 % | 2,063 MW |
| This model | 3.52 % | 870 MW |
| NESO day-ahead | 2.79 % | 690 MW |
| Average of model and NESO | **2.64 %** | — |

| 10–90 % range | Coverage (target 80 %) | Mean width |
|---|---|---|
| Raw quantile models | 59.4 % | 1,985 MW |
| After conformal calibration | 78.8 % | 2,878 MW |

The model does not beat the operator, which has richer inputs (embedded-generation metering and operator judgement). But its errors are different enough that averaging the two beats both. The raw quantile range is too narrow because the models were trained on observed weather and run on forecast weather; conformal calibration corrects most of that gap.

*[Figure 2: monthly MAPE of the model, NESO and the naive forecast. Figure 3: a winter week, a summer week and Christmas, with the calibrated range.]*

---

## 5. Study B: a learned AC power flow for N-1 screening

### 5.1 Problem

Each grid is settled once in the simulator to fix its base case. Samples then redraw:
- the operating point: system load from 55 to 145 %, per-bus lognormal noise (σ = 0.15), a fresh dispatch of every plant, and inverter output from 0 to 100 %;
- the topology: in 75 % of samples, one line is taken out. Lines whose loss would island part of the grid are excluded.

The FDLF, warm-started from the base case, labels each sample with every bus voltage, every line loading and whether it converged. That gives 30,000 samples per grid, on Dhaka (101 buses), South Australia (119) and London (339).

### 5.2 Model

- **Inputs:** bus active and reactive injections, plus the DC post-contingency loading of every line, computed from PTDF and LODF factors. The outage is described only through these DC loadings; the line's identity is never given.
- **Outputs:** every bus voltage, and the AC correction to every DC loading (a residual), plus a logit for whether the case converges.
- **Network:** three hidden layers of 256 units.

### 5.3 Evaluation

Two test sets:
- random hold-out samples;
- **unseen contingencies:** 20 % of the N-1 lines are never taken out in training.

Baselines:
- DC screening alone;
- ridge regression on the same inputs;
- the same network given a one-hot code of the outaged line ("black box");
- the average state.

### 5.4 Results

Mean error on line loading, as a percentage of the line's rating:

| Unseen contingencies | Dhaka | South Australia | London |
|---|---|---|---|
| **Surrogate (DC features + residual)** | **0.52 %** | **0.10 %** | **0.04 %** |
| Ridge regression | 1.10 % | 0.25 % | 0.10 % |
| Black box (one-hot outage) | 1.55 % | 0.82 % | 0.49 % |
| DC screening | 1.83 % | 1.03 % | 0.22 % |
| Overloads caught, surrogate | 96 % | 99.6 % | (none occur) |
| Overloads caught, DC screening | 71 % | 99.9 % | (none occur) |
| Voltage error, surrogate | 0.0033 pu | 0.0016 pu | 0.0004 pu |

Speed, measured in Python on one CPU core with the whole N-1 set evaluated as one batch:

| | Dhaka | South Australia | London |
|---|---|---|---|
| Contingencies screened | 60 | 87 | 309 |
| Surrogate | 0.37 ms | 0.39 ms | 2.0 ms |
| FDLF | 78 ms | 73 ms | 1,564 ms |

**Findings:**
- **The one-hot network memorises line identities.** It does worse on new outages than plain linear regression.
- **Describing the outage physically is what lets the network generalise.** The DC encoding plus a learned AC correction beats both linear regression and the black box.
- **Limitations:**
  - The convergence head does not generalise to unseen outages: AUC 0.44 in Dhaka, i.e. chance level.
  - Voltage is learned less well than loading on unseen outages.
  - London's mapped grid never overloads in our sampling, so overload recall is undefined there.

---

## 6. Study C: reinforcement-learning dispatch under forecast error

### 6.1 Environment

South Australia is modelled as one node, dispatched every half hour.

| Component | Size |
|---|---|
| Wind | 2,730 MW (curtailable) |
| Solar farms | 450 MW (curtailable) |
| Rooftop solar | 2,400 MW installed (curtailable only by an emergency backstop) |
| Combined-cycle gas | 1,300 MW, ramp 250 MW per half hour |
| Open-cycle gas | 2,100 MW |
| Oil | 181 MW |
| Battery fleet | 600 MW / 750 MWh |
| Heywood interconnector | 650 MW import, 500 MW export, at the Victorian price |

At least 300 MW of synchronous generation must stay online for system strength.

Each half hour, every dispatcher sets the combined-cycle target, the battery and the interconnector from forecasts. Forecast errors grow with lead time: about 35 MW for demand and 90 MW for renewables half an hour ahead. The real values then arrive, and the same balancing rule applies to every dispatcher:
- open-cycle gas and oil cover any shortfall, and renewables are curtailed on any surplus;
- the last resorts are the rooftop backstop at $600/MWh and unserved energy at $15,000/MWh.

Days are synthetic, calibrated to published South Australian ranges.

### 6.2 Dispatchers

1. **Operator rule:** a hand-written heuristic.
2. **MPC:** a 4-hour HiGHS linear programme over the forecasts, re-solved every half hour.
3. **MPC with a learned value of stored energy:**
   - a LightGBM model predicts the shadow price (dual) of stored energy at the end of the MPC window;
   - it is trained on duals from 4,000 perfect-foresight solutions;
   - the prediction replaces the fixed terminal value.
4. **PPO from scratch:** 400 rounds of 256 simulated days.
5. **PPO warm-started:**
   - behaviour cloning of perfect-foresight decisions, using inputs available at the time only;
   - then 1,400 rounds of PPO fine-tuning, with a critic warm-up and small exploration noise;
   - checkpoints chosen on 100 separate validation days.
6. **Perfect foresight:** one whole-day linear programme with the actual values. This is the lower bound on cost.

### 6.3 Results

100 held-out test days; intervals from a paired bootstrap against MPC.

| Dispatcher | Cost per day | Above the floor | vs MPC, $k per day [95 % CI] | Days better than MPC | Decision time |
|---|---|---|---|---|---|
| Operator rule | $1.511 M | +75.9 % | | 0 | 0.1 ms |
| PPO from scratch | $1.113 M | +29.6 % | | 0 | 0.16 ms |
| PPO warm-started | $0.982 M | +14.3 % | −1.1 [−6.9, +4.9] | 46 | 0.15 ms |
| MPC | $0.981 M | +14.2 % | — | — | 3.4 ms |
| **MPC + learned storage value** | **$0.977 M** | **+13.8 %** | **+3.8 [+2.8, +4.7]** | **80** | 6.8 ms |
| Perfect foresight | $0.859 M | floor | | | |

**Findings:**
- **Imitating hindsight is what makes RL competitive here.** From scratch, PPO stalls at nearly 30 % above the floor; warm-started, it ties MPC while deciding 23 times faster.
- **Machine learning inside the optimiser gives the only significant improvement over MPC.** The learned storage value saves $3.8 k a day.
- **A residual agent on top of MPC never beat its starting point** in 130 training rounds. We report this as a negative result.
- **Most of the remaining gap is forecast error.** Perfect foresight dispatches 3 MWh a day of open-cycle gas; the forecast-driven dispatchers need 700–860 MWh. Better forecasts would be worth more than a better dispatcher.

---

## 7. Study D: cascade prediction with a graph neural network

### 7.1 Data

9,929 cascades on the 17 grids, from 400 to 1,280 per grid. Each sample:
- **sets conditions:** a load level (75–120 %), the effectiveness of load shedding, and the share of generation that responds to frequency;
- **takes a snapshot** of the grid as a graph;
- **applies a contingency:** one to four line trips (biased toward loaded lines), sometimes the largest plant, sometimes the external tie;
- **runs the simulator for 90 s.**

Labels:
- the share of load lost, which exceeds 10 % (a major event) in 44.9 % of samples;
- for every bus, whether it lost supply.

### 7.2 Model and baselines

- **GNN:** six message-passing layers with edge features, hidden size 96.
  - Node inputs: voltage class, load, generation, headroom, voltage, angle, degree, external tie, tripped plant, and 1/(1 + hops to the fault).
  - Edge inputs: reactance, rating, loading, voltage class, circuits, and a tripped flag.
  - A graph head reads mean and max pooling plus 15 screening features.
  - A bus head reads each bus's embedding together with the pooled event summary.
  - Training: binary cross-entropy at both levels, 15 epochs.
- **Graph-level baseline:** LightGBM on the 15 screening features.
- **Bus-level baselines:** hops from the fault, and LightGBM on per-bus features plus hops and the screening features.
- **Hybrid:** the average of GNN and bus-level LightGBM probabilities.

**Protocol:**
- a random 80/20 split;
- **leave-grids-out:** six groups, every grid held out once. Dhaka and its metro sub-grid share buses, so they are held out together.
- 3 seeds for the GNN.

### 7.3 Results

**Unseen grids** (predictions pooled over all six folds):

| Model | MAE of load lost | Major-event AUC | Spearman | Bus AUC |
|---|---|---|---|---|
| Average loss (no model) | 39.8 % | 0.38 | −0.21 | — |
| Hops from the fault | — | — | — | 0.670 |
| LightGBM, screening features | 31.6 % | 0.735 | 0.46 | — |
| LightGBM, bus by bus | — | — | — | **0.860** |
| **GNN** | **23.7 % ± 1.7** | **0.821** | **0.60** | 0.831 |
| GNN + bus trees, averaged | — | — | — | 0.851 |

**Same grids, new cases:**
- GNN: 7.8 % MAE, major-event AUC 0.970, bus AUC 0.984.
- LightGBM: 11.9 % MAE, major-event AUC 0.953; bus by bus, AUC 0.966.

**Per fold (unseen):**

| Held-out grids | GNN MAE | Trees MAE | GNN bus AUC | Bus-trees AUC |
|---|---|---|---|---|
| London, Delhi, São Paulo | 19.4 % | 19.4 % | 0.83 | 0.96 |
| Moscow, Karachi, Adelaide | 18.7 % | 21.4 % | 0.92 | 0.91 |
| New York, Istanbul, Colombo | 22.9 % | **52.4 %** | 0.84 | 0.84 |
| Houston, Madrid | 22.6 % | 21.6 % | 0.84 | 0.87 |
| Rome, Tashkent, Caracas | 31.4 % | 34.8 % | 0.77 | 0.77 |
| Dhaka, Dhaka metro, Sapporo | 31.4 % | 40.8 % | 0.67 | 0.76 |

**Ablations** (first fold only, one seed; ✓ marks the setting kept):

| Change | Bus AUC |
|---|---|
| Base | 0.800 |
| Dropout 0.2 | 0.817 |
| Weight decay ×100 | 0.800 |
| 15 epochs ✓ | 0.835 |
| 3 layers | 0.746 |
| All regularisers combined | 0.795 |

Making the features grid-independent (loads relative to the grid's average, angle differences instead of absolute angles) gave 0.829. On the random split, two design changes raised bus AUC from 0.942 to 0.987:
- adding the hop feature and an equal node-loss weight;
- letting the bus head read the pooled summary.

**Findings:**
- **On unseen grids the GNN is the more robust predictor of event size and severity.** In one fold, the boosted trees' estimate collapses to 52 % error while the GNN's stays at 23 %.
- **Bus-level transfer remains the per-bus trees' edge,** and regularisation narrowed the gap only slightly.
- **Every method degrades substantially out of distribution.**

---

## 8. Threats to validity and reproducibility

**Threats to validity:**
- **Labels come from a simulator, not real events.** Studies B–D measure how well models learn the simulator's physics. The simulator's protection is simplified: no relay coordination studies, and no operator action inside 90 s.
- **The grids are map-derived.** Their parameters are estimated, and mapping completeness varies between regions.
- **The dispatch days are synthetic.**
- **Only Study A uses real operational data throughout.**

**Reproducibility:** the repository contains every script.

| Study | Script | Generated data | Exported results |
|---|---|---|---|
| A | `ml/fetch_neso.py`, `ml/fetch_weather.py`, `ml/forecast.py`, `ml/calibrate.py`, `ml/export.py` | — | `public/data/forecast/` |
| B | `ml/surrogate.py` | `src/ai/surrogate-data.test.ts` | `public/data/surrogate/` |
| C | `ml/dispatch.py`, `ml/dispatch_finetune.py`, `ml/dispatch_eval.py` | — | `public/data/dispatch/sa.json` |
| D | `ml/gnn.py`, `ml/gnn_gen.py` | `src/ai/cascade-data.test.ts` | `public/data/cascade/gnn.json` |

Each trained model runs in the browser, and a test checks it against the Python original.

**Hardware:** one laptop with an 8-core CPU and an RTX 5060 GPU (8 GB). The slowest single training run was the cascade study, at 25 minutes for 3 seeds over seven splits.

## 9. Conclusion

Four operational tasks, four held-out tests. In every case the in-distribution score overstated what the model would do on something new, and by different amounts for different methods. The methods that held up best encoded the physics rather than the identity of the thing they had seen:
- DC distribution factors instead of line identities;
- imitation of hindsight-optimal decisions;
- a learned value of stored energy inside an optimiser;
- message passing over the network's own structure.

**Future work:**
- real disturbance records for validation;
- multi-outage power-flow surrogates;
- topology-robust bus-level cascade prediction;
- real-data dispatch on recorded South Australian days.

---

## References

[1] B. Stott and O. Alsac, "Fast decoupled load flow," *IEEE Trans. Power Apparatus and Systems*, vol. PAS-93, no. 3, pp. 859–869, 1974.
[2] A. J. Wood, B. F. Wollenberg and G. B. Sheblé, *Power Generation, Operation, and Control*, 3rd ed. Wiley, 2013.
[3] G. Ke et al., "LightGBM: A highly efficient gradient boosting decision tree," in *Advances in Neural Information Processing Systems 30*, 2017.
[4] Y. Romano, E. Patterson and E. Candès, "Conformalized quantile regression," in *Advances in Neural Information Processing Systems 32*, 2019.
[5] J. Schulman, F. Wolski, P. Dhariwal, A. Radford and O. Klimov, "Proximal policy optimization algorithms," arXiv:1707.06347, 2017.
[6] J. Gilmer, S. S. Schoenholz, P. F. Riley, O. Vinyals and G. E. Dahl, "Neural message passing for quantum chemistry," in *Proc. ICML*, 2017.
[7] Q. Huangfu and J. A. J. Hall, "Parallelizing the dual revised simplex method," *Mathematical Programming Computation*, vol. 10, pp. 119–142, 2018.
[8] H. Hersbach et al., "The ERA5 global reanalysis," *Quarterly Journal of the Royal Meteorological Society*, vol. 146, pp. 1999–2049, 2020.
[9] OpenStreetMap contributors, OpenStreetMap, https://www.openstreetmap.org, data under the Open Database Licence.

*[References for the related-work section to be added after the literature review.]*
