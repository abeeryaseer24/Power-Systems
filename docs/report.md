# Blackstart: A Browser-Based Power System Simulator Using Reduced Models of Real Transmission Networks

Technical Report

Talha Yaseer Abeer
Department of Electrical and Electronic Engineering
November 2026

Software: https://power-systems-dusky.vercel.app
Source code: https://github.com/abeeryaseer24/Power-Systems

## Abstract

This report describes Blackstart, a power system simulator that runs in a web browser. The software contains a fictional test system for operator training, reduced models of 17 transmission networks derived from OpenStreetMap data, reconstructions of 24 historical blackouts, and a point-kinetics reactor model applied to seven nuclear plants. The network models solve an AC power flow with generator reactive limits and switched shunt compensation, and a per-island frequency model with governor droop, secondary control, under-frequency load shedding and line and generator protection. A multilayer perceptron trained on simulated disturbances estimates the probability of collapse within 60 s, and two modules display live data from the British and United States power systems.

The models are of reduced order and are intended for teaching. Line parameters are typical values for each voltage class, generator dynamics are aggregated per island, and the blackout reconstructions combine simulated physics with event sequences taken from the investigation reports. No reconstruction has been validated against recorded measurements. Section 13 discusses these limitations.

## 1. Introduction

### 1.1 Background

Undergraduate power system courses present frequency control, power flow, voltage stability and protection largely as separate topics, analysed on small textbook networks. Large disturbances in real systems involve all of these at once: a line trip changes the power flow, the change in flow overloads other lines, generation and load separate into islands, and the frequency and voltage of each island then depend on its inertia, reserves and protection settings. The investigation reports into major blackouts describe these interactions in detail, but they are difficult to follow without a model in which the same sequence can be run.

### 1.2 Objectives

The project had four objectives:

1. To model frequency and voltage behaviour so that inertia, governor response, load shedding, voltage collapse, protection operation and islanding arise from the simulation instead of being animated.
2. To apply these models to real transmission topology, and to record every assumption needed to make a reduced model solve.
3. To reconstruct historical blackouts from their published investigation reports, and to allow the user to intervene.
4. To explain each mechanism alongside the simulation in plain language.

### 1.3 Scope

The software consists of the following modules:

- A fictional city network (Halvern) with seven operator scenarios.
- An atlas of 17 reduced transmission models, each of which can be operated interactively.
- Replays of 24 historical blackouts, with an observation mode and an intervention mode, written-up case analyses, and narrated presentations of each event.
- Sandbox exercises: stacked contingencies, system restoration from a blackout, and a load-shedding planner for Dhaka.
- A reactor model with seven plant configurations and a start-up exercise.
- Three analytical tools covering distance protection, merit-order pricing and inter-area oscillations.
- A disturbance risk predictor, and live data from Great Britain and the United States.
- An introductory course of fifteen chapters.

The software is written in TypeScript using React, with three.js for map rendering and Vitest for testing. All computation runs in the browser, except for one serverless function that holds the access key for United States data.

## 2. Test System

Halvern is a fictional coastal city used for training before the real networks. It has a 275 kV ring with nine power stations and seven load districts. Demand, wind and rooftop solar output are generated from a seeded random process, so each scenario repeats exactly.

Power flow in Halvern is computed by a DC load flow on each electrical island. The frequency of each island follows the aggregate swing equation [1]:

<div class="eq">d&Delta;<i>f</i>/d<i>t</i> = <i>f</i><sub>0</sub> (<i>P</i><sub>gen</sub> &minus; <i>P</i><sub>load</sub>) / (2 &Sigma; <i>H</i><sub><i>i</i></sub> <i>S</i><sub><i>i</i></sub>)<span>(1)</span></div>

where <i>H</i><sub><i>i</i></sub> and <i>S</i><sub><i>i</i></sub> are the inertia constant and rating of synchronous machine <i>i</i>. Governors act through droop with a first-order lag. An automatic generation control loop restores frequency to 50 Hz; its correction is shared between units in proportion to ramp rate, with anti-windup when units reach their limits.

The protection modelled comprises thermal tripping of overloaded lines, five stages of under-frequency load shedding at 48.8, 48.6, 48.4, 48.2 and 48.0 Hz with 9 % of demand per stage, loss-of-mains tripping of rooftop solar when the rate of change of frequency exceeds 0.5 Hz/s, and collapse of an island below 47.5 Hz. Each scenario ends with a graded summary of demand served, frequency quality, cost and emissions.

## 3. Network Model Derivation

### 3.1 Data extraction

For each study region, a build script queries the Overpass API of OpenStreetMap for transmission lines and cables at or above a minimum voltage, substations, power plants and populated places. Roads, coastline and rivers are retrieved for display. National studies are clipped to the country border, and city studies to a bounding box. Exclusion boxes remove areas that belong to a different synchronous system, such as the French side of the Channel in the London model. HVDC lines, which OpenStreetMap tags with a frequency of zero, are excluded from the AC network.

Line endpoints are assigned to the nearest substation, parallel circuits are merged and their number recorded, and the result is reduced to a bus-branch model. Buses at which lines leave the study area are marked as boundary buses.

### 3.2 Line parameters

OpenStreetMap records topology but no electrical data. Line parameters are therefore taken from typical values for each voltage class (Table 1), converted to per unit on a 100 MVA base. A minimum reactance of 6 × 10<sup>&minus;4</sup> pu prevents ill-conditioning from very short connections.

Table 1. Line parameters by voltage class (per circuit, per kilometre).

| Voltage | x (Ω/km) | r (Ω/km) | b (µS/km) | Rating (MVA) |
|---|---|---|---|---|
| 700 kV and above | 0.27 | 0.012 | 4.2 | 3000 |
| 480 to 700 kV | 0.28 | 0.018 | 4.0 | 2000 |
| 370 to 480 kV | 0.30 | 0.025 | 3.8 | 1500 |
| 320 to 370 kV | 0.32 | 0.030 | 3.6 | 1000 |
| 270 to 320 kV | 0.33 | 0.035 | 3.5 | 750 |
| 200 to 270 kV | 0.40 | 0.060 | 2.9 | 400 |
| 125 to 200 kV | 0.40 | 0.10 | 2.8 | 150 to 300 |
| Below 125 kV | 0.40 | 0.12 | 2.7 | 110 |

### 3.3 Demand and generation

The demand of each region at the time of its reference event is taken from public reports. It is allocated to buses according to the population of nearby settlements, each settlement drawing from its three nearest substations with inverse-square weighting. The demand at any bus is limited to 45 % of the rating of the lines connected to it, and any excess is passed to neighbouring buses. Without this limit, dense urban areas placed several gigawatts on single buses. Power plants are connected to the nearest bus, with their mapped capacity or, where none is recorded, a default value for the fuel type.

### 3.4 External system

Each region is connected to the remainder of its synchronous system through an external equivalent. Where the connection is AC, the equivalent is a source with its own inertia and governor response, connected to the boundary buses. Where it is HVDC, as at Bheramara (Bangladesh), Heywood (South Australia) and on the Hokkaido-Honshu link, the equivalent is a controllable infeed. Isolated systems (Venezuela and Sri Lanka) are given a nominal 1 MW link so that the same code path applies.

### 3.5 Corrections for individual regions

Several reduced models did not solve as first built. Table 2 lists the problem found in each case and the correction applied. Each correction has a physical basis, but taken together they amount to calibration, which Section 13 discusses.

Table 2. Region-specific corrections.

| Region | Problem | Correction |
|---|---|---|
| London | Cross-Channel HVDC treated as AC, connecting Gravelines to Kent | HVDC lines and the French side excluded |
| Houston | Only the 345 kV network modelled; the 138 kV network carries much of the local transfer | Line ratings scaled by 2 |
| Moscow | 20 lines above rating in the base case; 110 kV city network not modelled | Line ratings scaled by 1.8 |
| Hokkaido | Tomari dispatched, although shut down since 2012 | Marked out of service |
| Venezuela | A 225 km, 765 kV line with 16.6 pu of charging; no initial load-flow solution | Fixed reactors at 70 % of charging on lines above 3 pu; 50 % series compensation on long 765 kV lines; western thermal plants must run |
| Brazil | All of Itaipu delivered over AC, although the 50 Hz half reaches São Paulo by HVDC | Half of Itaipu on the AC model; 40 % series compensation; late-evening demand of 16.5 GW |
| Sri Lanka | The 220 kV Norochcholai-Veyangoda double circuit not mapped; the Northern Province allocated 22 % of national demand | Line added; northern demand scaled by 0.3 |
| Türkiye | Akkuyu dispatched, although not built in 2015; merit order placed most generation in the east | Akkuyu out of service; south-eastern hydro limited to 50 to 60 % |
| Central Asia | Rogun dispatched at full capacity | Marked out of service (two small units operated in early 2022) |

## 4. Steady-State Analysis

Each energised island is solved by a fast decoupled load flow of the XB type [3] every 0.25 s of simulated time, to a tolerance of 6 × 10<sup>&minus;4</sup> pu. Synchronous generators are modelled as PV buses with reactive limits of +0.55 and &minus;0.30 times their rating, and a generator that reaches a limit is converted to a PQ bus at that limit. Loads draw reactive power equal to 0.33 times their real power, partly offset by fixed shunt capacitance.

Voltage is controlled by switched shunts at each bus. Reactors are switched in above 1.05 pu, up to 90 % of the local line charging, and capacitors below 0.96 pu, up to 35 % of the local load. A Newton-Raphson solver is retained as a reference and is compared with the decoupled solver in the test suite.

Two numerical measures were found necessary. First, a warm-started solution can diverge after a large change in topology, so a failed solution is repeated from a flat start before it is treated as a collapse. Second, on the Türkiye model the decoupled method failed to find an initial solution although the Newton-Raphson method converged with a minimum voltage of 0.99 pu. The Newton-Raphson solution showed that 27 machines would need to absorb 3.3 GVAr beyond their limits because of the charging of the 400 kV lines. When the first solution fails, the initial operating point is therefore taken from the Newton-Raphson method with all line reactors in service. This applies only to the initial solution, and voltage collapse during an event is still detected by the decoupled solver.

If no load-flow solution exists during a simulation, the weakest fifth of the island, ranked by the voltages of the failed solution, is taken to be beyond the nose of its PV curve. Under-voltage relays shed 30 % of the demand in that area, and inverter-based generation there reduces its output by 35 %. If the condition persists for 14 consecutive solutions, the island collapses.

## 5. Dynamic Model and Protection

The frequency of each island follows Equation (1), with the external equivalent contributing its inertia when the connection is AC. Governors act through droop and a first-order lag. By default only 35 % of the generating fleet operates in frequency-sensitive mode with reserve headroom, and this fraction is the main parameter used to represent the poor primary response reported in several events. Inverter-based generation reduces output at high frequency, as in limited frequency-sensitive mode. The voltage dependence of load is bounded between 0.3 and 1.

The following protection functions are modelled:

- Thermal: line heating accumulates above 100 % loading, and the line trips when the conductor would have sagged to its limit.
- Distance: a line loaded above 230 % of its rating trips without delay.
- Out-of-step: a line trips when the voltage angle across it exceeds 1.45 rad (approximately 83°).
- Generator over- and under-voltage tripping.
- Five-stage under-frequency load shedding, with a per-event efficacy factor that represents relays failing to operate.
- Under-voltage load shedding and voltage collapse, as described in Section 4.

A grid-forming battery model was added in a later stage. It is represented as a voltage source with synthetic inertia (<i>H</i> = 6 s), a 1 % droop and a response time of 0.15 s, with its full rating available for frequency response in both directions. Table 3 shows the effect of batteries rated at 8 % of demand, placed at the four largest load buses, on the loss of the largest generating unit.

Table 3. Effect of grid-forming batteries on the loss of the largest unit.

| Region | Frequency nadir, without / with (Hz) | Load shed, without / with (MW) |
|---|---|---|
| South Australia | 48.58 / 48.79 | 305 / 152 |
| Hokkaido | 48.30 / 48.57 | 747 / 498 |
| Karachi | 47.97 / 48.11 | 920 / 736 |

## 6. Reconstruction of Historical Blackouts

### 6.1 Method

Each event is written from its investigation report as a sequence of steps of three types. A trigger is the initiating event, such as a line flashover, a generator trip or the loss of an interconnector, and always occurs. A consequence is protection or plant behaviour described in the report, such as out-of-step separation or under-frequency tripping of generators. Most consequences are conditional on a physical state, for example a frequency below 49 Hz or a line loaded above 115 % of its rating; a few are unconditional. An operator step is an action taken by the control room at the time.

In observation mode all steps are executed, and the replay follows the recorded sequence. In intervention mode the operator steps are left to the user, and a consequence occurs only if its condition holds in the simulation at that time. If, for example, the user sheds load early enough that the frequency never reaches the threshold, the consequence does not occur and is recorded as averted. The initial conditions of each event can also be set to match the report, for example reduced primary response, lines out of service for maintenance, additional demand during a heatwave, or poor load-shedding performance.

### 6.2 Results

Table 4 compares the loss of supply in each reconstruction, run in observation mode, with the reported impact. Percentages refer to the study region, not to the whole interconnection. A 100 % loss in the São Paulo model, for instance, corresponds to the loss of about 40 % of the Brazilian load. The Hokkaido and Texas reconstructions lose less supply than the historical events because those cascades developed over hours, while the replays cover minutes.

Table 4. Simulated loss of supply in observation mode compared with the reported impact.

| Event | Model | Simulated loss | Reported impact | Ref. |
|---|---|---|---|---|
| Bangladesh, 4 Oct 2022 | Bangladesh | 100 % | About 140 million people | [21] |
| Bangladesh, 1 Nov 2014 | Bangladesh | 100 % | About 150 million | [21] |
| Great Britain, 9 Aug 2019 | South and east England | 285 MW peak (2 %) | About 1.1 million customers | [12] |
| North-eastern US, 14 Aug 2003 | New York | 100 % | 50 million | [18] |
| New York City, 13 Jul 1977 | New York | 72 % | About 9 million | [19] |
| Texas, 15 Feb 2021 | Houston | 28 % | About 4.5 million homes | [11] |
| Iberian Peninsula, 28 Apr 2025 | Madrid | 100 % | About 55 to 60 million | [7] |
| Northern India, 31 Jul 2012 | Delhi | 100 % | About 620 million | [8] |
| Italy, 28 Sep 2003 | Lazio | 100 % | About 56 million | [16] |
| South Australia, 28 Sep 2016 | South Australia | 100 % | About 850,000 customers | [4] |
| Hokkaido, 6 Sep 2018 | Hokkaido | 16 % | About 2.95 million households | [14] |
| Pakistan, 23 Jan 2023 | Karachi | 100 % | About 220 million | [21] |
| South London, 28 Aug 2003 | South and east England | 1,800 MW peak, restored | About 410,000 customers (724 MW) | [13] |
| North-eastern US, 9 Nov 1965 | New York | 100 % | About 30 million | [9] |
| Continental Europe, 4 Nov 2006 | Madrid | 384 MW peak | About 15 million households | [17] |
| Continental Europe, 8 Jan 2021 | Lazio | None | About 1.7 GW of interruptible load | [6] |
| Pakistan, 9 Jan 2021 | Karachi | 100 % | About 200 million | [21] |
| Texas, 2 Feb 2011 | Houston | 8 % | About 3.2 million customers | [10] |
| Venezuela, 7 Mar 2019 | Venezuela | 100 % | About 30 million | [21] |
| Brazil (Itaipu), 10 Nov 2009 | São Paulo and Paraná | 100 % | About 60 million, and all of Paraguay | [15] |
| Türkiye, 31 Mar 2015 | Türkiye | 100 % | About 70 million | [5] |
| Sri Lanka, 17 Aug 2020 | Sri Lanka | 100 % | About 21 million | [20] |
| Moscow, 25 May 2005 | Moscow | 3,473 MW (25 %) | About 2 million (roughly 3,500 MW) | [21] |
| Central Asia, 25 Jan 2022 | Central Asia | 100 % | About 25 million | [21] |

In the Türkiye reconstruction, the event script specifies only a separation across a band of longitude in central Anatolia; the lines that open, and their order, follow from the simulated flows. The Moscow reconstruction sheds 3,473 MW against a reported loss of roughly 3,500 MW. The size of that loss is partly set by a scripted step, so the agreement is of limited significance.

### 6.3 Interpretation

Where a consequence is unconditional, or its condition is always met in observation mode, the replay reproduces the reported sequence and does not predict it. Many of the collapses in Table 4 are therefore partly scripted. The simulation determines how far the effects spread, how much load shedding operates and whether islands survive, while the principal events come from the reports.

## 7. Reactor Model

The reactor is represented by point kinetics with six delayed-neutron groups [22]. The prompt-jump approximation is used away from prompt criticality, and explicit integration with a 0.2 ms step close to it. Reactivity includes control rod position, Doppler feedback from fuel temperature, moderator temperature and void feedback, and xenon and iodine dynamics normalised to rated power. For the RBMK, the model includes a positive void coefficient and the graphite displacers at the lower end of the control rods. Decay heat follows four exponential groups. The thermal-hydraulic model has one fuel node and one coolant node with a saturation limit, pressure relief, feedwater, emergency injection, passive cooling and fire-engine injection. Above about 1200 °C, the zirconium-steam reaction produces hydrogen and core damage accumulates.

Seven plants are configured: Rooppur (VVER-1200, connected to the Bangladesh network model), Chernobyl unit 4, Three Mile Island unit 2, Fukushima Daiichi unit 1, Forsmark unit 1, Fukushima Daini and Zaporizhzhia. In the Chernobyl scenario, the main circulation pumps supplied by the coasting turbine-generator are taken out of service one at a time, three of them at 16, 24 and 32 s after the start of the scenario. In an earlier version, four pumps stopped together at the start of the test, and the void feedback caused a power excursion about 19 s into the test, before the emergency shutdown button (AZ-5) was pressed. With the staggered run-down, power rises from about 6 % to 9 %, and the excursion follows the 01:23:40 shutdown signal by about one second. The interval reported for the actual event is about four seconds.

For Forsmark (2006), Fukushima Daini (2011) and Zaporizhzhia (2023), the subject of interest is the dependence of the station on off-site and emergency AC supplies.

## 8. Analytical Tools

### 8.1 Distance protection

The protection tool models a 400 kV system of two lines, 100 km and 80 km long, with impedance 0.03 + j0.32 Ω/km. Four distance relays have mho characteristics with reaches of 80 % of the protected line (zone 1), 120 % of the line (zone 2) and the line plus 120 % of the adjacent line (zone 3). Operating times are 20 ms for the relay and 50 ms for the circuit breaker, with delays of 300 ms and 1 s for zones 2 and 3. The user sets the fault location and resistance, can simulate a breaker failure with or without breaker-failure protection (which opens the adjacent breakers after 150 ms), can observe load encroachment into zone 3 as voltage falls and reactive flow rises, and can run a two-source power swing with or without power-swing blocking. The apparent impedance neglects infeed from the remote end, so resistive faults appear closer to the relay than they would in practice.

### 8.2 Electricity market

The market tool uses a stylised 25 GW generating fleet. Marginal costs are calculated from fuel price, heat rate and carbon price, and the market is cleared hourly against a winter demand profile with solar and wind availability. A price cap applies when demand cannot be met. A two-zone version shows the separation of prices and the resulting congestion rent when the transfer capacity between zones is reached. Start-up costs, ramp limits, reserve requirements and bidding behaviour are not modelled.

### 8.3 Inter-area oscillations

The oscillation tool models four classical machines in two areas, with inertia constants of 6.5, 6.5, 6.2 and 6.2 s, strong coupling within each area and 0.75 pu per tie line between areas. The equations are integrated by the fourth-order Runge-Kutta method with a 5 ms step. Fast, high-gain excitation systems are represented as negative damping proportional to the transfer between areas, and power system stabilisers as additional positive damping. The frequency and damping ratio of the inter-area mode are estimated from successive peaks of the difference between the mean rotor speeds of the two areas. With a transfer of 600 MW and one of two tie lines tripped, a 0.5 Hz oscillation grows until the areas lose synchronism 13.6 s after the disturbance. With stabilisers in service, the same mode has a damping ratio of 16 %. Excitation and stabiliser effects are represented as damping terms and not as control loops.

## 9. Disturbance Risk Predictor

### 9.1 Training data and model

The training data were generated with the simulator. Each of 400 runs used one of the first ten regions, with randomised load-shedding performance and primary response, and applied one to three disturbances: trips of large plants, trips of the most heavily loaded lines, separation from the external system, demand increases, or a generation deficit in the external system. The state was sampled every 2 s, giving 19,276 samples, each labelled according to whether the demand served fell below 50 % within the following 60 s. Samples before the first disturbance were labelled as safe.

Each sample is described by twelve features: frequency deviation, rate of change of frequency, minimum frequency over the preceding 5 s, minimum voltage, fraction of demand served, number of energised islands, spinning reserve, inertia per megawatt of demand, highest line loading, fraction of lines overloaded, import fraction, and any uncovered generation loss in the external system. The model is a multilayer perceptron with layers of 12, 16, 8 and 1 neurons, ReLU activation in the hidden layers and a sigmoid output, trained with the Adam optimiser and class weighting. One run in five was held out for testing.

### 9.2 Results

On the held-out runs the model achieved an area under the ROC curve of 0.80, an accuracy of 0.90, a precision of 0.34 and a recall of 0.54. Two-thirds of its warnings were therefore false alarms, and it failed to warn of nearly half of the collapses within the 60 s horizon. On the historical reconstructions it warned ahead of some collapses and not others, and several collapses occurred between two consecutive samples.

### 9.3 Explanation and operator advice

The contribution of each feature to a prediction is estimated by occlusion: the feature is set to its mean value in the training data, and the resulting fall in predicted risk is taken as its contribution. The method neglects interactions between features but is adequate for a model of this size. In the Bangladesh 2022 reconstruction, the first warning at 22 s is attributed mainly to the rate of change of frequency (&minus;0.15 Hz/s, contributing 50 percentage points of the predicted risk).

In intervention mode, an advisory panel displays the predicted risk and its main contributor, and recommends a single action according to fixed operating rules. It recommends shedding 5 % of demand when frequency is more than 1.2 % below nominal or falling fast, relieving voltages below 0.9 pu or line loadings above 110 %, reducing the output of the largest unit when frequency is 1 % above nominal, increasing imports or starting reserve plant when frequency is low, maintaining 5 % spinning reserve, and restoring shed demand in steps of 10 % once the system is stable. The recommendations come from these rules; the neural network supplies only the risk estimate.

## 10. Real-Time Data Integration

The Great Britain module retrieves system frequency at 15 s resolution, generation by fuel type and transmission demand from the Elexon Insights API, and carbon intensity from the Carbon Intensity API of the National Energy System Operator. These services are open and accept requests directly from a browser.

The United States module retrieves hourly data from the Hourly Electric Grid Monitor of the U.S. Energy Information Administration (form EIA-930) for eight balancing authorities: demand, day-ahead demand forecast, net generation, interchange and generation by fuel type. Because this service requires an access key, requests pass through a serverless function that adds the key from the hosting environment, accepts only a fixed list of balancing authorities, returns only the fields required and caches responses for ten minutes. The key is never sent to the browser.

## 11. Verification

The test suite contains 81 automated tests. The AC power flow is checked against a closed-form solution for a two-bus system; it is shown to fail to converge beyond the nose of the PV curve; the decoupled and Newton-Raphson solutions are compared on the Halvern network with losses, line charging and PV buses; and a generator held at its reactive limit is shown to allow its terminal voltage to fall. Further tests cover the DC load flow and island detection, the weather and demand profiles, the Halvern scenarios, black start from a hydro unit, the connection of Rooppur to the Bangladesh network, each contingency modifier, the network simulator, and the reactor model (steady state at rated power, decay heat after shutdown, the reactor period after a reactivity step, and completion of every plant scenario). Each historical reconstruction is required to produce a loss of supply in observation mode. The tests run on every change submitted to the repository.

These are consistency and regression tests. They confirm that the software implements the models described; they do not show that the models represent the real systems.

## 12. Results Summary

The network models solve for all 17 regions after the corrections in Table 2, and all 24 reconstructions produce a loss of supply when run in observation mode (Table 4). Grid-forming batteries rated at 8 % of demand raised the frequency nadir and reduced load shedding in each of the three regions tested (Table 3). The risk predictor achieved an area under the ROC curve of 0.80 on held-out simulated runs, with low precision. The live data modules operate against the public services described in Section 10.

## 13. Limitations

1. Line impedances and ratings are typical values for each voltage class. Conductor types, bundling, transformer impedances and protection settings for the real networks are not known, and generator capacities are taken from mapped data or defaults.

2. The networks are incomplete. Only lines at or above the minimum voltage of each region are included, and the completeness of the mapped data varies between countries. Several regions required scaled ratings, limits on plant availability or added lines before they would solve (Table 2). These corrections have physical justifications, but they were adjusted until the models behaved plausibly and amount to calibration.

3. The dynamic model is aggregated. The network models have no individual machine angles, no excitation or governor detail and no electromagnetic transients. Frequency is uniform within each island, and voltage collapse is inferred from load-flow divergence and not simulated in time.

4. The reconstructions are partly scripted (Section 6.3). They do not constitute an independent prediction of each cascade.

5. No reconstruction has been compared with recorded frequency, flow or disturbance data. Agreement with the historical record in Table 4 is qualitative, apart from a few totals.

6. The risk predictor was trained only on data from this simulator and inherits its simplifications. A precision of 0.34 would not support operational use, and its explanations rest on a one-at-a-time sensitivity measure.

7. The analytical tools are simplified as stated in Section 8: single-phase analysis, no remote infeed, no bidding behaviour, and damping terms in place of control loops.

## 14. Conclusions

The project shows that a large part of an undergraduate power system syllabus can be implemented as interacting models on real network topology, in software that runs in a browser. The combination of AC power flow, frequency response and protection on these networks reproduces the general course of the 24 blackouts studied. The corrections in Table 2 each followed from diagnosing a specific failure: excessive charging on 765 kV lines, a missing double circuit, half of a plant counted on the wrong system, and a merit order that overloaded a corridor.

The models are of teaching grade. They are reduced-order reconstructions of each network and are not suitable for planning or operational studies. The blackout replays are best described as reconstructions that combine event sequences from the investigation reports with simulated physics.

## 15. Recommendations for Further Work

1. Validate one event quantitatively by comparing the Great Britain 9 August 2019 reconstruction with the frequency record in the official report [12], which shows a nadir of 48.8 Hz, and adjusting inertia and response until the profiles agree.
2. Indicate in the interface whether each consequence in a replay is simulated or scripted.
3. Replace typical line parameters with published network data where system operators release it.
4. Add individual machine angles to the network models, so that transient stability and inter-area modes arise in the networks themselves.
5. Retrain the predictor on all 17 regions with more runs, report precision-recall curves, and compare it with simple threshold rules on frequency and its rate of change.

## References

[1] P. Kundur, *Power System Stability and Control*. New York: McGraw-Hill, 1994.

[2] J. D. Glover, T. J. Overbye and M. S. Sarma, *Power System Analysis and Design*. Boston: Cengage Learning.

[3] B. Stott and O. Alsac, "Fast decoupled load flow," *IEEE Transactions on Power Apparatus and Systems*, vol. PAS-93, no. 3, pp. 859-869, 1974.

[4] Australian Energy Market Operator, *Black System South Australia 28 September 2016*, final report, March 2017.

[5] ENTSO-E, *Report on Blackout in Turkey on 31st March 2015*, September 2015.

[6] ENTSO-E, *Continental Europe Synchronous Area Separation on 08 January 2021*, final report, July 2021.

[7] ENTSO-E Expert Panel, *28 April 2025 Iberian Blackout*, factual report, 2025; Government of Spain, committee report on the incident of 28 April 2025, June 2025.

[8] Ministry of Power, Government of India, *Report of the Enquiry Committee on Grid Disturbance in Northern Region on 30 July 2012 and in Northern, Eastern and North-Eastern Region on 31 July 2012*, August 2012.

[9] Federal Power Commission, *Report to the President on the Northeast Power Failure*, December 1965.

[10] FERC and NERC, *Report on Outages and Curtailments During the Southwest Cold Weather Event of February 1-5, 2011*, August 2011.

[11] FERC and NERC staff, *The February 2021 Cold Weather Outages in Texas and the South Central United States*, November 2021.

[12] National Grid ESO, *Technical Report on the Events of 9 August 2019*, September 2019; Ofgem, *9 August 2019 Power Outage Report*, January 2020.

[13] Ofgem, *Report on the Investigation of the Power Failure in South London on 28 August 2003*, 2003; National Grid Transco, investigation report on the same incident, 2003.

[14] Organization for Cross-regional Coordination of Transmission Operators (OCCTO), Third-Party Verification Committee report on the Hokkaido blackout, December 2018.

[15] Operador Nacional do Sistema Elétrico, *Relatório de Análise de Perturbação*, disturbance of 10 November 2009.

[16] UCTE, *Final Report of the Investigation Committee on the 28 September 2003 Blackout in Italy*, April 2004.

[17] UCTE, *Final Report: System Disturbance on 4 November 2006*, January 2007.

[18] U.S.-Canada Power System Outage Task Force, *Final Report on the August 14, 2003 Blackout in the United States and Canada*, April 2004.

[19] U.S. Department of Energy, *The Con Edison Power Failure of July 13 and 14, 1977*, staff report, June 1978.

[20] Public Utilities Commission of Sri Lanka, report on the island-wide power failure of 17 August 2020.

[21] For the Bangladesh, Pakistan, Venezuela, Moscow and Central Asia events, no full public investigation report was available. These reconstructions rely on official statements and committee findings as reported in the press (including The Daily Star, Dhaka Tribune, bdnews24.com, Dawn, Kommersant, RIA Novosti and Reuters) and are correspondingly less certain. The sources for each event are listed in its case analysis within the software.

[22] D. L. Hetrick, *Dynamics of Nuclear Reactors*. Chicago: University of Chicago Press, 1971.

[23] International Atomic Energy Agency, *INSAG-7: The Chernobyl Accident: Updating of INSAG-1*, Safety Series No. 75, 1992.

[24] Report of the President's Commission on the Accident at Three Mile Island, 1979.

[25] International Atomic Energy Agency, *The Fukushima Daiichi Accident*, Report by the Director General, 2015; TEPCO, *Fukushima Nuclear Accidents Investigation Report*, 2012.

Network, settlement and map data © OpenStreetMap contributors, available under the Open Database Licence. World outline from Natural Earth. Live data from Elexon, the National Energy System Operator and the U.S. Energy Information Administration.

## Appendix A. Software Structure

The application is a single-page web application built with Vite and React. Each module is loaded only when it is opened. The source is organised as shown in Table A1.

Table A1. Organisation of the source code.

| Directory | Contents |
|---|---|
| src/grid | Test system, network simulator, AC power flow, event reconstructions, case analyses, contingency modifiers |
| src/nuclear | Reactor model and plant scenarios |
| src/ai | Feature extraction, inference and explanation for the risk predictor; training script |
| src/scene | Three-dimensional rendering of the test system and of the network maps |
| src/pages, src/components | User interface |
| scripts/osm | Region definitions and the OpenStreetMap build procedure |
| api | Serverless function for United States data |
| public/data | Built network models, trained predictor and world outline |

The network simulator runs in the browser's main thread within the rendering loop, and is limited to about 8 ms of computation per frame so that the display remains responsive. When the requested simulation speed cannot be reached within this limit, the achieved speed is displayed. The largest model (Moscow, 476 buses) completes its three-minute reconstruction in about 4.5 s of computation. The decoupled load flow refactorises its matrices only when the set of PV and PQ buses changes.

## Appendix B. Study Regions

Table B1. Study regions.

| Region | Scope | Buses | Branches | Mapped generation (MW) | Demand (MW) | Frequency (Hz) |
|---|---|---|---|---|---|---|
| Dhaka | National grid of Bangladesh | 101 | 117 | 22,801 | 11,200 | 50 |
| Dhaka metro | Greater Dhaka, 230 and 132 kV | 64 | 78 | 7,622 | 5,200 | 50 |
| London | South and east England, 400 and 275 kV | 345 | 403 | 37,490 | 14,000 | 50 |
| New York | New York City and surroundings, 345 and 230 kV | 194 | 228 | 22,696 | 11,000 | 60 |
| Houston | Greater Houston, 345 kV | 78 | 86 | 38,535 | 15,000 | 60 |
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
| Moscow | Moscow and surrounding regions, 500 and 220 kV | 476 | 570 | 19,040 | 13,000 | 50 |
| Tashkent | Central Asian Power System, 500 kV | 66 | 75 | 25,955 | 15,000 | 50 |

Bus counts include junctions where lines meet away from a substation. Mapped generation is the total mapped plant capacity before availability limits and exceeds the generation that can operate at one time.

## Appendix C. Build Procedure

```
npm install
npm run dev                                    local server at http://localhost:5173
npm test                                       run the 81 tests
node scripts/osm/build.mjs <region ids>        rebuild regions (downloads cached in scripts/osm/.cache)
LAYERS=cached node scripts/osm/build.mjs <id>  rebuild using cached map layers only
TRAIN=1 RUNS=400 npx vitest run src/ai/train.test.ts    retrain the risk predictor
```

The public Overpass servers are frequently busy, and the build procedure rotates between three of them. Downloading a national region can take up to an hour; rebuilding from the cache takes seconds. The United States data module requires an EIA access key set as an environment variable on the hosting service.
