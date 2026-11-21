// A large hospital in a blackout, modelled the way NFPA 99 / 110 and NEC 517
// lay out an essential electrical system:
//   - normal supply: two 11 kV feeders and two transformers
//   - essential system split into branches, each behind its own automatic
//     transfer switch (ATS): life safety, critical, equipment
//   - non-essential loads are shed while on generators, unless there is spare capacity
//   - Type 10 generators: life safety and critical restored within 10 s
//   - UPS on intensive care and theatres bridges the gap
// Two timescales: second by second for the first three minutes, minute by
// minute for 72 hours (fuel, refuelling, which loads stay on).

export type Branch = 'life' | 'critical' | 'equipment' | 'nonEss';
export const BRANCHES: { id: Branch; label: string; share: number; note: string; colour: string }[] = [
  { id: 'life', label: 'Life safety', share: 0.04, note: 'Exit signs, egress lighting, fire alarm, generator room. Must be back within 10 s.', colour: '#ff5b4f' },
  { id: 'critical', label: 'Critical', share: 0.22, note: 'Intensive care, theatres, emergency, labour ward, nurse calls, critical imaging. Back within 10 s; UPS covers the gap.', colour: '#ffb04d' },
  { id: 'equipment', label: 'Equipment', share: 0.3, note: 'Medical air and vacuum, critical ventilation, some lifts, sterilisation. Reconnected in steps after the critical branch.', colour: '#c9b8ff' },
  { id: 'nonEss', label: 'Non-essential', share: 0.44, note: 'General chillers and air handling, kitchens, laundry, offices, general lighting. Shed on generator unless there is spare capacity.', colour: '#86c5da' },
];

export type HospitalDef = { name: string; beds: number; peakMW: number; district: string };
export type HospitalOpts = {
  start: number; // outage start, hour of day
  duration: number; // hours
  gens: number; // number of generator sets
  genMW: number; // rating of each
  fuelH: number; // bulk fuel, hours at full rated output of one set
  failToStart: number; // sets that fail to start
  secondFeeder: boolean; // a second feeder from another substation
  refuel: boolean; // a tanker every 24 h
  upsMin: number; // UPS autonomy on critical loads, minutes
};
export const DEFAULT_HOSPITAL: HospitalOpts = { start: 18, duration: 36, gens: 3, genMW: 1.25, fuelH: 60, failToStart: 0, secondFeeder: false, refuel: false, upsMin: 15 };

// load shape over the day (fraction of peak): hospitals are flat, with a daytime hump
const SHAPE = [0.7, 0.68, 0.66, 0.66, 0.67, 0.7, 0.76, 0.84, 0.93, 0.98, 1.0, 1.0, 0.99, 1.0, 1.0, 0.98, 0.95, 0.9, 0.86, 0.83, 0.8, 0.77, 0.74, 0.72];
export const hospLoad = (def: HospitalDef, h: number) => {
  const x = ((h % 24) + 24) % 24, i = Math.floor(x), f = x - i;
  return def.peakMW * (SHAPE[i] + (SHAPE[(i + 1) % 24] - SHAPE[i]) * f);
};

export type Sec = { t: number; mains: boolean; gensOn: number; ups: number; on: Record<Branch, boolean>; atsPos: Record<Exclude<Branch, 'nonEss'>, 'normal' | 'open' | 'emergency'> };
export type Step = { t: number; title: string; body: string };

/** The first 180 seconds after the mains fail, second by second. */
export function firstMinutes(def: HospitalDef, o: HospitalOpts): { secs: Sec[]; steps: Step[] } {
  const steps: Step[] = [];
  const secs: Sec[] = [];
  if (o.secondFeeder) {
    steps.push({ t: 0, title: 'Feeder A lost', body: 'The local substation drops out. The main breaker on feeder A opens on undervoltage.' });
    steps.push({ t: 0.3, title: 'Transfer to feeder B', body: 'Feeder B comes from a different substation and is still live. The bus-section breaker closes in a few cycles. Most staff never notice.' });
    for (let t = 0; t <= 180; t++) secs.push({ t, mains: true, gensOn: 0, ups: 0, on: { life: true, critical: true, equipment: true, nonEss: true }, atsPos: { life: 'normal', critical: 'normal', equipment: 'normal' } });
    return { secs, steps };
  }
  const ok = Math.max(0, o.gens - o.failToStart);
  const cap = ok * o.genMW, L = hospLoad(def, o.start);
  const ess = L * (BRANCHES[0].share + BRANCHES[1].share);
  const eqp = L * BRANCHES[2].share, non = L * BRANCHES[3].share;
  const eqOK = cap >= ess + eqp, nonOK = cap >= ess + eqp + non * 1.15;
  steps.push({ t: 0, title: 'Mains lost', body: `Both 11 kV feeders come from the same substation and go dead together. Lights go out except battery emergency fittings. ${Math.round(L * 1000)} kW of load is suddenly unsupplied.` });
  steps.push({ t: 0.02, title: 'UPS takes the critical loads', body: `Ventilators, monitors and theatre equipment switch to UPS batteries within a cycle (${o.upsMin} min autonomy). Patients on life support see no interruption.` });
  steps.push({ t: 1, title: 'Generators crank', body: `The transfer switches sense lost voltage and signal ${o.gens} diesel sets to start.${o.failToStart ? ` ${o.failToStart} fail${o.failToStart > 1 ? '' : 's'} to start.` : ''}` });
  if (ok === 0) {
    steps.push({ t: 10, title: 'No generator available', body: 'Nothing has come up. Life safety and critical loads stay on battery fittings and UPS only. The UPS clock is now the hospital’s clock.' });
  } else {
    steps.push({ t: 8, title: `${ok} set${ok > 1 ? 's' : ''} at speed`, body: `Voltage and frequency are stable. ${Math.round(cap * 1000)} kW available against ${Math.round(L * 1000)} kW of normal load.` });
    steps.push({ t: 10, title: 'Life safety and critical transfer', body: 'Within the 10 seconds NFPA 110 allows, the life-safety and critical transfer switches move to the emergency bus. Corridors and theatres light up again; UPS batteries start recharging.' });
    if (eqOK) steps.push({ t: 25, title: 'Equipment branch reconnected', body: 'After a delay so the sets are not hit all at once, the equipment ATS transfers: medical air, vacuum, critical ventilation, then lifts in groups.' });
    else steps.push({ t: 25, title: 'Equipment branch held off', body: `Not enough generator capacity for the equipment branch (${Math.round((ess + eqp) * 1000)} kW needed). It stays off; staff switch to bottled oxygen and manual suction.` });
    if (nonOK) steps.push({ t: 120, title: 'Chillers restart', body: 'Spare capacity: the load manager reconnects the non-essential board. Chiller compressors wait out their anti-cycle timer, then restart one by one.' });
    else steps.push({ t: 120, title: 'Non-essential loads stay shed', body: 'General cooling, kitchens and laundry stay off. In a hot climate, wards start to warm within the hour.' });
  }
  for (let t = 0; t <= 180; t++) {
    const gensOn = ok > 0 && t >= 8 ? ok : 0;
    const em = gensOn > 0 && t >= 10;
    secs.push({
      t, mains: false, gensOn, ups: t < 10 || !em ? Math.max(0, 1 - t / (o.upsMin * 60)) : 1,
      on: { life: em, critical: em || t < o.upsMin * 60, equipment: em && eqOK && t >= 25, nonEss: em && nonOK && t >= 120 },
      atsPos: { life: t < 1 ? 'normal' : em ? 'emergency' : 'open', critical: t < 1 ? 'normal' : em ? 'emergency' : 'open', equipment: t < 1 ? 'normal' : em && eqOK && t >= 25 ? 'emergency' : 'open' },
    });
  }
  return { secs, steps };
}

export type Hour = { t: number; mains: boolean; fuel: number; load: number; gens: number; on: Record<Branch, boolean>; refuel: boolean };

/** 72 hours from the start of the outage, minute by minute. */
export function threeDays(def: HospitalDef, o: HospitalOpts) {
  const ok = Math.max(0, o.gens - o.failToStart);
  const cap = ok * o.genMW;
  const tank = o.fuelH * o.genMW * 1000 * 0.25; // litres: one set at full load burns about 0.25 L per kWh
  let fuel = tank;
  const out: Hour[] = [];
  let firstOut = -1;
  for (let m = 0; m <= 72 * 60; m++) {
    const t = m / 60, h = o.start + t;
    const mains = o.secondFeeder || t >= o.duration;
    const L = hospLoad(def, h);
    const ess = L * (BRANCHES[0].share + BRANCHES[1].share), eqp = L * BRANCHES[2].share, non = L * BRANCHES[3].share;
    let on: Record<Branch, boolean>, load = 0, refuelNow = false;
    if (mains) {
      on = { life: true, critical: true, equipment: true, nonEss: true };
      load = 0;
    } else {
      const gensUp = ok > 0 && fuel > 0;
      if (o.refuel && m > 0 && m % (24 * 60) === 0) { fuel = tank; refuelNow = true; } // a tanker fills the bulk tank
      on = { life: gensUp, critical: gensUp, equipment: gensUp && cap >= ess + eqp, nonEss: gensUp && cap >= ess + eqp + non * 1.15 };
      load = (on.life || on.critical ? ess : 0) + (on.equipment ? eqp : 0) + (on.nonEss ? non : 0);
      // diesel burn: about 0.025 L/kWh of rated capacity just to keep the sets turning, plus 0.22 L/kWh delivered
      fuel -= ((0.025 * cap + 0.22 * load) * 1000) / 60;
      if (fuel <= 0 && firstOut < 0) firstOut = t;
      fuel = Math.max(0, fuel);
    }
    out.push({ t, mains, fuel: fuel / tank, load, gens: mains ? 0 : ok, on, refuel: refuelNow });
  }
  return { mins: out, tankL: tank, dryAt: firstOut };
}

export const HOSPITALS: Record<string, HospitalDef> = {
  meridia: { name: 'Meridia General Infirmary', beds: 620, peakMW: 3.1, district: 'civic' },
};
