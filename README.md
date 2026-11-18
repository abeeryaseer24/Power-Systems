# Blackstart

Run the power grid of a city through a heatwave, a storm and a total blackout, and keep it at 50 hertz.

Blackstart is a real-time power system simulator in the browser. Halvern, a fictional coastal city of 1.4 million people, is drawn at night in 3D. Every lit window depends on the grid you are operating: when frequency collapses, the districts go dark.

## What you do

- **Shifts.** Seven scenarios, from an ordinary Tuesday (with a cup-final kettle surge at 21:45) to a heatwave with derated lines, the trip of the largest unit on the system, a windless winter peak, a storm that shuts down the offshore wind farm, and a full black start from a single hydro unit.
- **Control room.** Start and stop units with realistic start-up times, move setpoints, choose which plants follow AGC, open and close line breakers, curtail renewables, charge the battery, import or export over the HVDC link, and reconnect districts block by block. Major protection events slow the simulation to real time.
- **Debrief.** A grade from demand served, time inside 49.8–50.2 Hz and cost, with the generation mix and the frequency envelope for the whole shift.
- **Learn.** Five interactive lessons: the swing equation, DC load flow, cascading line trips, merit-order pricing and black start.

## The model

| Piece | Implementation |
| --- | --- |
| Network | 13 buses, 19 lines, 275 kV, reactances in per unit on 100 MVA |
| Power flow | DC load flow per electrical island, solved at 10–20 Hz of simulated time |
| Frequency | Aggregated swing equation per island, `df/dt = f0 (Pgen − Pload) / 2Ek` |
| Primary control | Droop governors (3–5 %) with first-order lags and deadbands; battery fast frequency response |
| Secondary control | AGC integrator weighted by ramp rate, with anti-windup |
| Protection | Inverse-time thermal line trips, distance trip above 230 %, five-stage UFLS from 48.8 Hz, RoCoF loss-of-mains trip of rooftop solar, generator trips below 47.5 Hz, auto-reclose |
| Weather | Seeded Ornstein–Uhlenbeck processes for wind, cloud and demand noise; temperature-dependent demand and line ratings |
| Plants | Nuclear, coal, CCGT, OCGT, pumped hydro (black-start capable), offshore wind with storm cut-out, solar, battery, HVDC link |

Simplifications: no voltage or reactive power, lossless lines, no intra-island machine angles.

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

## Stack

TypeScript, React 19, Vite, three.js (instanced city, custom shaders, bloom), GSAP ScrollTrigger for the landing sequence, KaTeX for the lessons, Vitest for the grid engine.

## Structure

```
src/grid/      grid engine: network data, load flow, profiles, simulation, scenarios, tests
src/scene/     three.js city, transmission lines, plants and camera
src/pages/     landing, shift board, control room, debrief, lessons, about
src/components frequency dial, timeline, inspector, network map
```
