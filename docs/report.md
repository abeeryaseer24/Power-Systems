# Blackstart: a power-system simulator built on real grids and historical blackouts

Technical report

Talha Yaseer Abeer, Department of Electrical and Electronic Engineering
November 2026

Live site: https://power-systems-dusky.vercel.app
Source: https://github.com/abeeryaseer24/Power-Systems

## Abstract

Blackstart is a browser-based power-system simulator. It contains a fictional city grid for operator training, reduced models of 17 real transmission systems built from OpenStreetMap, reconstructions of 24 historical blackouts, a point-kinetics reactor model used for seven nuclear plants, and a set of single-topic tools on protection, electricity markets and inter-area oscillations. The real-grid models solve an AC power flow with reactive limits and switched shunts, and run a per-island frequency model with governor droop, secondary control, under-frequency load shedding and several protection functions. A small neural network trained on simulated disturbances estimates the risk of collapse, and two pages read live data from the British and American grids.

The models are reduced-order and teaching grade. Line parameters are estimated from voltage class and route length, generator dynamics are lumped, and the blackout replays combine physical simulation with steps scripted from the investigation reports. None of the replays has been validated against recorded frequency or flow data. Section 12 sets out these limitations in detail.

## 1. Aims

The project began with a practical question: can the material of an undergraduate power-systems course be made to run, on real networks, in a form where the consequences of each decision are visible?

The specific aims were:

1. Model frequency and voltage behaviour well enough that the textbook mechanisms (inertia, droop, load shedding, voltage collapse, protection operation, islanding) emerge from the simulation rather than being animated.
2. Build those models on real network topology, with honest documentation of every assumption needed to make a reduced model solve.
3. Reconstruct historical blackouts from their public investigation reports, and let the user try to prevent them.
4. Explain each mechanism in plain language alongside the simulation.

## 2. What was built

| Part | Pages | Purpose |
|---|---|---|
| Halvern | /shifts, /control, /debrief | Fictional coastal city, seven operator shifts with weather, faults and a black start |
| Real-grid atlas | /atlas, /atlas/:id | 17 reduced transmission models from OpenStreetMap, explorable live |
| Blackout replays | /blackouts, /blackouts/:id | 24 historical events, watch mode and take-control mode with an advisory co-pilot |
| Case files | /academy | Why each blackout happened: sequence, mechanisms, causes, aftermath |
| Documentaries | /documentary | 30 narrated episodes: 24 blackouts and 6 nuclear or electrical plant events |
| Sandboxes | /what-if, /black-start, /dhaka-tonight | Stacked disasters, restoration from darkness, a load-shedding planner for Dhaka |
| Nuclear | /nuclear, /reactor-startup, /nuclear/instrumentation | Point-kinetics reactor model, seven plants, a start-up exercise |
| Engineering | /protection, /market, /oscillations | Distance protection, merit-order pricing, two-area oscillations |
| Data | /live, /live/us, /predictor | Live British and American grid data, the blackout predictor |
| Learning | /course, /career | Fifteen-chapter introductory course, progression across the site |

The software is written in TypeScript with React, three.js for the map scenes and Vitest for tests. Everything runs in the browser except one serverless function that holds the API key for American data.

## 3. The Halvern model

Halvern is a fictional city used for training before the real grids. It has a 275 kV ring, nine power stations and seven load districts, with weather-driven demand, wind and rooftop solar generated from a seeded random process so that each shift is repeatable.

The network uses a DC load flow on each electrical island. Each island has its own frequency, obtained from the aggregate swing equation

```
dΔf/dt = f₀ (P_gen − P_load) / (2 Σ H_i S_i)
```

where H_i and S_i are the inertia constant and rating of each synchronous machine. Governors respond with droop and a first-order lag, and an automatic generation control loop returns frequency to 50 Hz, with ramp-rate weighting and anti-windup when units saturate.

Protection includes thermal line trips, five stages of under-frequency load shedding at 48.8, 48.6, 48.4, 48.2 and 48.0 Hz (9 % of demand each), loss-of-mains tripping of rooftop solar at a rate of change of frequency above 0.5 Hz/s, and island collapse below 47.5 Hz. A shift ends with a graded debrief on demand served, frequency quality, cost and emissions.

## 4. Real grids from OpenStreetMap

### 4.1 Extraction

A build script queries the Overpass API for each study region: transmission lines and cables at or above a minimum voltage, substations, power plants and populated places, plus roads, coastline and rivers for the map. National studies clip to the country border; city studies use a bounding box, with exclusion boxes where a neighbouring synchronous system intrudes (France beside London, for example). HVDC lines, tagged with frequency 0, are excluded from the AC model.

Line endpoints are snapped to substations, parallel circuits are merged with their circuit count, and the result is reduced to a bus-branch model. Lines that leave the study area mark boundary buses, which connect to an external equivalent.

### 4.2 Line parameters

OpenStreetMap carries topology but not electrical data, so parameters come from typical values per voltage class (per circuit, per kilometre):

| Voltage | x (Ω/km) | r (Ω/km) | b (µS/km) | Rating (MVA) |
|---|---|---|---|---|
| ≥ 700 kV | 0.27 | 0.012 | 4.2 | 3000 |
| 480 to 700 kV | 0.28 | 0.018 | 4.0 | 2000 |
| 370 to 480 kV | 0.30 | 0.025 | 3.8 | 1500 |
| 320 to 370 kV | 0.32 | 0.030 | 3.6 | 1000 |
| 270 to 320 kV | 0.33 | 0.035 | 3.5 | 750 |
| 200 to 270 kV | 0.40 | 0.060 | 2.9 | 400 |
| 125 to 200 kV | 0.40 | 0.10 | 2.8 | 150 to 300 |
| below 125 kV | 0.40 | 0.12 | 2.7 | 110 |

Values are converted to per unit on a 100 MVA base. A reactance floor of 6 × 10⁻⁴ pu prevents ill-conditioning from very short connections.

### 4.3 Demand and generation

Regional demand at the time of the signature event is taken from public reports and spread to buses by settlement population, each settlement drawing from its three nearest substations with inverse-square weights. Bus demand is then capped at 45 % of the MVA of the lines connected to it, with the excess pushed to neighbours; without the cap, dense cities placed several gigawatts on single buses. Plants are attached to the nearest bus, using their tagged capacity or a default by fuel.

### 4.4 The rest of the interconnection

Each region connects to the rest of its synchronous system through an external equivalent: an AC source with its own inertia and governor response behind the boundary buses, or an HVDC infeed for regions joined by DC (Bangladesh at Bheramara, South Australia at Heywood, Hokkaido). Isolated systems (Venezuela, Sri Lanka) get a nominal 1 MW link so that the code path is the same.

### 4.5 Region-specific corrections

A reduced model built from mapped data does not always solve. Each region below needed a documented correction, and each correction has a physical reason:

| Region | Problem found | Correction |
|---|---|---|
| London | Cross-Channel HVDC treated as AC, Gravelines joined to Kent | Exclude HVDC ways and the French side |
| Houston | Only 345 kV modelled; 138 kV network carries much local transfer | Ratings scaled by 2 |
| Moscow | 20 lines over rating in the base case; 110 kV city network not modelled | Ratings scaled by 1.8 |
| Hokkaido | Tomari committed though shut since 2012 | Marked offline |
| Venezuela | 225 km 765 kV line with 16.6 pu of charging; no first load-flow solution | Fixed line reactors at 70 % of charging on lines above 3 pu; 50 % series compensation on long 765 kV lines; western thermal plants must run |
| Brazil | All of Itaipu pushed over AC; the 50 Hz half really reaches São Paulo by HVDC | Only half of Itaipu on the AC model; 40 % series compensation; late-evening demand of 16.5 GW |
| Sri Lanka | The 220 kV Norochcholai–Veyangoda double circuit is not mapped; the Northern Province received 22 % of national demand | Line added by declaration; northern demand scaled by 0.3 |
| Türkiye | Akkuyu committed though unbuilt in 2015; merit order put the whole fleet in the east | Akkuyu offline; south-eastern dams limited to 50 to 60 % |
| Central Asia | Rogun committed at full size | Marked offline (only two small units ran in early 2022) |

## 5. Steady state: AC power flow

Each live island is solved with a fast decoupled load flow (XB scheme) every 0.25 s of simulated time, with a tolerance of 6 × 10⁻⁴ pu. Synchronous generators are PV buses with reactive limits of +0.55 and −0.30 times their rating; a bus that violates a limit becomes PQ at that limit. Loads draw reactive power at 0.33 times their real power and are partly compensated by fixed shunts.

Voltage control works through switched shunts at each bus: reactors switch in above 1.05 pu, down to 90 % of the local line charging, and capacitors switch in below 0.96 pu, up to 35 % of local load. A Newton–Raphson solver is kept as a reference and is cross-checked against the decoupled solver in the tests.

Two numerical fallbacks proved necessary. A warm start can diverge after a large topology change, so a failed solve is retried from a flat start before it counts as a collapse. And on the Türkiye model the decoupled solver found no starting point even though Newton–Raphson converged at a minimum of 0.99 pu: the Newton solution showed 27 machines needing 3.3 GVAr more absorption than their limits allowed, all from 400 kV line charging. When the first solve fails, the operating point now comes from Newton–Raphson with the full complement of line reactors in service. This applies only to the start-up solve, so collapses during an event are still detected by the decoupled solver.

When the load flow has no solution during a run, the model treats the weakest fifth of the island (ranked by the voltages of the failed solve) as past the nose of its PV curve: under-voltage relays shed 30 % of demand there and inverter-based plant cuts 35 % of its output. If the condition persists for 14 consecutive solves, the island collapses.

## 6. Dynamics and protection

Frequency follows the swing equation per island, as in Halvern, with the external equivalent adding its inertia when connected by AC. Governors respond with droop and a lag; only a share of the fleet (35 % by default) runs frequency-sensitive with headroom, which is the main lever used to reproduce reports of poor primary response. Inverter plant backs off at high frequency (limited frequency-sensitive mode). The voltage factor on load is bounded between 0.3 and 1.

Protection functions:

- Thermal: line heating accumulates above 100 % loading and trips the line when the conductor would have sagged.
- Distance: a line above 230 % of rating trips immediately.
- Out-of-step: a line whose voltage-angle difference exceeds 1.45 rad (about 83°) trips.
- Generator trips on sustained over- or under-voltage.
- Five-stage under-frequency load shedding, with an efficacy factor for each event that represents relays failing to operate.
- Under-voltage load shedding and voltage collapse as in Section 5.

A grid-forming battery type was added late in the project. It is treated as a voltage source with synthetic inertia (H = 6 s), a 1 % droop and a 0.15 s response, with its full rating available for response and the ability to absorb as well as inject. With batteries worth 8 % of demand at the four largest load buses, losing the largest plant gave these results:

| Region | Frequency nadir without / with | Load shed without / with |
|---|---|---|
| South Australia | 48.58 / 48.79 Hz | 305 / 152 MW |
| Hokkaido | 48.30 / 48.57 Hz | 747 / 498 MW |
| Karachi | 47.97 / 48.11 Hz | 920 / 736 MW |

## 7. Historical blackout replays

### 7.1 Method

Each event is written from its investigation report as a list of steps of three kinds:

- Trigger: the initiating event (a line flashover, a generator trip, a lost interconnector). Triggers always happen.
- Consequence: protection or plant behaviour that the report describes, such as out-of-step separation or generators tripping on under-frequency. Most consequences carry a physical condition, for example "frequency below 49 Hz" or "a line above 115 % of rating"; a few have none and always run.
- Operator: actions taken by the control room at the time.

In watch mode every step runs, so the replay follows history. In take-control mode, operator steps are left to the user and a consequence only happens if its physical condition is present in the simulation at that moment. If the user has, for example, shed load early enough that frequency never reaches the threshold, the consequence is averted and logged as such.

Event setup can also change the starting conditions the report describes: reduced primary response, lines out for maintenance, extra demand in a heatwave, or poor load-shedding efficacy.

### 7.2 Results in watch mode

| Event | Region model | Simulated demand lost | Historical impact |
|---|---|---|---|
| Bangladesh, 4 Oct 2022 | Bangladesh | 100 % | About 140 million people |
| Bangladesh, 1 Nov 2014 | Bangladesh | 100 % | About 150 million |
| Great Britain, 9 Aug 2019 | South and east England | 285 MW peak, 2 % | About 1.1 million customers |
| Northeast US, 14 Aug 2003 | New York | 100 % | 50 million |
| New York City, 13 Jul 1977 | New York | 72 % | About 9 million |
| Texas, 15 Feb 2021 | Houston | 28 % | About 4.5 million homes |
| Iberia, 28 Apr 2025 | Madrid | 100 % | About 55 to 60 million |
| Northern India, 31 Jul 2012 | Delhi | 100 % | About 620 million |
| Italy, 28 Sep 2003 | Lazio | 100 % | About 56 million |
| South Australia, 28 Sep 2016 | South Australia | 100 % | About 850,000 customers |
| Hokkaido, 6 Sep 2018 | Hokkaido | 16 % | About 2.95 million households |
| Pakistan, 23 Jan 2023 | Karachi | 100 % | About 220 million |
| South London, 28 Aug 2003 | South and east England | 1,800 MW peak, restored | About 410,000 customers (724 MW) |
| Northeast, 9 Nov 1965 | New York | 100 % | About 30 million |
| Europe splits in three, 4 Nov 2006 | Madrid | 384 MW peak | About 15 million households |
| Europe splits in two, 8 Jan 2021 | Lazio | none | About 1.7 GW of interruptible load |
| Pakistan, 9 Jan 2021 | Karachi | 100 % | About 200 million |
| Texas, 2 Feb 2011 | Houston | 8 % | About 3.2 million customers |
| Venezuela, 7 Mar 2019 | Venezuela | 100 % | About 30 million |
| Brazil (Itaipu), 10 Nov 2009 | São Paulo and Paraná | 100 % | About 60 million, and all of Paraguay |
| Türkiye, 31 Mar 2015 | Türkiye | 100 % | About 70 million |
| Sri Lanka, 17 Aug 2020 | Sri Lanka | 100 % | About 21 million |
| Moscow, 25 May 2005 | Moscow | 3,473 MW (25 %) | About 2 million (roughly 3,500 MW lost) |
| Central Asia, 25 Jan 2022 | Central Asia | 100 % | About 25 million |

The percentages refer to the study region, not to the whole interconnection, so a 100 % loss in the São Paulo model is consistent with about 40 % of Brazil's load being lost. The Hokkaido and Texas replays lose less than history because their cascades unfolded over hours and the replays cover minutes.

In the Türkiye replay the script only specifies a cut across a longitude band in central Anatolia; which lines open, and in what order, comes from the simulated flows. The Moscow replay sheds 3,473 MW against a reported figure of roughly 3,500 MW, but the size of that loss is set in part by a scripted step, so the agreement says little on its own.

### 7.3 Limits of the replays

Where a consequence step has no condition, or its condition is always met in watch mode, the replay shows the reported sequence rather than predicting it. Many collapses are therefore partly scripted. The simulation decides how far the effects spread, how much load shedding operates and whether islands survive, but the major steps come from the report. Section 12 returns to this.

## 8. Nuclear plants

The reactor model uses point kinetics with six delayed-neutron groups and a prompt-jump approximation away from prompt criticality, with explicit integration at 0.2 ms near it. Reactivity includes control rods, Doppler (fuel temperature), moderator temperature and void feedback, xenon and iodine dynamics normalised to rated power, and, for the RBMK, a positive void coefficient and the graphite displacer tips on the control rods. Decay heat follows four exponential groups. Thermal-hydraulics are lumped into a fuel node and a coolant node with a saturation limit, pressure relief, feedwater, emergency injection, passive cooling and fire-engine injection. Above about 1200 °C, zirconium–steam reaction produces hydrogen and core damage accumulates.

Seven plants are modelled: Rooppur (VVER-1200, connected to a model of the Bangladesh grid), Chernobyl unit 4, Three Mile Island unit 2, Fukushima Daiichi unit 1, Forsmark unit 1, Fukushima Daini and Zaporizhzhia. For Chernobyl, the coolant pumps fed by the coasting turbine-generator are modelled as dropping out one at a time, three of them at 16, 24 and 32 s after the start of the scenario. When four pumps were stopped together at the start of the test, as first implemented, the void feedback ran away about 19 s into the test, before the AZ-5 button was pressed. With the staggered rundown, power rises from about 6 % to 9 % and the excursion follows the 01:23:40 scram by about one second. The record suggests about four seconds, so the model is still fast.

For the electrical events (Forsmark 2006, Fukushima Daini 2011 and Zaporizhzhia 2023), the point of the model is the station's dependence on off-site and emergency AC power, which the documentaries show alongside a live view of the core.

## 9. Engineering pages

Protection. A two-line 400 kV system (100 km and 80 km, 0.03 + j0.32 Ω/km) with four distance relays and mho characteristics reaching 80 % of the line, 120 % of the line, and the line plus 120 % of the next. Operating times are 20 ms for the relay and 50 ms for the breaker, with 300 ms and 1 s delays for zones 2 and 3. The user places a fault and sets its resistance, can make a breaker fail (with or without breaker-failure protection opening the adjacent breakers after 150 ms), can watch load impedance move into zone 3 as voltage falls and reactive flow rises, and can run a two-source power swing with or without blocking. The apparent impedance ignores infeed from the far end, so resistive faults look closer than they would to a real relay.

Markets. A stylised 25 GW fleet with marginal costs from fuel price, heat rate and carbon price, cleared hour by hour against a winter demand shape with solar and wind availability, and a price cap when demand cannot be met. A two-zone version shows prices separating and congestion rent appearing when a north–south tie is full. It ignores start-up costs, ramp limits, reserves and bidding behaviour.

Oscillations. Four classical machines in two areas (inertia constants 6.5, 6.5, 6.2 and 6.2 s) with strong coupling inside each area and 0.75 pu per tie line between them, integrated by fourth-order Runge–Kutta at 5 ms. Fast high-gain voltage regulators are represented as negative damping in proportion to transfer, and power system stabilisers as added damping. The mode frequency and damping ratio are measured from successive peaks of the difference between the two areas' mean speeds. With 600 MW flowing and one of two ties tripped, a 0.5 Hz oscillation grows and the areas lose synchronism after 13.6 s; with stabilisers the mode is damped at 16 %. The regulator and stabiliser effects are represented as damping terms, not modelled as control loops.

## 10. Blackout predictor

### 10.1 Data and model

Training data comes from the project's own simulator. Each of 400 runs takes one of the original ten regions, randomises load-shedding efficacy and primary response, and applies one to three disturbances: large plant trips, trips of the busiest lines, separation from the wider grid, demand surges or a deficit in the neighbouring system. Snapshots every two seconds give 19,276 samples, each labelled by whether demand served falls below half within the next 60 seconds. Samples before the first disturbance are labelled safe, since no model could predict them.

Twelve features describe each snapshot: frequency deviation, rate of change of frequency, lowest frequency in the last five seconds, lowest voltage, demand served, number of live islands, spinning headroom, inertia per megawatt of demand, heaviest line loading, share of lines overloaded, import share and any uncovered loss in the wider grid. The model is a multilayer perceptron (12–16–8–1, ReLU hidden layers, sigmoid output) trained with Adam and class weighting. One run in five is held out.

### 10.2 Results

On held-out runs the model scores an AUC of 0.80, accuracy of 0.90, precision of 0.34 and recall of 0.54. In plain terms, it ranks dangerous moments above safe ones reasonably well, but two-thirds of its warnings are false alarms and it misses nearly half of the collapses within the 60-second horizon. On the historical replays it warns ahead of some collapses and not others; several collapses happen between two snapshots.

### 10.3 Explanations and co-pilot

For any moment, each feature is reset to its training mean in turn and the drop in predicted risk is reported as that feature's contribution. This occlusion method is simple and ignores interactions between features, but for a model of this size it gives readable answers. In the Bangladesh 2022 replay, the first warning at 22 s is attributed mostly to the rate of change of frequency (−0.15 Hz/s, 50 percentage points of the risk).

In take-control mode, a co-pilot shows the predicted risk and its main driver, and recommends one action from fixed operating rules: shed 5 % when frequency is more than 1.2 % low or falling fast, relieve voltage below 0.9 pu or a line above 110 %, back down the largest unit when frequency is 1 % high, ask for import or start reserve when frequency sags, keep 5 % spinning reserve, and restore shed demand in 10 % steps once stable. The advice is rule-based; the neural network only supplies the risk estimate.

## 11. Live data

The Great Britain page reads system frequency (15 s resolution), generation by fuel and transmission demand from the Elexon Insights API, and carbon intensity from the National Energy System Operator's API. All four endpoints are open and accept requests from browsers, so no server is involved.

The United States page reads hourly data from the EIA Hourly Electric Grid Monitor (form EIA-930) for eight balancing authorities: demand, day-ahead forecast, net generation, interchange and generation by fuel. Because the EIA requires a key, requests go through a serverless function that adds the key from the hosting environment, accepts only a fixed list of balancing authorities, returns only the fields the page needs and caches responses for ten minutes. The key never reaches the browser.

## 12. Limitations

A reader with power-system experience will find each of these points quickly, so they are stated here in full.

1. Parameters are typical, not actual. Line impedances and ratings come from voltage class and length. Real conductor types, bundling, transformer impedances and protection settings are unknown. Generator capacities come from mapped tags or fuel defaults.

2. The networks are incomplete. Only lines at or above each region's minimum voltage are modelled, and mapping coverage varies by country. Several regions needed rating scales, plant availability limits or added lines to solve at all (Section 4.5). These corrections are physically motivated but they are calibration, chosen until the model behaved plausibly.

3. Dynamics are aggregated. There are no individual machine angles in the real-grid models, no exciter or AVR models, no detailed governor or turbine models, and no electromagnetic transients. Frequency is uniform within each island. Voltage collapse is detected from load-flow divergence rather than simulated through time.

4. Replays are partly scripted. Triggers are scripted, and in watch mode the consequences described in the reports happen whenever their conditions are met, and some conditions are loose. The simulation determines spread, load-shedding outcome and island survival, but it is not an independent prediction of each cascade.

5. Nothing has been validated against measurements. No replay has been compared with a recorded frequency trace, line flow or disturbance record. Agreement with history in Section 7 is qualitative, apart from a few totals.

6. The predictor learns only from this simulator. It inherits every simplification above, and its precision of 0.34 would not support operational use. Its explanations come from a one-at-a-time sensitivity test.

7. The engineering pages are deliberately simplified (single-phase, no infeed, no market strategy, damping terms instead of control loops), as each page states.

## 13. Assessment

Taken together, the project covers most of an undergraduate power-systems syllabus and applies it to real networks, which is uncommon. Its strongest parts are the interaction of AC power flow, frequency response and protection on real topology, and the engineering record of making reduced models solve: each correction in Section 4.5 came from diagnosing a failure (excess charging on 765 kV lines, a missing double circuit, an HVDC half of a plant counted as AC, merit order overloading a corridor) rather than adjusting parameters at random.

Its weakest parts are fidelity and validation. It is a teaching and exploration tool, and a reduced-order reconstruction of each grid, not a planning or study-grade model. It should not be described as a replica of any real system, and its blackout replays should be described as reconstructions that combine report-driven steps with simulated physics.

## 14. Future work

1. Validate one event quantitatively: compare the Great Britain 9 August 2019 replay with the frequency trace in the official report (nadir 48.8 Hz) and adjust inertia and response until the shape matches.
2. Mark each consequence step in the interface as simulated or scripted, so users can see which parts of a replay the model decided.
3. Replace typical line constants with published network data where operators release it (several European operators publish static grid models).
4. Add individual machine angles to the real-grid models so that transient stability and inter-area modes emerge from the networks rather than from a separate page.
5. Retrain the predictor on all 17 regions with more runs, report precision–recall curves, and compare it against simple threshold rules on frequency and rate of change of frequency.

## 15. Testing and verification

The test suite has 81 tests. They check the AC power flow against a closed-form two-bus solution, confirm that it fails to converge beyond the nose of the PV curve, compare the decoupled solver with Newton–Raphson on the Halvern ring with losses, charging and PV buses, and confirm that a generator held at its reactive limit lets its voltage sag. Other tests cover the DC flow and island detection, the weather and demand profiles, the Halvern shifts, black start from a hydro unit, the Rooppur grid connection, each What-if modifier, the real-grid simulator, the reactor model (steady state at rated power, decay heat after a scram, the period after a reactivity step, and every plant scenario running to completion) and the reactor start-up exercise. Every historical replay must produce a loss of supply in watch mode. Tests run on every push through continuous integration, and the site deploys automatically from the main branch.

These are consistency and regression tests. They show that the code does what the model says; they do not show that the model matches the real systems (Section 12, point 5).

## 16. Data and sources

Network, settlement and map data: © OpenStreetMap contributors, Open Database Licence. World outline: Natural Earth. Live data: Elexon Insights Solution, National Energy System Operator Carbon Intensity API, and U.S. Energy Information Administration (EIA-930, public domain).

Each blackout and plant event lists its sources on its case-file or plant page. The investigation reports used for the replays are:

- AEMO, Black System South Australia 28 September 2016, final report, March 2017.
- ENTSO-E, Report on Blackout in Turkey on 31st March 2015, September 2015.
- ENTSO-E, Continental Europe Synchronous Area Separation on 08 January 2021, final report, July 2021.
- ENTSO-E Expert Panel, 28 April 2025 Iberian Blackout, factual report, 2025; Government of Spain, committee report on the 28 April 2025 incident, June 2025.
- Enquiry Committee on Grid Disturbance in Northern Region on 30 July 2012 and in Northern, Eastern and North-Eastern Region on 31 July 2012, Ministry of Power (India), August 2012.
- Federal Power Commission, Report to the President on the Northeast Power Failure, December 1965.
- FERC and NERC, Report on Outages and Curtailments During the Southwest Cold Weather Event of February 1–5, 2011, August 2011.
- FERC and NERC staff, The February 2021 Cold Weather Outages in Texas and the South Central United States, November 2021.
- National Grid ESO, Technical Report on the events of 9 August 2019, September 2019; Ofgem, 9 August 2019 power outage report, January 2020.
- Ofgem, Report on the investigation of the power failure in South London on 28 August 2003; National Grid Transco, investigation report on the same incident, 2003.
- OCCTO, Third-Party Verification Committee report on the Hokkaido blackout, December 2018.
- Operador Nacional do Sistema Elétrico (ONS), Relatório de Análise de Perturbação, 10 November 2009 event.
- Public Utilities Commission of Sri Lanka, report on the island-wide power failure of 17 August 2020.
- UCTE, Final Report of the Investigation Committee on the 28 September 2003 Blackout in Italy, April 2004.
- UCTE, Final Report: System Disturbance on 4 November 2006, January 2007.
- U.S.–Canada Power System Outage Task Force, Final Report on the August 14, 2003 Blackout, April 2004.
- U.S. Department of Energy, The Con Edison Power Failure of July 13 and 14, 1977, staff report, June 1978.

For the Bangladesh, Pakistan, Venezuela, Moscow and Central Asia events, no full public investigation report was available. Those replays rest on official statements and probe-committee findings as reported in the press (The Daily Star, Dhaka Tribune, bdnews24.com, Dawn, Kommersant, RIA Novosti, Reuters and others), and are correspondingly less certain. Each case file names its sources.

The nuclear plant pages cite their own sources, chiefly IAEA reports (including INSAG-7 on Chernobyl), the Kemeny Commission report on Three Mile Island, Swedish Nuclear Power Inspectorate reports on Forsmark, TEPCO's Fukushima accident investigation report, and IAEA statements on Zaporizhzhia.

## Appendix A. Software architecture and performance

The application is a single-page React app built with Vite. Each page is loaded on demand, so the landing page does not download the simulators. The code is split by responsibility:

| Folder | Contents |
|---|---|
| src/grid | Halvern engine and network, real-grid simulator (region.ts), AC power flow (acflow.ts), replays, case files, documentary scripts, What-if modifiers |
| src/nuclear | Reactor model, plant definitions and scenarios, control-room components |
| src/ai | Feature extraction, inference and explanation for the predictor, and the training script |
| src/scene | three.js scenes: the Halvern city and the night-light map used for real grids |
| src/pages, src/components | One page per task, plus shared panels (frequency dial, traces, anatomy diagram, core view, co-pilot, weather) |
| scripts/osm | Region definitions and the OpenStreetMap build pipeline |
| api | The serverless proxy for EIA data |
| public/data | Built region files, the trained predictor and the world outline |

The real-grid simulator runs in the main thread inside the map's animation loop. Each frame spends at most about 8 ms on simulation, so the map stays smooth; when the requested speed cannot be reached in that budget, the page reports the speed actually achieved. The largest model (Moscow, 476 buses) completes its 3-minute replay test in about 4.5 s of computation. The decoupled load flow factorises its two matrices only when the set of PV and PQ buses changes, which keeps repeated solves cheap.

The night-light map draws each bus as a light whose brightness follows the demand it is serving, using a data texture updated from the simulator, so a collapsing island visibly goes dark. Traffic and ships are decorative.

## Appendix B. Learning and presentation layer

The simulators are wrapped in material meant to teach rather than only to show:

- Power Systems 101: fifteen chapters from electricity basics to markets and grid operation, each ending in a short quiz, with ten interactive widgets spread through them.
- Case files: for each blackout, a one-sentence verdict, the system state before the event, a timed sequence, the physical mechanisms with links to the relevant course chapter, causes sorted by kind (trigger, protection, people, planning, design, weather), key numbers and aftermath.
- Documentaries: each episode plays one beat at a time over the live simulation (timestamp, title, narration sentence by sentence, and a schematic of what failed), with a held silence before each impact. Nuclear episodes use a cross-section of the reactor driven by the reactor model instead of the map.
- Career: six ranks earned by finishing chapters, shifts, replays, restorations and episodes across the site, stored in the browser.
- Trailer generator: a different cut each time of two blackouts and one reactor sequence, recorded to a video file if the user chooses.
- Sound and weather: synthesised sound (drone, breaker clunks, alarms, the power-down sweep) and weather drawn over the map for the events where it mattered.

The visual design uses a fixed palette (night blue, porcelain, steel, sodium orange for power, red for trips) and two typefaces, Big Shoulders Display for headings and Atkinson Hyperlegible Next for text, chosen for legibility at small sizes. Pages honour reduced-motion settings.

## Appendix C. Study regions

| Region | Scope | Buses | Branches | Mapped generation (MW) | Demand (MW) | Frequency (Hz) |
|---|---|---|---|---|---|---|
| Dhaka | National grid of Bangladesh | 101 | 117 | 22,801 | 11,200 | 50 |
| Dhaka metro | Greater Dhaka, 230 and 132 kV | 64 | 78 | 7,622 | 5,200 | 50 |
| London | South and east England, 400 and 275 kV | 345 | 403 | 37,490 | 14,000 | 50 |
| New York | New York City and surroundings, 345 and 230 kV | 194 | 228 | 22,696 | 11,000 | 60 |
| Houston | Greater Houston, ERCOT 345 kV | 78 | 86 | 38,535 | 15,000 | 60 |
| Madrid | Madrid region, 400 and 220 kV | 135 | 150 | 4,605 | 4,200 | 50 |
| Delhi | National Capital Region, 400 and 220 kV | 270 | 317 | 6,775 | 5,000 | 50 |
| Rome | Lazio, 380 and 220 kV | 33 | 41 | 2,812 | 2,400 | 50 |
| Adelaide | South Australia, 275 and 132 kV | 119 | 140 | 6,792 | 1,900 | 50 |
| Sapporo | Hokkaido, 275 and 187 kV | 72 | 83 | 7,675 | 3,100 | 50 |
| Karachi | Karachi and lower Sindh, 500 and 220 kV | 43 | 46 | 12,930 | 2,300 | 50 |
| Caracas | National grid of Venezuela, 765 and 400 kV | 46 | 59 | 23,083 | 12,500 | 60 |
| São Paulo | São Paulo and Paraná, 765 to 440 kV | 63 | 81 | 22,304 | 16,500 | 60 |
| Istanbul | National grid of Türkiye, 400 kV | 288 | 360 | 75,344 | 32,200 | 50 |
| Colombo | National grid of Sri Lanka, 220 and 132 kV | 86 | 102 | 3,817 | 1,900 | 50 |
| Moscow | Moscow and surrounding oblasts, 500 and 220 kV | 476 | 570 | 19,040 | 13,000 | 50 |
| Tashkent | Central Asian Power System, 500 kV | 66 | 75 | 25,955 | 15,000 | 50 |

Bus counts include junctions created where lines meet away from a substation. Mapped generation is the sum of mapped plant capacity before any availability limits, so it exceeds what can run at once.

## Appendix D. Reproducing the builds

```
npm install
npm run dev                                   # local site at http://localhost:5173
npm test                                      # 81 tests
node scripts/osm/build.mjs <region ids>       # rebuild regions; downloads are cached in scripts/osm/.cache
LAYERS=cached node scripts/osm/build.mjs <id> # rebuild using only cached map layers
TRAIN=1 RUNS=400 npx vitest run src/ai/train.test.ts   # retrain the predictor
```

The Overpass servers are often busy, so the build rotates between three public instances and retries. A full download of a national region can take an hour; rebuilding from the cache takes seconds. The live United States page needs an EIA API key set as an environment variable on the hosting service.
