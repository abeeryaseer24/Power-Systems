// "What if" modifiers for the real-grid sandbox. Each one stages changes on a
// RegionSim before the run starts; several can be stacked.
import type { RegionSim, RegionPlant } from './region';
import { mulberry32 } from './profiles';

export interface WhatIf {
  id: string;
  title: string;
  blurb: string;
  /** Limit to certain regions (all if omitted). */
  regions?: string[];
  apply: (s: RegionSim) => void;
}

const busiest = (s: RegionSim, n: number) =>
  s.branches.map((b, i) => ({ b, i })).filter((x) => x.b.closed && !x.b.ext).sort((a, b) => Math.abs(b.b.P) - Math.abs(a.b.P)).slice(0, n).map((x) => x.i);

export const WHAT_IFS: WhatIf[] = [
  {
    id: 'heatwave', title: 'Heatwave', blurb: 'Demand up 25 %, line ratings down 12 % as conductors heat up.',
    apply: (s) => {
      s.at(5, (x) => {
        x.loadScale *= 1.25;
        x.branches.forEach((b) => (b.def.mva *= 0.88));
        x.note('warn', 'Heatwave: air conditioning pushes demand up 25 %; hot lines carry less.');
        x.raise('Heatwave', 'Demand jumps by a quarter while every line loses capacity.', 'minor');
      });
    },
  },
  {
    id: 'largest', title: 'Lose the largest plant', blurb: 'The biggest running generator trips without warning.',
    apply: (s) => s.at(10, (x) => {
      const g = x.gens.map((g, i) => ({ g, i })).filter((y) => y.g.online).sort((a, b) => b.g.p - a.g.p)[0];
      if (g) x.tripGen(g.i, 'what if: sudden trip');
    }),
  },
  {
    id: 'link', title: 'Cut the neighbours off', blurb: 'The connection to the wider grid or the HVDC link is lost.',
    apply: (s) => s.at(10, (x) => x.tripExt('what if: interconnection lost')),
  },
  {
    id: 'corridor', title: 'Cut the busiest corridor', blurb: 'The three most heavily loaded lines trip together.',
    apply: (s) => s.at(10, (x) => busiest(x, 3).forEach((i, k) => x.tripBranch(i, 'what if: corridor lost', k > 0))),
  },
  {
    id: 'storm', title: 'Storm', blurb: 'Lightning and wind take out a line every few seconds for a minute.',
    apply: (s) => {
      const rand = mulberry32(7);
      for (let k = 0; k < 8; k++) {
        s.at(8 + k * 7, (x) => {
          const open = x.branches.map((b, i) => ({ b, i })).filter((y) => y.b.closed && !y.b.ext);
          const pick = open[Math.floor(rand() * open.length)];
          if (pick) x.tripBranch(pick.i, 'storm damage', k > 0 && k < 7);
        });
      }
    },
  },
  {
    id: 'cyber', title: 'Cyberattack', blurb: 'Breakers at six substations are opened remotely at the same moment.',
    apply: (s) => s.at(12, (x) => {
      const rand = mulberry32(13);
      const subs = x.buses.map((b, i) => ({ b, i })).filter((y) => y.b.demand > 50).sort(() => rand() - 0.5).slice(0, 6);
      subs.forEach(({ i }) => x.branchesAt(i).forEach((bi) => x.tripBranch(bi, 'breaker opened remotely', true)));
      x.raise('Breakers opened remotely', `Six substations were disconnected at once by an attacker.`, 'major');
    }),
  },
  {
    id: 'flood', title: 'Flood a substation', blurb: 'The substation feeding the most demand is flooded and switched out.',
    apply: (s) => s.at(10, (x) => {
      const b = x.buses.map((b, i) => ({ b, i })).filter((y) => y.b.live).sort((a, c) => c.b.demand - a.b.demand)[0];
      if (!b) return;
      x.branchesAt(b.i).forEach((bi) => x.tripBranch(bi, 'substation flooded', true));
      x.raise(`${b.b.def.name} flooded`, 'Every circuit at the substation is switched out.', 'major');
    }),
  },
  {
    id: 'gas', title: 'Gas shortage', blurb: 'Gas-fired plants lose 40 % of their fuel.',
    apply: (s) => s.at(6, (x) => {
      x.gens.forEach((g, i) => g.online && g.def.kind === 'gas' && x.derateGen(i, 0.4, 'gas supply curtailed'));
    }),
  },
  {
    id: 'renewables', title: 'Run on renewables', blurb: 'Coal and gas units are run down to the minimum the system needs to stay stable.',
    apply: (s) => s.at(8, (x) => {
      const thermal = x.gens.map((g, i) => ({ g, i })).filter((y) => y.g.online && (y.g.def.kind === 'coal' || y.g.def.kind === 'gas' || y.g.def.kind === 'oil'));
      thermal.slice(1).forEach(({ i }) => x.setGen(i, 0));
      x.note('warn', 'Thermal plant run down: inertia and voltage support fall away.');
    }),
  },
  {
    id: 'battery', title: 'Grid-forming batteries',
    blurb: 'Batteries worth 8 % of demand at the four biggest load centres, holding frequency and voltage like a power station. Stack it with a disaster.',
    apply: (s) => {
      const total = s.demand * 0.08;
      const sites = s.data.buses.map((b, i) => ({ b, i })).filter((x) => x.b.load > 0 && s.buses[x.i].live).sort((a, c) => c.b.load - a.b.load).slice(0, 4);
      for (const [k, x] of sites.entries()) {
        const mw = Math.round(total / sites.length);
        s.addPlant({ name: `Grid-forming battery ${k + 1}`, kind: 'battery', mw, bus: x.i, x: x.b.x, z: x.b.z }, 0);
      }
      s.note('info', `Grid-forming batteries online: ${Math.round(total)} MW at ${sites.length} sites, idle until frequency moves.`);
    },
  },
  {
    id: 'rooppur', title: 'Rooppur comes online, then trips', blurb: 'A 1,200 MW unit at Rooppur joins the grid, then trips: the largest single loss Bangladesh has ever faced.',
    regions: ['dhaka'],
    apply: (s) => {
      const [lat0, lon0] = s.data.center;
      const x = (89.05 - lon0) * 111.32 * Math.cos((lat0 * Math.PI) / 180);
      const z = -(24.07 - lat0) * 110.57;
      const bus = s.data.buses.reduce((bi, b, i) => (Math.hypot(b.x - x, b.z - z) < Math.hypot(s.data.buses[bi].x - x, s.data.buses[bi].z - z) ? i : bi), 0);
      const def: RegionPlant = { name: 'Rooppur unit 1', kind: 'nuclear', mw: 1200, bus, x, z };
      s.addPlant(def, 1150);
      s.at(20, (sim) => {
        const i = sim.gens.findIndex((g) => g.def.name === 'Rooppur unit 1');
        if (i >= 0) sim.tripGen(i, 'reactor trip');
      });
    },
  },
];

export const whatIfsFor = (region: string) => WHAT_IFS.filter((w) => !w.regions || w.regions.includes(region));
