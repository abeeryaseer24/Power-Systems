import { GridSim } from './engine';
import type { Weather } from './profiles';

export interface Scenario {
  id: string;
  title: string;
  /** One-line hook for the shift board. */
  hook: string;
  /** Briefing read before the shift starts. */
  brief: string[];
  goal: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  startHour: number;
  endHour: number;
  season: string;
  weather: Weather;
  seed: number;
  linkPrice?: (h: number) => number;
  setup: (s: GridSim) => void;
}

const spring: Weather = { tMin: 7, tMax: 16, windMean: 9, windSigma: 2.5, cloud: 0.4, sunrise: 6.2, sunset: 19.6, demandScale: 1 };

/** Bring units online instantly (used before the shift starts). */
export function online(s: GridSim, id: string, n: number) {
  const p = s.plant(id);
  for (let i = 0; i < n && i < p.units.length; i++) {
    const u = p.units[i];
    if (u.unavailable) continue;
    u.status = 'online';
  }
}

function standardSetup(s: GridSim, opts: { coal?: number; ccgt?: number; ocgt?: number; hydro?: number; nuclear?: number }) {
  online(s, 'kestrel', opts.nuclear ?? 2);
  online(s, 'ridgeway', opts.coal ?? 1);
  online(s, 'harbour', opts.ccgt ?? 1);
  online(s, 'airport', opts.ocgt ?? 0);
  online(s, 'glen', opts.hydro ?? 1);
  for (const id of ['saltmarsh', 'sunfield', 'bess', 'westmark']) online(s, id, 1);
}

/** Settle governors and AGC so the shift opens in steady state. */
export function settle(s: GridSim) {
  s.scoring = false;
  // seed unit outputs at their dispatch so the warm-up starts near balance
  for (const p of s.plants) {
    const on = p.units.filter((u) => u.status === 'online');
    for (const u of on) u.sched = u.p = p.setpoint / on.length;
  }
  for (let i = 0; i < 2; i++) {
    s.step(0.05);
    s.suggestDispatch(0);
    for (const p of s.plants) {
      const on = p.units.filter((u) => u.status === 'online');
      for (const u of on) {
        const target = p.def.kind === 'wind' || p.def.kind === 'solar' ? Math.min(p.available, p.setpoint) : p.setpoint / on.length;
        u.sched = u.p = Math.max(Math.min(p.def.unitMin, p.def.unitMax), Math.min(p.def.unitMax, target));
      }
    }
  }
  const t0 = s.t;
  for (let i = 0; i < 3000; i++) s.step(0.1);
  s.t = t0;
  s.history = [];
  s.fTrace = [];
  s.log = [];
  s.events = [];
  s.scoring = true;
  s.score = { demand: 0, served: 0, cost: 0, co2: 0, inBand: 0, energizedTime: 0, fMin: 50, fMax: 50, blackouts: 0 };
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'tuesday',
    title: 'An ordinary Tuesday',
    hook: 'Spring weather, steady wind, and a cup final on TV at night.',
    brief: [
      'Nothing is scheduled to go wrong today. Halvern wakes up, goes to work and comes home, and demand follows it: a morning climb, a long flat afternoon, then the evening peak around 19:00.',
      'Solar fades out just as the city switches its ovens on. Plants with long start-up times need to be warmed up before you need them, not when you need them.',
      'The cup final ends at 21:45. When the whistle goes, a third of the city puts the kettle on at the same moment.',
    ],
    goal: 'Keep frequency between 49.8 and 50.2 Hz and every light on until 23:00.',
    difficulty: 1,
    startHour: 6,
    endHour: 23,
    season: 'Spring',
    weather: spring,
    seed: 11,
    setup: (s) => {
      standardSetup(s, { coal: 1, ccgt: 1 });
      s.addSurge('northside', 21.75, 6, 85);
      s.addSurge('eastside', 21.75, 6, 80);
      s.addSurge('oldtown', 21.75, 6, 55);
      s.addSurge('hillcrest', 21.75, 6, 45);
      s.at(21.74, (g) => g.note('warn', 'Control room TV: full time in the cup final. Expect a pickup of about 260 MW.'));
    },
  },
  {
    id: 'heatwave',
    title: 'Heatwave',
    hook: '39 °C in the shade. Air conditioners on, lines sagging, no wind.',
    brief: [
      'The hottest day in eleven years. Every office tower downtown is running chillers flat out, and the demand peak lands in mid-afternoon, not the evening.',
      'Hot conductors carry less current. Line ratings drop by around 15 % at the peak, so routes that are normally comfortable will run close to their limits.',
      'The river behind Ridgeway is warming up. If the cooling water gets too hot, the plant will have to cut output.',
    ],
    goal: 'Get through the afternoon peak without tripping a line, and keep unserved energy under 0.5 %.',
    difficulty: 3,
    startHour: 11,
    endHour: 22,
    season: 'Summer',
    weather: { tMin: 25, tMax: 39, windMean: 4.5, windSigma: 1.4, cloud: 0.05, sunrise: 5.1, sunset: 21.2, demandScale: 1 },
    seed: 23,
    linkPrice: (h) => (h > 13 && h < 19 ? 210 : 140),
    setup: (s) => {
      standardSetup(s, { coal: 2, ccgt: 2, hydro: 2 });
      s.at(15.3, (g) => g.tripUnit('ridgeway', 1, 'cooling water above 28 °C, river temperature limit'));
      s.at(16.65, (g) => g.tripLine('hill-east', 'conductor sagged into a tree', 0));
    },
  },
  {
    id: 'infeed',
    title: 'Largest infeed loss',
    hook: 'A routine evening, until the biggest machine on the system drops off.',
    brief: [
      'This shift is all about one moment. At some point this evening, a 600 MW nuclear unit will trip without warning.',
      'When it goes, frequency falls at a rate set by how much spinning mass is online. Fall too fast and rooftop solar relays read it as a fault and disconnect as well, making the loss bigger.',
      'You can prepare: hold enough reserve, keep the battery charged, and think about which machines give the system its inertia.',
    ],
    goal: 'Keep the frequency nadir above 49.2 Hz when the trip comes, and shed no load.',
    difficulty: 3,
    startHour: 16,
    endHour: 20,
    season: 'Autumn',
    weather: { tMin: 10, tMax: 18, windMean: 8.5, windSigma: 1.5, cloud: 0.25, sunrise: 6.9, sunset: 18.4, demandScale: 1 },
    seed: 37,
    setup: (s) => {
      standardSetup(s, { coal: 1, ccgt: 1, hydro: 1 });
      s.at(17.14, (g) => {
        g.tripUnit('kestrel', 0, 'reactor protection, main steam valve closure');
      });
      s.at(17.1403, (g) => {
        const w = g.plant('saltmarsh');
        const before = w.setpoint;
        g.setSetpoint('saltmarsh', Math.max(0, Math.min(before, w.available) - 260));
        g.note('alarm', 'Saltmarsh converter control instability: 260 MW of wind lost');
        g.raise('Saltmarsh partial trip', 'A converter control loop went unstable after the voltage disturbance. 260 MW of wind lost.', 'major');
      });
    },
  },
  {
    id: 'stillwinter',
    title: 'Still winter evening',
    hook: 'Freezing, overcast and windless. One coal unit is out for repairs.',
    brief: [
      'Below freezing, no wind and thick cloud. The renewables give you almost nothing tonight, and electric heating pushes the evening peak to the highest of the year.',
      'Ridgeway unit 1 is out for a boiler repair. Imports from Westmark are available but expensive at the peak.',
      'The interconnector cable is old. If you lean on it heavily, have a plan for when it is gone.',
    ],
    goal: 'Meet the peak at 18:00 with a reserve above 300 MW, keeping imports for when you need them.',
    difficulty: 4,
    startHour: 14,
    endHour: 22,
    season: 'Winter',
    weather: { tMin: -5, tMax: 1, windMean: 2.6, windSigma: 0.9, cloud: 0.92, sunrise: 8.1, sunset: 16.1, demandScale: 1.04 },
    seed: 41,
    linkPrice: (h) => (h > 16.5 && h < 20 ? 260 : 150),
    setup: (s) => {
      s.plant('ridgeway').units[0].unavailable = true;
      standardSetup(s, { coal: 2, ccgt: 2, hydro: 2 });
      s.plant('glen').stored = 2100;
      s.at(18.4, (g) => g.tripLine('west-old', 'cable fault on the Westmark circuit', 0));
      s.at(18.4001, (g) => {
        const l = g.plant('westmark');
        const lost = l.output;
        l.units[0].status = 'tripped';
        g.raise('Westmark link tripped', `HVDC converter blocked after the cable fault. ${Math.round(lost)} MW of imports lost.`, 'major');
      });
    },
  },
  {
    id: 'storm',
    title: 'Storm Brannagh',
    hook: 'Hurricane-force gusts. Too much wind, then none at all.',
    brief: [
      'A deep low is crossing the coast tonight. At first the offshore wind farm will run at full output and you will have more power than you need.',
      'As gusts pass 25 m/s the turbines feather and shut down one string at a time. The wind farm can go from 900 MW to zero in a few minutes.',
      'Lightning will hit the overhead lines. Most faults clear by themselves and the line recloses. Some will not.',
    ],
    goal: 'Ride through the storm shutdown with no blackout.',
    difficulty: 4,
    startHour: 19,
    endHour: 25,
    season: 'Autumn',
    weather: { tMin: 9, tMax: 13, windMean: 21, windSigma: 4.5, cloud: 1, sunrise: 7.2, sunset: 17.9, demandScale: 0.97 },
    seed: 53,
    setup: (s) => {
      standardSetup(s, { coal: 1, ccgt: 1, hydro: 1 });
      s.at(20.2, (g) => g.tripLine('kes-salt', 'lightning strike', 1.2));
      s.at(21.05, (g) => g.tripLine('ridge-north', 'lightning strike', 1.5));
      s.at(22.3, (g) => {
        g.weather = { ...g.weather, windMean: 27.5 };
        g.note('warn', 'Met office: gusts over 30 m/s at the coast for the next hour');
      });
      s.at(23.4, (g) => g.tripLine('salt-east', 'tower damaged by wind', 0));
      s.at(23.9, (g) => (g.weather = { ...g.weather, windMean: 16 }));
    },
  },
  {
    id: 'blackstart',
    title: 'Black start',
    hook: '02:13. The whole city is dark. Bring it back.',
    brief: [
      'A cascade an hour ago took down every generator in Halvern. There is no grid to lean on, and the nuclear units will take days to restart.',
      'Glen Dam can start without outside power. Start one hydro unit, and it forms a small live island. Every other plant needs that live voltage before it can synchronise.',
      'All district feeders are open. Reconnect demand in small blocks: each block pulls the frequency down, and a block that is too big will collapse your island.',
    ],
    goal: 'Have 90 % of Halvern back on supply by 08:00.',
    difficulty: 5,
    startHour: 2.2,
    endHour: 8,
    season: 'Spring',
    weather: { ...spring, windMean: 7 },
    seed: 61,
    setup: (s) => {
      for (const d of s.districts) d.connected = 0;
      for (const p of s.plants) p.setpoint = 0;
      for (const id of ['saltmarsh', 'sunfield', 'bess', 'westmark']) online(s, id, 1);
      for (const u of s.plant('kestrel').units) u.unavailable = true;
      s.plant('bess').stored = 120;
    },
  },
  {
    id: 'sandbox',
    title: 'Free shift',
    hook: 'A full day with no surprises. Try anything.',
    brief: [
      'Twenty-four hours of a mild spring day with no scripted faults. Open lines, trip your own plants, run the city on wind alone, or see how low the inertia can go before something breaks.',
    ],
    goal: 'No goal. Experiment.',
    difficulty: 1,
    startHour: 0,
    endHour: 24,
    season: 'Spring',
    weather: spring,
    seed: 7,
    setup: (s) => standardSetup(s, { coal: 1, ccgt: 1 }),
  },
];

export function createSim(sc: Scenario) {
  const s = new GridSim({ weather: sc.weather, seed: sc.seed, startHour: sc.startHour, endHour: sc.endHour, linkPrice: sc.linkPrice });
  const scheduled = s.scheduled;
  sc.setup(s);
  if (sc.id === 'blackstart') {
    for (const b of s.busF.keys()) s.busF[b] = 0;
    s.scoring = true;
    s.step(0.05);
    s.t = sc.startHour * 3600;
    s.log = [];
    s.events = [];
    s.history = [];
    s.score = { demand: 0, served: 0, cost: 0, co2: 0, inBand: 0, energizedTime: 0, fMin: 50, fMax: 50, blackouts: 0 };
    s.note('alarm', 'Total system blackout. All district feeders open. Glen Dam black-start units ready.');
  } else {
    const keep = scheduled.slice();
    s.scheduled = [];
    settle(s);
    s.scheduled = keep;
    s.note('info', `Shift started. Demand ${Math.round(s.districts.reduce((a, d) => a + d.demand, 0))} MW.`);
  }
  return s;
}

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id);
