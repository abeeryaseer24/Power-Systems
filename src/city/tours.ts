// Guided walkthroughs: each step sets the clock, the camera and the
// selection, may run a what-if, and explains what you are looking at. The
// text is written for any city; {city} is replaced with its name.

import type { CityEngine, CityOpts } from './engine';
import type { Pick } from './TwinScene';
import type { Sector } from './demand';

export type TourApi = {
  seek: (h: number) => void;
  select: (p: Pick | null, fly?: boolean) => void;
  view: (v: 'city' | 'metro' | 'overhead') => void;
  highlight: (s: Sector | null) => void;
  flow: (on: boolean) => void;
  rerun: (fn: (e: CityEngine) => void, msg?: string) => Promise<void>;
};

export type TourStep = { title: string; body: string; go: (e: CityEngine, api: TourApi) => void | Promise<void> };
type Mode = 'day' | 'metro' | 'telecom' | 'ev' | 'water';

const biggest = (e: CityEngine) => [...e.city.districts].sort((a, b) => b.pop - a.pop)[0];
const subOfBiggest = (e: CityEngine) => biggest(e).sub;
const reset = async (e: CityEngine, api: TourApi, o: Partial<CityOpts> = {}) => {
  if (e.trips.size || Object.keys(o).length) await api.rerun((en) => { en.trips.clear(); en.setOpts(o, false); }, 'Setting up the next step');
};

export const TOURS: Record<Mode, TourStep[]> = {
  day: [
    { title: 'A city asleep', body: 'At 4 in the morning {city} still draws a lot of power: fridges, street lights, water pumps, hospitals, and in hot weather the bedroom air conditioners that run all night. This floor under the curve is the base load that big, steady power stations are built for.', go: async (e, a) => { await reset(e, a, { special: 'none' }); a.seek(4); a.view('city'); a.highlight(null); } },
    { title: 'The morning ramp', body: 'From six o’clock people wake, cook and get ready; then offices and shops open. Watch the home windows light up first, then the office towers. Grid operators have to bring plants up to follow this ramp minute by minute.', go: (e, a) => { a.seek(7.4); a.highlight('res'); } },
    { title: 'Afternoon heat', body: 'By mid-afternoon the offices and shops are full and their chillers are fighting the hottest part of the day. Highlighted: commercial buildings. In hot cities this is often the second-largest block of demand.', go: (e, a) => { a.seek(14.5); a.highlight('com'); } },
    { title: 'The evening peak', body: 'Everyone gets home at once: lights, fans, air conditioners, cooking and TVs together, while the street lights come on. This is the moment the whole grid is sized for. Every lit window you see is a number from the demand model.', go: (e, a) => { a.seek(19.6); a.highlight('res'); a.select({ type: 'district', id: biggest(e).id }, true); } },
    { title: 'Look inside a district', body: 'The inspector on the right splits this district’s demand by sector, and shows the substation that feeds it and how close it is to its rating. Click any district, substation or train to see the same.', go: (e, a) => { a.highlight(null); } },
    { title: 'When the plan meets a special day', body: 'Special days reshape the curve: a World Cup final makes the whole city boil kettles at half-time; Eid empties it; an eclipse takes the rooftop solar away for two hours. Here is the final: look at the spike at 20:47.', go: async (e, a) => { await a.rerun((en) => en.setOpts({ special: 'final' }, false), 'Kick-off'); a.seek(20.7); a.select(null); a.view('city'); } },
  ],
  metro: [
    { title: 'Rush hour on the line', body: 'At the morning peak trains run every few minutes. Each one draws several megawatts while it accelerates out of a station, and almost nothing while it cruises. The yellow glow above each train is its power: brighter means more.', go: async (e, a) => { await reset(e, a); a.seek(8.2); a.view('metro'); a.flow(true); } },
    { title: 'A train pulling away', body: 'This train is accelerating: its motors take up to their full power until it reaches line speed. The inspector shows its speed, the power it draws, its pantograph voltage and how full it is: heavier trains need more power.', go: (e, a) => { const tr = e.sim.trains.find((t) => t.phase === 'accel') ?? e.sim.trains[0]; if (tr) a.select({ type: 'train', id: tr.id }, true); } },
    { title: 'Braking trains feed the line', body: 'When a train brakes, its motors become generators and push power back into the overhead line, glowing blue. If another train nearby is accelerating, it takes that power. If none is, the energy is burnt in resistors on the roof. Timetables are tuned to make these meet.', go: (e, a) => { const tr = e.sim.trains.find((t) => t.phase === 'brake'); if (tr) a.select({ type: 'train', id: tr.id }, true); } },
    { title: 'Substations share the work', body: 'Traction substations convert the city’s AC supply to DC every couple of kilometres. A train draws from the substations either side of it, more from the nearer one. The particles flowing along the line move at the speed the DC load flow calculates.', go: (e, a) => { let best = { line: 0, idx: 0, p: -1 }; e.sim.lines.forEach((l, li) => l.tss.forEach((t, ti) => { if (t.p > best.p) best = { line: li, idx: ti, p: t.p }; })); a.select({ type: 'tss', line: best.line, idx: best.idx }, true); } },
    { title: 'Voltage sags between them', body: 'The voltage profile above the timeline dips where trains are pulling hard far from a substation. Below 1,200 V (on a 1500 V line) trains are not allowed full power; below 1,000 V they get none. Engineers space substations to keep the sag out of that zone.', go: (e, a) => { a.select(null); } },
    { title: 'What if one fails?', body: 'Here the busiest substation is out for the whole day. Its neighbours now carry its load, and the voltage between them sags much lower: compare the dashed line in the chart (normal) with the solid one.', go: async (e, a) => { let best = { line: 0, idx: 0, p: -1 }; e.sim.lines.forEach((l, li) => l.tss.forEach((t, ti) => { if (t.p > best.p) best = { line: li, idx: ti, p: t.p }; })); await a.rerun((en) => en.trip(`tss:${best.line}:${best.idx}`, true, [0, 24], false), 'Taking it out of service'); a.seek(8.3); } },
  ],
  telecom: [
    { title: 'A network you never think about', body: 'Every hexagon is a cell site, a mast with radios and a cabinet of batteries. On mains power they are nearly invisible here. Phones only work if the site has power and its fibre link to an exchange is up.', go: async (e, a) => { await reset(e, a); a.seek(17.5); a.view('city'); } },
    { title: 'The lights go out', body: 'The biggest area’s substation trips at 18:00. Its sites switch to their batteries in milliseconds: amber means on battery, getting darker as it drains. Violet sites have a diesel generator.', go: async (e, a) => { await a.rerun((en) => en.trip(subOfBiggest(en), true, [18, 24], false), 'Tripping the substation'); a.seek(18.15); } },
    { title: 'Batteries run down', body: 'Evening is the busiest time for phone traffic, so batteries drain fastest just when the outage hits. Older batteries hold less than their nameplate. Watch the sites go red one by one.', go: (e, a) => { a.seek(20.5); } },
    { title: 'One site up close', body: 'The inspector shows this site’s battery, when it will run flat at the current traffic, and which exchange its fibre runs to.', go: (e, a) => { const m = Math.floor(20.5 * 60); const i = e.net.sites.findIndex((_, k) => e.telecom.state[k * 1440 + m] === 1); if (i >= 0) a.select({ type: 'site', idx: i }, true); } },
    { title: 'Power comes back', body: 'At midnight the substation is restored. Sites come back on mains and their batteries begin recharging, which itself is extra load on the grid just as it recovers.', go: (e, a) => { a.select(null); a.seek(23.95); } },
  ],
  ev: [
    { title: 'Charging when people get home', body: 'Most electric cars charge at home, and most drivers plug in when they arrive in the evening, right on top of the city’s peak. The chart shows home, workplace and fast-hub charging separately.', go: async (e, a) => { await reset(e, a, { smartCharging: false, evShare: 0.08 }); a.seek(19.5); a.view('city'); } },
    { title: 'A fast-charging hub', body: 'Hubs have eight to sixteen 250 kW stalls but a transformer sized for about 60 % of that. When several cars arrive nearly empty, every car is slowed to share it. The inspector shows the cars charging, the queue and the site power.', go: (e, a) => { let best = 0, bm = -1; const m = Math.floor(19.5 * 60); e.hubs.forEach((_, k) => { const v = e.ev.hubMW[k * 1440 + m]; if (v > bm) { bm = v; best = k; } }); a.select({ type: 'evhub', idx: best }, true); } },
    { title: 'Three times as many EVs', body: 'With 30 % of cars electric, the evening charging peak triples, and lands exactly when the grid is already under the most strain.', go: async (e, a) => { a.select(null); await a.rerun((en) => en.setOpts({ evShare: 0.3 }, false), 'Adding electric cars'); a.seek(19.5); } },
    { title: 'Smart charging moves it', body: 'Smart charging tells home chargers to wait until after midnight. The same energy is delivered, but the peak moves into the night, when there is spare capacity.', go: async (e, a) => { await a.rerun((en) => en.setOpts({ smartCharging: true }, false), 'Switching on smart charging'); a.seek(2.5); } },
  ],
  water: [
    { title: 'Water runs on electricity', body: 'Every area has a pumping station lifting water into an elevated tank, and the tank feeds the taps by gravity. Demand peaks in the morning and the evening; pumps refill the tanks in between.', go: async (e, a) => { await reset(e, a); a.seek(7.5); a.view('city'); } },
    { title: 'An outage at dawn', body: 'The biggest area’s substation trips at 06:00, just as everyone wakes up. Its pumps stop. The tank keeps the taps running for a while, but it is draining at the morning-peak rate.', go: async (e, a) => { await a.rerun((en) => en.trip(subOfBiggest(en), true, [6, 20], false), 'Tripping the substation'); a.seek(9.5); } },
    { title: 'Upper floors first', body: 'When the tank falls below a quarter full, there is not enough pressure to push water to upper floors. The ground turns amber: low pressure.', go: (e, a) => { a.seek(11); const d = e.city.districts.findIndex((x) => x.sub === subOfBiggest(e)); if (d >= 0) a.select({ type: 'pump', idx: d }, true); } },
    { title: 'Taps run dry', body: 'Red: the tank is empty. Even once power returns at 20:00 it takes hours to refill, and the water company will issue boil notices because empty pipes can draw in dirty groundwater.', go: (e, a) => { a.select(null); a.seek(15); } },
  ],
};
