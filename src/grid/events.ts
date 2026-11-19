// Historical blackouts, reconstructed on reduced OpenStreetMap transmission models.
//
// These are teaching reconstructions: the initiating events and the order of the
// major steps follow the public investigation reports listed with each event, but
// the network is a reduced model with estimated line parameters, so magnitudes and
// timings are approximate. "Trigger" steps always happen. "Consequence" steps
// represent protection or plant behaviour that the reports describe; in Take
// control mode they only happen if the physical condition for them is present.

import type { RegionSim } from './region';

export interface Step {
  t: number;
  clock: string;
  label: string;
  kind: 'trigger' | 'consequence' | 'operator';
  run: (s: RegionSim, h: Helpers) => void;
  /** Physical precondition for a consequence when the player is in control. */
  cond?: (s: RegionSim) => boolean;
}

export interface BlackoutEvent {
  id: string;
  region: string;
  title: string;
  where: string;
  date: string;
  time: string;
  /** One-line hook for the library. */
  hook: string;
  people: string;
  duration: string;
  summary: string[];
  causes: string[];
  lessons: string[];
  sources: string[];
  setup: (s: RegionSim, h: Helpers) => void;
  steps: Step[];
  /** Simulated seconds to run. */
  span: number;
  /** Lead time before the first step, seconds. */
  lead: number;
}

export function helpers(s: RegionSim) {
  const [lat0, lon0] = s.data.center;
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  const ll = (lat: number, lon: number): [number, number] => [(lon - lon0) * kx, -(lat - lat0) * 110.57];
  const area = (lat: number, lon: number, r: number) => {
    const [x, z] = ll(lat, lon);
    return { x, z, r };
  };
  return {
    ll,
    area,
    bus: (name: string, lat: number, lon: number) => s.findBus(name, ll(lat, lon)),
    tripAt(name: string, lat: number, lon: number, n: number, reason: string) {
      const b = s.findBus(name, ll(lat, lon));
      if (b < 0) return;
      s.branchesAt(b).filter((i) => s.branches[i].closed).slice(0, n).forEach((i, k) => s.tripBranch(i, reason, k > 0));
    },
    tripBetween(a: string, la: [number, number], b: string, lb: [number, number], reason: string) {
      const A = s.findBus(a, ll(la[0], la[1]));
      const B = s.findBus(b, ll(lb[0], lb[1]));
      const i = s.branchBetween(A, B);
      if (i >= 0) s.tripBranch(i, reason);
      else {
        const k = s.branchesAt(A).find((j) => s.branches[j].closed);
        if (k !== undefined) s.tripBranch(k, reason);
      }
    },
    tripCut(la: [number, number], lb: [number, number], reason: string, max = 99) {
      const [x0, z0] = ll(la[0], la[1]);
      const [x1, z1] = ll(lb[0], lb[1]);
      s.branchesCrossing(x0, z0, x1, z1).filter((i) => s.branches[i].closed).slice(0, max).forEach((i, k) => s.tripBranch(i, reason, k > 0));
    },
    plant(name: string, lat: number, lon: number, kind?: Parameters<RegionSim['findGen']>[2]) {
      return s.findGen(name, ll(lat, lon), kind);
    },
    tripPlant(name: string, lat: number, lon: number, reason: string, kind?: Parameters<RegionSim['findGen']>[2]) {
      const i = s.findGen(name, ll(lat, lon), kind);
      if (i >= 0) s.tripGen(i, reason);
    },
    deratePlant(name: string, lat: number, lon: number, frac: number, reason: string, kind?: Parameters<RegionSim['findGen']>[2]) {
      const i = s.findGen(name, ll(lat, lon), kind);
      if (i >= 0) s.derateGen(i, frac, reason);
    },
    /** Generation lost elsewhere in the interconnection (outside the study area). */
    extLoss(mw: number, why: string) {
      s.ext.deficit += mw;
      s.note('alarm', `${s.data.ext.name}: ${Math.round(mw)} MW of generation lost. ${why}`);
      s.raise(`${Math.round(mw)} MW lost in the wider grid`, why, 'major');
    },
  };
}
export type Helpers = ReturnType<typeof helpers>;

const lowF = (s: RegionSim, f: number) => s.frequency > 0 && s.frequency < f;

export const EVENTS: BlackoutEvent[] = [
  // ------------------------------------------------------------------ Bangladesh 2022
  {
    id: 'bangladesh-2022',
    region: 'dhaka',
    title: 'Bangladesh national blackout',
    where: 'Bangladesh',
    date: '4 October 2022',
    time: '14:04 BST',
    hook: 'A fault in the eastern grid splits the country in two. Most of Bangladesh goes dark on a Tuesday afternoon.',
    people: 'About 140 million',
    duration: 'Up to 7–8 hours in Dhaka',
    summary: [
      'Shortly after 2 pm, a disturbance in the eastern part of the grid, around the Ashuganj and Ghorashal power hubs, tripped 230 kV transmission. The east, rich in gas-fired generation, and the west and north, which import power across the Jamuna, pulled apart.',
      'Generators across the eastern hub tripped, and frequency collapsed in the islands that were short of supply. Most of the country lost power, including Dhaka, its garment factories and its water pumps.',
      'Restoration started from hydro at Kaptai and generation that had stayed on in the north-west. Parts of Dhaka were back within a few hours; the city was fully restored late that night.',
    ],
    causes: [
      'Initial reports pointed to tripping in the 230 kV network between Ashuganj and Ghorashal, in the eastern grid.',
      'East–west transfer across the Jamuna crossing was high, so splitting the grid left large imbalances on both sides.',
      'Gas-fired plant around Ashuganj tripped, and under-frequency load shedding was not enough to arrest the fall.',
    ],
    lessons: [
      'Wide-area protection and controlled islanding can keep each side of a split in balance.',
      'Load shedding has to be fast and large enough for the worst credible separation, not the average day.',
    ],
    sources: [
      'Power Grid Company of Bangladesh (PGCB) probe committee findings, as reported by The Daily Star and Dhaka Tribune, October 2022.',
      'Power Division, Government of Bangladesh, statements on 4–5 October 2022.',
    ],
    lead: 20,
    span: 150,
    setup: (s) => {
      // thin reserve and patchy load shedding, as described in post-event analysis
      s.responseShare = 0.2;
      s.dispatch(undefined, 1.03);
      s.settle(30);
      s.uflsWorks = 0.3;
    },
    steps: [
      {
        t: 20, clock: '14:04:10', kind: 'trigger', label: 'A 230 kV circuit between Ashuganj and Ghorashal trips in the eastern grid.',
        run: (s, h) => h.tripBetween('Ashuganj', [24.04, 91.0], 'Ghorasal', [23.97, 90.64], 'fault on the 230 kV Ashuganj–Ghorashal circuit'),
      },
      {
        t: 21.2, clock: '14:04:11', kind: 'consequence', label: 'Power swings across the Jamuna. The east–west corridor separates.',
        cond: (s) => s.branches.some((b) => b.closed && b.loading > 1.15),
        run: (s, h) => h.tripCut([25.6, 89.75], [22.6, 90.1], 'out-of-step protection on the east–west corridor', 6),
      },
      {
        t: 22.4, clock: '14:04:12', kind: 'consequence', label: 'Gas-fired units at the Ashuganj hub trip.',
        cond: (s) => Math.abs(s.frequency - 50) > 0.6,
        run: (s, h) => {
          h.tripPlant('Ashuganj North', 24.04, 91.0, 'unit protection during the disturbance');
          h.tripPlant('Ashuganj East', 24.04, 91.0, 'unit protection during the disturbance');
        },
      },
      {
        t: 30, clock: '14:04:20', kind: 'consequence', label: 'Generators across the country trip on under-frequency. The national grid collapses.',
        cond: (s) => lowF(s, 49.0),
        run: (s) => {
          const on = s.gens.map((g, i) => ({ g, i })).filter((x) => x.g.online).sort((a, b) => b.g.p - a.g.p);
          const total = on.reduce((a, x) => a + x.g.p, 0);
          let lost = 0;
          for (const x of on) {
            if (lost > total * 0.5) break;
            lost += x.g.p;
            s.tripGen(x.i, 'under-frequency protection');
          }
        },
      },
      {
        t: 26, clock: '14:04:16', kind: 'consequence', label: 'The Bheramara HVDC link to India blocks as voltage in the west collapses.',
        cond: (s) => s.buses[s.ext.bus].V < 0.85 || lowF(s, 48.6),
        run: (s) => s.tripExt('converter blocked on low AC voltage'),
      },
    ],
  },
  // ------------------------------------------------------------------ Bangladesh 2014
  {
    id: 'bangladesh-2014',
    region: 'dhaka',
    title: 'Bangladesh blackout, HVDC trip',
    where: 'Bangladesh',
    date: '1 November 2014',
    time: '11:27 BST',
    hook: 'The new link to India drops out. A thin grid with little spare capacity collapses in seconds.',
    people: 'About 150 million',
    duration: 'Around 12 hours, longer in places',
    summary: [
      'In 2014 Bangladesh imported up to about 500 MW from India through the back-to-back HVDC station at Bheramara, commissioned the year before.',
      'Late on a Saturday morning the link tripped. The import was a large share of a small system, and the remaining plants could not pick it up fast enough. Frequency collapsed and the national grid went down.',
      'This replay runs on today’s network, scaled to 2014 demand.',
    ],
    causes: [
      'Loss of the Bheramara HVDC import.',
      'Too little spinning reserve on the remaining plant and load shedding that did not operate as designed.',
      'The investigation also cited weaknesses in protection coordination and maintenance.',
    ],
    lessons: [
      'Size reserve for the largest single infeed, including interconnectors.',
      'Test under-frequency relays regularly; a scheme that exists on paper does not stop a collapse.',
    ],
    sources: [
      'Government probe committee report on the 1 November 2014 grid failure, as reported by bdnews24.com and The Daily Star.',
    ],
    lead: 15,
    span: 90,
    setup: (s) => {
      s.loadScale = 0.55;
      s.dispatch(450, 1.0);
      s.settle(30);
      s.uflsWorks = 0.3;
    },
    steps: [
      {
        t: 15, clock: '11:27:00', kind: 'trigger', label: 'The Bheramara HVDC station trips, cutting about 450 MW of imports from India.',
        run: (s) => s.tripExt('HVDC station trip'),
      },
      {
        t: 19, clock: '11:27:04', kind: 'consequence', label: 'Two of the largest running plants trip during the frequency decline.',
        cond: (s) => lowF(s, 49.4),
        run: (s) => {
          s.gens
            .map((g, i) => ({ g, i }))
            .filter(({ g }) => g.online)
            .sort((a, b) => b.g.p - a.g.p)
            .slice(0, 2)
            .forEach(({ i }) => s.tripGen(i, 'tripped during the frequency decline'));
        },
      },
    ],
  },
  // ------------------------------------------------------------------ GB 2019
  {
    id: 'gb-2019',
    region: 'london',
    title: 'Great Britain, lightning and two trips',
    where: 'England and Wales',
    date: '9 August 2019',
    time: '16:52 BST',
    hook: 'One lightning strike. An offshore wind farm and a gas plant both misbehave. A million customers cut off by automatic load shedding.',
    people: 'About 1.1 million customers',
    duration: 'Up to 45 minutes, trains much longer',
    summary: [
      'At 16:52:33 lightning struck the Eaton Socon–Wymondley 400 kV line. The fault cleared normally in under a tenth of a second.',
      'But the voltage dip made the Hornsea One offshore wind farm cut its output by 737 MW, and a steam turbine at Little Barford tripped (244 MW). About 500 MW of small embedded generation also disconnected on loss-of-mains protection.',
      'Frequency fell to 49.1 Hz and was recovering when a gas turbine at Little Barford tripped, then another. Frequency dropped to 48.8 Hz and low-frequency demand disconnection cut 931 MW of demand, about 5 % of the country. Some trains could not restart without a technician.',
    ],
    causes: [
      'Two large generators failed to ride through a routine fault.',
      'Embedded generation with sensitive RoCoF and vector-shift settings made the loss bigger.',
      'The combined loss exceeded the 1,000 MW the system was secured against.',
    ],
    lessons: [
      'Fault ride-through compliance matters as much as capacity.',
      'GB later changed loss-of-mains settings on tens of thousands of small generators.',
    ],
    sources: [
      'National Grid ESO, Technical Report on the events of 9 August 2019, September 2019.',
      'Ofgem, 9 August 2019 power outage report, January 2020.',
    ],
    lead: 15,
    span: 120,
    setup: (s, h) => {
      // GB held about 1 GW of primary response that afternoon
      s.responseShare = 0.06;
      // Little Barford was running at about 640 MW that afternoon
      const lb = h.plant('Little Barford', 52.21, -0.27, 'gas');
      if (lb >= 0) {
        s.gens[lb].online = true;
        s.gens[lb].sched = 640;
        s.gens[lb].tripReason = undefined;
      }
      s.settle(30);
    },
    steps: [
      {
        t: 15, clock: '16:52:33', kind: 'trigger', label: 'Lightning strikes the Eaton Socon–Wymondley 400 kV line. Protection clears it in 70 ms.',
        run: (s, h) => {
          h.tripBetween('Eaton Socon', [52.22, -0.29], 'Wymondley', [51.94, -0.24], 'lightning strike, single-phase fault');
          s.at(s.t + 20, (s2) => {
            const i = s2.branches.findIndex((b) => b.tripped?.includes('lightning'));
            if (i >= 0) s2.closeBranch(i);
          });
        },
      },
      {
        t: 15.3, clock: '16:52:33', kind: 'consequence', label: 'Hornsea One offshore wind farm reduces output by 737 MW: its voltage control oscillates.',
        run: (s, h) => {
          const i = h.plant('Hornsea', 53.88, 1.79, 'wind');
          let local = 0;
          if (i >= 0 && /hornsea/i.test(s.gens[i].def.name)) {
            local = Math.min(737, s.gens[i].p);
            s.derateGen(i, local / Math.max(1, s.gens[i].p), 'unstable voltage control after the fault');
          }
          if (737 - local > 1) h.extLoss(737 - local, 'Hornsea One offshore wind farm reduced its output: unstable voltage control after the fault');
        },
      },
      {
        t: 15.6, clock: '16:52:34', kind: 'consequence', label: 'Little Barford steam turbine trips (244 MW). About 500 MW of embedded generation disconnects.',
        run: (s, h) => {
          h.deratePlant('Little Barford', 52.21, -0.27, 0.33, 'steam turbine trip, speed sensor discrepancy');
          s.loadStep(500);
          s.raise('Embedded generation lost', 'About 500 MW of small generators tripped on loss-of-mains protection.', 'minor');
        },
      },
      {
        t: 72, clock: '16:53:31', kind: 'consequence', label: 'Little Barford gas turbine 1a trips (210 MW). Frequency falls to 48.8 Hz.',
        run: (s, h) => h.deratePlant('Little Barford', 52.21, -0.27, 0.5, 'gas turbine 1a tripped on high steam pressure'),
      },
      {
        t: 74, clock: '16:53:33', kind: 'consequence', label: 'Frequency reaches 48.8 Hz. Low-frequency demand disconnection cuts 931 MW.',
        run: (s) => {
          // LFDD stage 1 operated across England and Wales; most of it lies outside this study area
          s.ext.shed += 650;
          s.shedLoad(0.02);
          s.raise('Low-frequency demand disconnection', 'About 931 MW of demand, around 1.1 million customers, disconnected automatically at 48.8 Hz.', 'major');
        },
      },
      {
        t: 101, clock: '16:54:00', kind: 'consequence', label: 'The second Little Barford gas turbine is shut down (187 MW).',
        run: (s, h) => h.tripPlant('Little Barford', 52.21, -0.27, 'gas turbine 1b tripped manually after the steam turbine loss', 'gas'),
      },
    ],
  },
  // ------------------------------------------------------------------ NYC 2003
  {
    id: 'northeast-2003',
    region: 'newyork',
    title: 'Northeast blackout',
    where: 'North-eastern US and Ontario',
    date: '14 August 2003',
    time: '16:10 EDT',
    hook: 'A software bug and an untrimmed tree in Ohio. Two hours later New York City is dark.',
    people: '50 million',
    duration: 'About 29 hours for all of New York City',
    summary: [
      'The cascade began in northern Ohio. A software failure left FirstEnergy operators without alarms, and from 15:05 several 345 kV lines sagged into trees and tripped one after another.',
      'At 16:06 the cascade became unstoppable. Power swung through Michigan, Ontario, New York and New Jersey as the interconnection tore apart.',
      'At about 16:10 the New York City area separated with a large deficit of local generation. Frequency collapsed and the city went dark at rush hour.',
    ],
    causes: [
      'Inadequate tree trimming under 345 kV lines in Ohio.',
      'Alarm system failure and poor situational awareness at the control centre.',
      'Zone 3 distance relays tripping on load during power swings, spreading the cascade.',
    ],
    lessons: [
      'Mandatory, enforceable reliability standards in North America (NERC), introduced after this event.',
      'Vegetation management and real-time situational awareness tools.',
    ],
    sources: ['U.S.–Canada Power System Outage Task Force, Final Report on the August 14, 2003 Blackout, April 2004.'],
    lead: 15,
    span: 90,
    setup: (s) => {
      s.dispatch(2600);
      s.settle(30);
    },
    steps: [
      {
        t: 15, clock: '16:10:00', kind: 'trigger', label: 'Power swings arrive from the west as Ohio and Michigan separate.',
        run: (s, h) => h.extLoss(Math.round(s.ext.MW * 0.25), 'Cascade in Ohio and Michigan; the interconnection is tearing apart.'),
      },
      {
        t: 22, clock: '16:10:39', kind: 'consequence', label: 'New York separates from the rest of the Eastern Interconnection.',
        run: (s) => s.tripExt('separation of the New York system during the cascade'),
      },
    ],
  },
  // ------------------------------------------------------------------ NYC 1977
  {
    id: 'newyork-1977',
    region: 'newyork',
    title: 'New York City blackout',
    where: 'New York City',
    date: '13 July 1977',
    time: '20:37 EDT',
    hook: 'Lightning hits the lines north of the city four times in an hour. Con Edison runs out of ways in.',
    people: 'About 9 million',
    duration: 'About 25 hours',
    summary: [
      'At 20:37 lightning struck near the Buchanan South substation on the Hudson, tripping two 345 kV lines and taking Indian Point 3 off line. A second strike tripped two more 345 kV lines.',
      'The remaining ties carrying power into the city overloaded. Operators tried to shed load and start reserve generation but could not move fast enough.',
      'At 21:36, an hour after the first strike, the last ties tripped. Con Edison’s system collapsed and the city went dark through a hot summer night.',
    ],
    causes: [
      'Multiple lightning strikes on 345 kV lines into the city.',
      'Heavy reliance on imports through a few corridors.',
      'Slow manual load shedding and reserve generation that failed to start.',
    ],
    lessons: ['Automatic load shedding schemes and stricter import limits for New York City.'],
    sources: ['U.S. Department of Energy, The Con Edison Power Failure of July 13 and 14, 1977, staff report, June 1978.'],
    lead: 10,
    span: 900,
    setup: (s) => {
      s.dispatch(3500);
      s.settle(30);
    },
    steps: [
      {
        t: 10, clock: '20:37', kind: 'trigger', label: 'Lightning at Buchanan South trips two 345 kV lines. Indian Point 3 goes off line.',
        run: (s, h) => {
          h.tripAt('Buchanan', 41.27, -73.95, 2, 'lightning strike');
          h.tripPlant('Indian Point', 41.27, -73.95, 'unit tripped with its transmission outlet', 'nuclear');
        },
      },
      {
        t: 120, clock: '20:55', kind: 'trigger', label: 'A second strike trips two more 345 kV lines from the north.',
        run: (s, h) => h.tripAt('Sprain Brook', 40.96, -73.85, 2, 'lightning strike'),
      },
      {
        t: 400, clock: '21:19', kind: 'consequence', label: 'Overloaded ties into the city trip.',
        cond: (s) => s.branches.some((b) => b.closed && b.loading > 1.1),
        run: (s, h) => h.tripCut([41.0, -74.3], [41.0, -73.3], 'overload on the remaining northern ties', 4),
      },
      {
        t: 700, clock: '21:36', kind: 'consequence', label: 'The last tie to Long Island trips. Con Edison is islanded and collapses.',
        cond: (s) => lowF(s, 59.6) || s.branches.some((b) => b.closed && b.loading > 1.1),
        run: (s) => s.tripExt('last ties opened'),
      },
    ],
  },
  // ------------------------------------------------------------------ Texas 2021
  {
    id: 'texas-2021',
    region: 'houston',
    title: 'Texas winter storm Uri',
    where: 'ERCOT, Texas',
    date: '15 February 2021',
    time: '01:25 CST',
    hook: 'Gas wells freeze, plants trip by the dozen. Operators have under nine minutes to shed load or lose Texas for weeks.',
    people: 'About 4.5 million homes',
    duration: 'Up to four days',
    summary: [
      'Arctic air pushed demand to a winter record while gas wells, pipelines and power plants froze. Generation tripped faster than operators could replace it.',
      'Shortly after 01:20 frequency began to fall. ERCOT ordered rolling outages, and kept ordering them, eventually shedding 20,000 MW at the peak.',
      'Frequency fell below 59.4 Hz for 4 minutes 37 seconds. Generators are only required to stay connected for nine minutes below 59.4 Hz. Had it lasted longer, the whole ERCOT grid could have collapsed and taken weeks to restart.',
    ],
    causes: [
      'Unweatherised generation and gas supply.',
      'Demand far above the extreme-weather forecast.',
      'Limited interconnection with neighbouring grids.',
    ],
    lessons: ['Mandatory cold-weather standards for generators and gas facilities (NERC EOP-012).'],
    sources: [
      'FERC and NERC staff, The February 2021 Cold Weather Outages in Texas and the South Central United States, November 2021.',
    ],
    lead: 20,
    span: 1500,
    setup: (s) => {
      s.ufGenRule = { f: 59.4, seconds: 540 };
      s.loadScale = 1.0;
      s.dispatch();
      s.settle(30);
    },
    steps: [
      ...[0, 1, 2, 3, 4, 5].map((k) => ({
        t: 20 + k * 90, clock: `01:${String(23 + k * 2).padStart(2, '0')}`, kind: 'trigger' as const,
        label: k === 0 ? 'Gas-fired units start tripping as fuel supply freezes.' : `Another ${k % 2 ? 'gas plant in Houston' : 'block of generation across ERCOT'} is lost to the cold.`,
        run: (s: RegionSim, h: Helpers) => {
          if (k % 2) {
            // a mid-sized local unit, not the largest one in this reduced model
            const gas = s.gens.map((g, i) => ({ g, i })).filter(({ g }) => g.online && g.def.kind === 'gas' && g.p > 50).sort((a, b) => a.g.p - b.g.p);
            const pick = gas[Math.floor(gas.length * 0.6)];
            if (pick) s.tripGen(pick.i, 'frozen fuel supply');
          } else h.extLoss(Math.round(s.ext.MW * 0.035), 'frozen instrumentation and gas supply across ERCOT');
        },
      })),
      ...[0, 1, 2, 3].map((k) => ({
        t: 60 + k * 110, clock: `01:${String(25 + k * 3).padStart(2, '0')}`, kind: 'operator' as const,
        label: k === 0 ? 'ERCOT orders rolling outages: 1,000 MW, then more.' : `ERCOT orders another round of rolling outages (${['3,000', '6,500', '10,500'][k - 1]} MW in total).`,
        run: (s: RegionSim) => {
          s.shedLoad(0.07);
          s.ext.shed += s.ext.MW * 0.05;
          s.note('warn', 'Operator: rolling outages ordered');
        },
      })),
    ],
  },
  // ------------------------------------------------------------------ Iberia 2025
  {
    id: 'iberia-2025',
    region: 'madrid',
    title: 'Iberian peninsula blackout',
    where: 'Spain and Portugal',
    date: '28 April 2025',
    time: '12:33 CEST',
    hook: 'Not too little power but too much voltage. In 20 seconds the whole peninsula is dark.',
    people: 'About 55–60 million',
    duration: 'Most supply back within 10–16 hours',
    summary: [
      'On a sunny spring midday, with solar supplying much of Spain, the grid had already seen oscillations at 12:03 and 12:19. Operators had taken actions that left voltages high.',
      'From 12:32:57, generation in southern Spain began tripping, around 2.2 GW within 20 seconds, while voltages rose. Each trip removed voltage control and pushed voltages higher, tripping more plant on overvoltage.',
      'At 12:33:21 the peninsula lost synchronism with France. Frequency and voltage collapsed, and Spain and Portugal went black.',
    ],
    causes: [
      'A cascade of overvoltage disconnections of generation in southern Spain.',
      'Insufficient dynamic voltage control on the system at the time.',
      'The investigation is complete on the facts; root-cause analysis was still being published in stages.',
    ],
    lessons: ['Voltage control is a service the grid has to buy and schedule, just like inertia and reserve.'],
    sources: [
      'ENTSO-E Expert Panel, 28 April 2025 Iberian Blackout, factual report, 2025.',
      'Government of Spain, committee report on the 28 April 2025 incident, June 2025.',
    ],
    lead: 15,
    span: 80,
    setup: (s) => {
      s.loadScale = 0.85;
      s.dispatch(1200);
      s.settle(30);
    },
    steps: [
      {
        t: 15, clock: '12:32:57', kind: 'trigger', label: 'Generation in southern Spain starts tripping. Voltages rise.',
        run: (s, h) => {
          h.extLoss(355, 'plant tripped in Granada');
          s.addShunt(0.6);
        },
      },
      {
        t: 31, clock: '12:33:16', kind: 'consequence', label: 'Solar and wind in Badajoz and Seville disconnect: another 1.8 GW.',
        run: (s, h) => {
          h.extLoss(1800, 'overvoltage disconnection of renewables in Badajoz and Seville');
          s.addShunt(0.9);
        },
      },
      {
        t: 34, clock: '12:33:19', kind: 'consequence', label: 'Overvoltage spreads. Plants in the Madrid area trip.',
        cond: (s) => s.buses.some((b) => b.live && b.V > 1.1),
        run: (s, h) => {
          s.addShunt(1.2);
          h.extLoss(2500, 'cascade of overvoltage trips across the peninsula');
        },
      },
      {
        t: 36, clock: '12:33:21', kind: 'consequence', label: 'The peninsula loses synchronism with France.',
        run: (s, h) => h.extLoss(4000, 'loss of synchronism with France; imports collapse'),
      },
    ],
  },
  // ------------------------------------------------------------------ India 2012
  {
    id: 'india-2012',
    region: 'delhi',
    title: 'India northern grid collapse',
    where: 'Northern, Eastern and North-Eastern India',
    date: '31 July 2012',
    time: '13:00 IST',
    hook: 'The largest blackout in history. 620 million people, half of India, lose power for the second day running.',
    people: 'About 620 million',
    duration: 'Most restored within about 15 hours',
    summary: [
      'A weak monsoon had pushed up demand in northern India, and states were drawing more power than scheduled from neighbouring regions.',
      'On both 30 and 31 July, the 400 kV Bina–Gwalior line, one of the few links still carrying power north, tripped when relays mistook the heavy load for a fault. The Northern Region separated from the Western Region while importing heavily.',
      'On 31 July the collapse spread to the Eastern and North-Eastern regions. Trains stopped, miners were trapped underground, and Delhi’s metro halted.',
    ],
    causes: [
      'Over-drawal by northern states against schedule.',
      'Several inter-regional lines out for maintenance or forced outages.',
      'Zone 3 distance relays tripping on load (load encroachment).',
    ],
    lessons: ['Wide-area monitoring with PMUs across India and stricter enforcement of schedules.'],
    sources: ['Enquiry Committee on Grid Disturbance in Northern Region on 30 July 2012 and in Northern, Eastern and North-Eastern Region on 31 July 2012, Ministry of Power, August 2012.'],
    lead: 15,
    span: 90,
    setup: (s) => {
      s.dispatch(3200);
      s.settle(30);
    },
    steps: [
      {
        t: 15, clock: '12:58:19', kind: 'trigger', label: 'The 400 kV Bina–Gwalior line trips on zone 3 load encroachment.',
        run: (s, h) => h.extLoss(Math.round(s.ext.MW * 0.12), 'Bina–Gwalior 400 kV trip; Northern Region loses its western import'),
      },
      {
        t: 18, clock: '12:59', kind: 'consequence', label: 'The Northern Region separates from the rest of India.',
        run: (s, h) => h.extLoss(Math.round(s.ext.MW * 0.1), 'Northern Region islanded while importing'),
      },
      {
        t: 24, clock: '13:00', kind: 'consequence', label: 'Generators across the Northern Region trip on under-frequency. The grid collapses.',
        cond: (s) => lowF(s, 48.9),
        run: (s, h) => {
          h.extLoss(Math.round(s.ext.MW * 0.3), 'cascading generator trips across the Northern Region');
          s.gens.map((g, i) => ({ g, i })).filter((x) => x.g.online).sort((a, b) => b.g.p - a.g.p).slice(0, 4).forEach((x) => s.tripGen(x.i, 'under-frequency protection'));
        },
      },
    ],
  },
  // ------------------------------------------------------------------ Italy 2003
  {
    id: 'italy-2003',
    region: 'rome',
    title: 'Italy blackout',
    where: 'Italy',
    date: '28 September 2003',
    time: '03:01 CEST',
    hook: 'A tree in a Swiss valley. Twenty-four minutes later, all of Italy is dark at 3:25 am.',
    people: 'About 56 million',
    duration: 'Up to 18 hours',
    summary: [
      'Italy was importing about 6.4 GW from its neighbours overnight. At 03:01 the Lukmanier 380 kV line in Switzerland flashed over to a tree and tripped.',
      'Its flow moved onto the parallel San Bernardino line, which sagged and also flashed over at 03:25. The remaining lines into Italy tripped within seconds and Italy separated from Europe.',
      'Without the imports, frequency fell to 47.5 Hz within about two and a half minutes. Load shedding could not keep up, generators tripped, and the country went dark.',
    ],
    causes: [
      'Tree contact on heavily loaded Swiss 380 kV lines.',
      'Slow coordination between Swiss and Italian operators to reduce the import.',
      'Generators tripping early during the frequency decline.',
    ],
    lessons: ['Coordinated security assessment across European borders and the creation of regional security coordinators.'],
    sources: ['UCTE, Final Report of the Investigation Committee on the 28 September 2003 Blackout in Italy, April 2004.'],
    lead: 15,
    span: 300,
    setup: (s) => {
      s.loadScale = 0.85;
      s.dispatch(800);
      s.settle(30);
    },
    steps: [
      {
        t: 15, clock: '03:01:42', kind: 'trigger', label: 'The Lukmanier 380 kV line in Switzerland flashes over to a tree.',
        run: (s) => s.note('warn', 'Lukmanier (Mettlen–Lavorgo) 380 kV tripped in Switzerland. Flow shifts to San Bernardino.'),
      },
      {
        t: 120, clock: '03:25:21', kind: 'trigger', label: 'San Bernardino trips. Italy separates from Europe while importing 6.4 GW.',
        run: (s, h) => h.extLoss(6400, 'Italy separated from the European grid'),
      },
      {
        t: 170, clock: '03:26', kind: 'consequence', label: 'Generators across Italy trip early as frequency falls.',
        cond: (s) => lowF(s, 48.5),
        run: (s, h) => h.extLoss(3000, 'early generator trips on under-frequency'),
      },
    ],
  },
  // ------------------------------------------------------------------ South Australia 2016
  {
    id: 'sa-2016',
    region: 'adelaide',
    title: 'South Australia system black',
    where: 'South Australia',
    date: '28 September 2016',
    time: '16:16 ACST',
    hook: 'Tornadoes flatten three transmission lines. Wind farms ride through five faults, then quit on the sixth.',
    people: 'About 850,000 customers',
    duration: 'Most restored within 8 hours',
    summary: [
      'Two tornadoes with winds over 190 km/h hit the mid-north of South Australia, bringing down towers on three 275 kV lines.',
      'Six voltage dips hit the grid in under two minutes. Nine wind farms had protection settings that limited how many faults they would ride through, and they reduced output by 456 MW.',
      'The lost wind was replaced instantly by imports over the Heywood interconnector from Victoria, which overloaded and tripped. South Australia was left on its own with far too little generation, and frequency collapsed in under a second.',
    ],
    causes: ['Storm damage to 275 kV lines.', 'Wind farm ride-through settings unknown to the operator.', 'The interconnector protection operating as designed, islanding the state.'],
    lessons: ['Generator performance standards were tightened, and system strength and inertia became regulated requirements in Australia.'],
    sources: ['AEMO, Black System South Australia 28 September 2016, final report, March 2017.'],
    lead: 15,
    span: 120,
    setup: (s) => {
      s.dispatch(600);
      s.settle(30);
    },
    steps: [
      {
        t: 15, clock: '16:16:46', kind: 'trigger', label: 'Tornadoes bring down the Davenport–Belalie and Davenport–Mt Lock 275 kV lines.',
        run: (s, h) => {
          h.tripAt('Davenport', -32.48, 137.82, 1, 'transmission towers destroyed by tornado');
          h.tripAt('Belalie', -33.15, 138.53, 1, 'transmission towers destroyed by tornado');
        },
      },
      {
        t: 50, clock: '16:17:59', kind: 'trigger', label: 'The Brinkworth–Templers West line falls. A sixth fault in 88 seconds.',
        run: (s, h) => h.tripAt('Brinkworth', -33.69, 138.4, 1, 'transmission towers destroyed by tornado'),
      },
      {
        t: 51, clock: '16:18:08', kind: 'consequence', label: 'Nine wind farms cut 456 MW: their ride-through protection counted too many faults.',
        run: (s) => {
          let left = 456;
          for (const [i, g] of s.gens.entries()) {
            if (left <= 0) break;
            if (g.online && g.def.kind === 'wind' && g.p > 1) {
              const lose = Math.min(left, g.p);
              s.derateGen(i, lose / g.p, 'fault ride-through limit reached');
              left -= lose;
            }
          }
        },
      },
      {
        t: 52, clock: '16:18:15', kind: 'consequence', label: 'Heywood interconnector overloads and trips. South Australia is islanded.',
        cond: (s) => s.branches.some((b) => b.ext && b.closed && b.loading > 1),
        run: (s) => s.tripExt('loss of synchronism protection on the Heywood interconnector'),
      },
    ],
  },
  // ------------------------------------------------------------------ Hokkaido 2018
  {
    id: 'hokkaido-2018',
    region: 'sapporo',
    title: 'Hokkaido blackout after the earthquake',
    where: 'Hokkaido, Japan',
    date: '6 September 2018',
    time: '03:07 JST',
    hook: 'An earthquake knocks out half of the island’s biggest coal plant. Eighteen minutes later, the rest fails too.',
    people: 'About 2.95 million households',
    duration: 'About 45 hours for most supply',
    summary: [
      'At 03:07:59 a magnitude 6.7 earthquake struck eastern Iburi. Units 2 and 4 of the Tomato-Atsuma coal plant, the island’s largest, tripped, and lines tripped, cutting off hydro.',
      'Load shedding and the 600 MW HVDC link from Honshu held the frequency, and operators began to stabilise the island.',
      'At 03:25 unit 1 at Tomato-Atsuma tripped too, with boiler damage. With no reserve left, frequency collapsed and all of Hokkaido went black, the first full-area blackout in Japan’s history.',
    ],
    causes: ['Concentration of generation at one site close to the epicentre.', 'Small system with limited links to Honshu.'],
    lessons: ['A second, larger Hokkaido–Honshu HVDC link and stricter limits on how much of the island one plant can supply.'],
    sources: ['OCCTO, Third-Party Verification Committee report on the Hokkaido blackout, December 2018.'],
    lead: 15,
    span: 1200,
    setup: (s) => {
      s.loadScale = 0.85;
      s.dispatch(300);
      s.settle(30);
    },
    steps: [
      {
        t: 15, clock: '03:07:59', kind: 'trigger', label: 'Earthquake. Tomato-Atsuma units 2 and 4 trip. Lines trip, cutting off hydro.',
        run: (s, h) => {
          h.deratePlant('Tomato', 42.62, 141.82, 0.66, 'boiler and turbine trips in the earthquake', 'coal');
          h.tripAt('Tomato', 42.62, 141.82, 1, 'earthquake damage');
          s.setExt(600);
        },
      },
      {
        t: 1060, clock: '03:25', kind: 'consequence', label: 'Tomato-Atsuma unit 1 trips with boiler tube damage.',
        run: (s, h) => h.tripPlant('Tomato', 42.62, 141.82, 'boiler tube damage from the earthquake', 'coal'),
      },
    ],
  },
  // ------------------------------------------------------------------ Pakistan 2023
  {
    id: 'pakistan-2023',
    region: 'karachi',
    title: 'Pakistan nationwide blackout',
    where: 'Pakistan',
    date: '23 January 2023',
    time: '07:34 PKT',
    hook: 'A cold, quiet winter morning with plants switched off to save fuel. Voltage swings in the south take the whole country down.',
    people: 'About 220 million',
    duration: 'Up to 20 hours',
    summary: [
      'Demand is lowest on winter mornings, and many plants had been shut overnight to save fuel. With few machines online, the grid had little inertia and little voltage control.',
      'At 07:34 frequency and voltage began to swing in the southern part of the grid. Lines tripped, generators followed, and the disturbance cascaded across the national grid within seconds.',
      'Karachi, supplied partly through its links with the national grid, went dark with the rest of the country.',
    ],
    causes: ['Low demand with few units online.', 'High voltages on lightly loaded lines.', 'A cascade of line and generator trips in the south.'],
    lessons: ['Keep enough machines online for voltage and stability, not just for energy.'],
    sources: ['Government of Pakistan and NEPRA statements and inquiry reporting, January–February 2023.'],
    lead: 15,
    span: 120,
    setup: (s) => {
      s.loadScale = 0.55;
      s.dispatch(700);
      s.settle(30);
    },
    steps: [
      {
        t: 15, clock: '07:34', kind: 'trigger', label: 'Voltage swings in the southern grid. Lightly loaded 500 kV lines push voltage up.',
        run: (s, h) => {
          s.addShunt(0.8);
          h.tripAt('Jamshoro', 25.43, 68.28, 1, 'protection operated during voltage swings');
        },
      },
      {
        t: 20, clock: '07:34:05', kind: 'consequence', label: 'Generators across the south trip.',
        run: (s, h) => h.extLoss(Math.round(s.ext.MW * 0.3), 'cascade of generator trips in the national grid'),
      },
      {
        t: 23, clock: '07:34:08', kind: 'consequence', label: 'Karachi separates from the national grid.',
        run: (s) => s.tripExt('separation from the NTDC grid'),
      },
    ],
  },
];

for (const e of EVENTS) e.steps.sort((a, b) => a.t - b.t);

export const eventById = (id: string) => EVENTS.find((e) => e.id === id);
export const eventsFor = (region: string) => EVENTS.filter((e) => e.region === region);

/** Prepare a simulator for an event replay. */
export function stageEvent(s: RegionSim, ev: BlackoutEvent, mode: 'watch' | 'control') {
  const h = helpers(s);
  ev.setup(s, h);
  for (const st of ev.steps) {
    s.at(st.t, (sim) => {
      if (mode === 'control' && st.kind === 'consequence' && st.cond && !st.cond(sim)) {
        sim.note('info', `Averted: ${st.label}`);
        return;
      }
      if (mode === 'control' && st.kind === 'operator') return;
      st.run(sim, h);
    }, st.label);
  }
  return h;
}
