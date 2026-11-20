# Blackstart

A power system simulator that runs in the browser. It starts with a fictional city whose lights depend on the grid you operate, and goes on to 17 real transmission networks, 24 historical blackouts, seven reactor models and six power stations in 3D.

Live: https://power-systems-dusky.vercel.app

## What is in it

Halvern is a fictional coastal city of 1.4 million people, drawn at night. You run its 275 kV grid through seven shifts, from an ordinary evening with a cup-final kettle surge to a storm, a heatwave and a black start from one hydro unit. When frequency collapses, the districts go dark.

The atlas has 17 reduced transmission models built from OpenStreetMap: Bangladesh, London, New York, Houston, Madrid, Delhi, Rome, South Australia, Hokkaido, Karachi, Venezuela, São Paulo, Türkiye, Sri Lanka, Moscow, Central Asia and greater Dhaka. Each one solves an AC power flow and can be operated live. On these networks, 24 blackouts are replayed from their investigation reports, from New York 1965 to Iberia 2025. You can watch each one, or take control and try to save the grid. Each event also has a case file and a narrated documentary.

The nuclear section runs a point-kinetics reactor with xenon, void and Doppler feedback for seven plants, including Chernobyl, Three Mile Island and Fukushima, plus a start-up exercise for Rooppur.

The plants section has 3D models of Rooppur, Chernobyl, Fukushima Daiichi, Three Mile Island, Drax and the Three Gorges Dam, built to published dimensions. You can orbit, take a guided tour or walk the site, switch between day and night, and open the containment to see the reactor. Each plant can be tripped on a model of its own grid, built up from an empty site in a time-lapse, or flooded (Fukushima replays the 2011 tsunami). Two control rooms replay TMI-2 in 1979 and Chernobyl-4 in 1986 from the operator's chair, and two fallout maps show where the Chernobyl and Fukushima releases went.

There is more: sandboxes for stacking contingencies, rebuilding a grid from darkness and planning a night of load shedding in Dhaka; tools for distance protection, merit-order markets and inter-area oscillations; a small neural network that estimates the risk of collapse; live data from Great Britain and the United States; and a 15-chapter course that explains each idea from scratch.

## The models

| Piece | Implementation |
| --- | --- |
| Halvern | 13 buses, 19 lines, DC load flow per island, aggregate swing equation, droop governors, ramp-weighted AGC, thermal trips, five-stage UFLS, RoCoF trip of rooftop solar |
| Real networks | OpenStreetMap topology, typical impedances per voltage class, fast decoupled AC load flow with Newton-Raphson fallback, generator reactive limits, switched shunts, external equivalent, distance and out-of-step protection, UVLS |
| Reactor | Point kinetics with six delayed groups, xenon and iodine, void and Doppler feedback, decay heat, one-node fuel and coolant, hydrogen above about 1200 °C |
| Plant on its grid | One swing equation per grid with real frequency, demand and inertia, 5 % droop, AGC, UFLS scaled for 50 or 60 Hz, decay heat after scram |
| Fallout | Lagrangian puffs on reconstructed release histories and hourly winds, dry and wet deposition, scaled against the published Cs-137 maps |
| Predictor | Multilayer perceptron (12-16-8-1) trained on 400 simulated disturbance runs; AUC 0.80 on held-out runs |

All of these are teaching models. Line parameters are typical values, dynamics are aggregated, the blackout replays mix report-driven steps with simulated physics, and nothing has been validated against recorded measurements. The [technical report](docs/report.md) ([PDF](docs/report.pdf)) sets out every model, assumption and limitation.

## Running it

```bash
npm install
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

The test suite has 90 tests. Rebuilding a region from OpenStreetMap uses `node scripts/osm/build.mjs <region ids>`; the US live data needs an EIA access key set as an environment variable on the host.

## Stack

TypeScript, React 19 and Vite. three.js draws the city, the network maps, the power stations and the control rooms, with custom shaders and procedural textures. GSAP drives the landing sequence, KaTeX the equations and Vitest the tests. Sound is synthesised with the Web Audio API.

## Structure

```
src/grid/          Halvern engine, AC power flow, region simulator, blackout events, case files
src/nuclear/       reactor model and plant scenarios
src/plants3d/      3D power stations, textures, reactor interiors, grid stress, time-lapse, flood, sound
src/controlroom/   control-room replays and their time series
src/fallout/       dispersion and deposition model
src/ai/            risk predictor features, inference and training
src/scene/         three.js city and network maps
src/pages/         every page of the site
scripts/osm/       region definitions and the OpenStreetMap build
api/               serverless function for US data
docs/              technical report
```

## Data

Network, settlement and road data © OpenStreetMap contributors (ODbL). World outline from Natural Earth. Live data from Elexon Insights, the NESO Carbon Intensity API and the U.S. Energy Information Administration. Close-up props for the power stations from Poly Haven (CC0).
