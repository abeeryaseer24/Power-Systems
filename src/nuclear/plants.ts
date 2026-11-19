import { Reactor, SPECS } from './reactor';

export interface PlantStep {
  t: number;
  clock: string;
  label: string;
  /** Historical operator action: skipped when the player is in control. */
  operator?: boolean;
  run: (r: Reactor) => void;
}

export interface NuclearPlant {
  id: string;
  name: string;
  place: string;
  type: string;
  spec: keyof typeof SPECS;
  when: string;
  hook: string;
  status: string;
  facts: [string, string][];
  design: string[];
  story: string[];
  lessons: string[];
  sources: string[];
  scenarioTitle: string;
  setup: (r: Reactor) => void;
  steps: PlantStep[];
  /** Simulated seconds to run, and the default speed. */
  span: number;
  speed: number;
  /** Link to the grid this plant feeds, in the atlas. */
  region?: string;
}

const h = (x: number) => x * 3600;

export const PLANTS: NuclearPlant[] = [
  {
    id: 'rooppur',
    name: 'Rooppur',
    place: 'Pabna, Bangladesh, on the Padma',
    type: 'VVER-1200 pressurised water reactor',
    spec: 'rooppur',
    when: 'Construction from 2017',
    hook: 'Bangladesh’s first nuclear power plant. Each unit will be the single largest machine on the national grid.',
    status: 'Two units built by Rosatom; the first in commissioning in the mid-2020s.',
    facts: [
      ['Units', '2 × VVER-1200'], ['Electrical output', 'About 1,200 MW per unit'], ['Thermal power', '3,200 MW per unit'],
      ['Coolant and moderator', 'Light water at 16 MPa'], ['Fuel', 'Low-enriched uranium dioxide'], ['Safety concept', 'Active and passive systems, core catcher'],
    ],
    design: [
      'Like most of the world’s reactors, the VVER-1200 is a pressurised water reactor. Water at 16 MPa carries heat from the core to four steam generators without boiling. Steam on the secondary side drives a turbine and a 50 Hz synchronous generator.',
      'Water is also the moderator. If it heats up or boils, it slows neutrons less effectively and the chain reaction weakens. That negative feedback is the most important safety feature of the design, and the one the RBMK at Chernobyl lacked.',
      'The AES-2006 design adds passive heat removal: natural-circulation loops to air-cooled heat exchangers on the containment that need no pumps or AC power, and a core catcher under the vessel.',
    ],
    story: [
      'For the Bangladesh grid, a 1,200 MW unit is a new kind of problem. The largest single generator today is a fraction of that. If a Rooppur unit trips, the grid loses more than 10 % of its supply in an instant, so reserves, load shedding and the 400 kV lines from Rooppur toward Dhaka must all be sized for that loss.',
      'In the simulator you can run the plant at full power, then cut it off from the grid and watch its emergency systems take over.',
    ],
    lessons: ['A nuclear unit must be planned together with the grid it feeds: reserve, inertia and transmission for its loss.'],
    sources: ['IAEA Power Reactor Information System (PRIS), Rooppur 1 and 2.', 'Bangladesh Atomic Energy Commission and Rosatom public project information.'],
    scenarioTitle: 'Loss of offsite power, then station blackout',
    span: h(6),
    speed: 30,
    region: 'dhaka',
    setup: () => {},
    steps: [
      { t: 60, clock: 'T+1 min', label: 'A grid fault opens the 400 kV breakers. The turbine trips and the reactor scrams.', run: (r) => { r.loseOffsite('grid disturbance on the 400 kV lines'); r.scram('loss of offsite power'); } },
      { t: 600, clock: 'T+10 min', label: 'The diesel generators fail. Station blackout. Passive heat removal opens on its own.', run: (r) => { r.stationBlackout('emergency diesels failed', false); r.s.passiveOn = true; r.note('Passive heat removal system: dampers open, natural circulation to the air coolers.'); } },
    ],
  },
  {
    id: 'chernobyl',
    name: 'Chernobyl unit 4',
    place: 'Pripyat, Ukrainian SSR',
    type: 'RBMK-1000 graphite-moderated, water-cooled reactor',
    spec: 'chernobyl',
    when: '26 April 1986, 01:23 local time',
    hook: 'A safety test at low power, a reactor that grows stronger as its water boils, and an emergency button that made things worse.',
    status: 'Destroyed. Enclosed in the New Safe Confinement since 2016.',
    facts: [
      ['Type', 'RBMK-1000, graphite moderated'], ['Thermal power', '3,200 MW'], ['Electrical output', '1,000 MW'],
      ['Void coefficient', 'Strongly positive at low power'], ['Scram time', 'About 18 seconds'], ['INES rating', 'Level 7'],
    ],
    design: [
      'The RBMK uses graphite to moderate neutrons and boiling water in 1,661 pressure tubes to cool the fuel. Water also absorbs neutrons, so when it boils into steam, fewer neutrons are absorbed and the reaction speeds up. This positive void coefficient was strongest at low power.',
      'Its control rods had graphite displacers below the absorber. When fully withdrawn rods were driven in, the graphite entered the bottom of the core first and pushed water out, adding reactivity for the first few seconds of a scram.',
    ],
    story: [
      'Operators were testing whether a coasting turbine could power the coolant pumps during a blackout. The test was delayed by a day, and the reactor sat at low power, poisoned with xenon. To keep it running they withdrew almost all of the control rods, far beyond the limits.',
      'At 01:23:04 the test began. The turbine’s steam was cut, and the pumps it fed slowed down. Less flow meant more boiling, more boiling meant more power, and more power meant more boiling.',
      'At 01:23:40 someone pressed AZ-5, the emergency shutdown. The rods began their 18-second journey down, and their graphite tips added a final push. The reactor went prompt critical, reaching many times its rated power in a few seconds. Fuel shattered, the pressure tubes burst, and two explosions blew the 1,000-tonne lid off the reactor.',
    ],
    lessons: ['Design reactors with negative feedback at every power level.', 'Never defeat the protection system to complete a test.', 'Build a safety culture where operators can stop a test.'],
    sources: ['IAEA, INSAG-7: The Chernobyl Accident, Updating of INSAG-1, 1992.', 'World Nuclear Association, Chernobyl Accident 1986, information paper.'],
    scenarioTitle: 'The turbine rundown test',
    span: 70,
    speed: 1,
    setup: (r) => {
      r.rps = false;
    },
    steps: [
      { t: 4, clock: '01:23:04', label: 'The test begins: turbine steam is cut. Four of the eight main pumps run down with the turbine.', operator: true, run: (r) => { r.tripTurbine('turbine rundown test'); [0, 1, 2, 3].forEach((i) => r.setPump(i, false)); } },
      { t: 40, clock: '01:23:40', label: 'AZ-5 is pressed. The rods start moving in from the top.', operator: true, run: (r) => r.scram('AZ-5 emergency button') },
    ],
  },
  {
    id: 'tmi',
    name: 'Three Mile Island unit 2',
    place: 'Pennsylvania, United States',
    type: 'Babcock & Wilcox pressurised water reactor',
    spec: 'tmi',
    when: '28 March 1979, 04:00 local time',
    hook: 'A relief valve sticks open, and a light on the panel says it is closed. For two hours, operators drain the reactor themselves.',
    status: 'Unit 2 shut down permanently; unit 1 operated until 2019.',
    facts: [
      ['Type', 'Pressurised water reactor'], ['Thermal power', '2,772 MW'], ['Electrical output', 'About 880 MW'],
      ['Core melted', 'About half'], ['Off-site health effects', 'None measurable'], ['INES rating', 'Level 5'],
    ],
    design: [
      'A pressurised water reactor keeps its primary water from boiling by holding it at about 15 MPa. A pressuriser, a tall vessel half full of water and half steam, sets the pressure. A pilot-operated relief valve (PORV) on top opens if the pressure gets too high.',
      'The panel light for the PORV showed the command sent to its solenoid, not the valve’s real position.',
    ],
    story: [
      'At 04:00:37 the main feedwater pumps tripped. With no feedwater the steam generators stopped removing heat, primary pressure rose, the PORV opened, and the reactor scrammed eight seconds later. So far, everything worked.',
      'Then the PORV failed to close. Its light went out, because the solenoid had been de-energised, so operators believed it was shut. Primary water poured out through it.',
      'Steam bubbles in the hot primary pushed water up into the pressuriser, making its level read high. Trained to avoid a “solid” pressuriser, operators throttled back the emergency injection that would have saved the core. Later they stopped the main pumps. The core boiled dry and about half of it melted before a shift supervisor closed the PORV block valve at 06:22.',
    ],
    lessons: ['Indicate what a valve is doing, not what it was told to do.', 'Control rooms were redesigned around human factors, and operator training changed worldwide.'],
    sources: ['Report of the President’s Commission on the Accident at Three Mile Island (Kemeny Commission), 1979.', 'US NRC, Backgrounder on the Three Mile Island Accident.'],
    scenarioTitle: 'Loss of feedwater and the stuck-open PORV',
    span: h(4),
    speed: 30,
    setup: () => {},
    steps: [
      { t: 0.5, clock: '04:00:37', label: 'The main feedwater pumps trip. The turbine trips.', run: (r) => { r.s.feed = false; r.tripTurbine('loss of feedwater'); } },
      { t: 8, clock: '04:00:45', label: 'High pressure: the reactor scrams. The PORV is open.', run: (r) => r.scram('high reactor pressure') },
      { t: 13, clock: '04:00:50', label: 'The PORV fails to close. Its light on the panel goes out.', run: (r) => { r.s.porvOpen = true; r.s.porvStuck = true; r.note('Relief valve stuck open. Its indicator shows CLOSED.', 'warn'); } },
      { t: 120, clock: '04:02:38', label: 'Emergency high-pressure injection starts automatically.', run: (r) => { r.s.hpi = 1; } },
      { t: 270, clock: '04:05', label: 'Operators throttle back the injection: the pressuriser level reads high.', operator: true, run: (r) => { r.s.hpi = 0.15; } },
      { t: 6000, clock: '05:41', label: 'Operators stop the last main coolant pumps because of vibration.', operator: true, run: (r) => r.s.pumpOn.fill(false) },
      { t: 8500, clock: '06:22', label: 'A shift supervisor closes the PORV block valve.', operator: true, run: (r) => { r.s.blockValve = false; r.note('PORV block valve closed. The leak stops.'); } },
      { t: 12600, clock: '07:30', label: 'High-pressure injection is restored at full flow.', operator: true, run: (r) => { r.s.hpi = 1; } },
    ],
  },
  {
    id: 'fukushima',
    name: 'Fukushima Daiichi unit 1',
    place: 'Ōkuma, Fukushima, Japan',
    type: 'General Electric BWR/3 boiling water reactor',
    spec: 'fukushima',
    when: '11 March 2011, 14:46 local time',
    hook: 'The reactor shut down perfectly. Then the grid, the diesels and the batteries went, and nothing could carry the decay heat away.',
    status: 'Units 1 to 4 being decommissioned over several decades.',
    facts: [
      ['Type', 'Boiling water reactor, Mark I containment'], ['Thermal power', '1,380 MW'], ['Electrical output', '460 MW'],
      ['Tsunami height', 'About 14–15 m at the site'], ['Units with core melt', '1, 2 and 3'], ['INES rating', 'Level 7'],
    ],
    design: [
      'In a boiling water reactor, water boils in the core and the steam goes straight to the turbine. Unit 1 had an isolation condenser: when the reactor is cut off from the turbine, steam rises into tubes in a large water tank, condenses, and runs back down by gravity. It needs no pumps, but its valves need DC power to open.',
      'Even after a perfect shutdown, fission products keep heating the fuel: about 6 % of full power at first, 1 % after a few hours. That decay heat must be removed for weeks.',
    ],
    story: [
      'At 14:46 the magnitude 9.0 Tohoku earthquake shut the reactor down as designed. It also brought down the transmission towers that connected the plant to the grid. Emergency diesel generators started and took over.',
      'At about 15:37 the tsunami overtopped the seawall. It flooded the diesels, the switchgear, and in unit 1, the DC batteries. The control room went dark. The isolation condenser’s valves, which operators had closed to control the cooldown rate, could not be reopened.',
      'With no cooling, decay heat boiled the water away. The core was uncovered by early evening and melted overnight. Steam reacting with the hot zirconium cladding produced hydrogen, which leaked into the reactor building and exploded the next afternoon.',
    ],
    lessons: ['Protect emergency power from common-cause flooding.', 'Plan for station blackouts lasting days, not hours, including portable pumps and generators (the FLEX approach).'],
    sources: ['IAEA, The Fukushima Daiichi Accident, Report by the Director General, 2015.', 'TEPCO, Fukushima Nuclear Accidents Investigation Report, 2012.'],
    scenarioTitle: 'Earthquake, tsunami and station blackout',
    span: h(26),
    speed: 600,
    setup: () => {},
    steps: [
      { t: 1, clock: '14:46', label: 'Earthquake: automatic scram. Transmission towers fall: loss of offsite power. Diesels start.', run: (r) => { r.scram('seismic trip'); r.loseOffsite('transmission lines destroyed by the earthquake'); } },
      { t: 360, clock: '14:52', label: 'The isolation condenser starts automatically.', run: (r) => { r.s.passiveOn = true; } },
      { t: 1020, clock: '15:03', label: 'Operators close the isolation condenser to limit the cooldown rate.', operator: true, run: (r) => { r.s.passiveOn = false; } },
      { t: 3060, clock: '15:37', label: 'The tsunami floods the diesels, the switchgear and the DC batteries. Station blackout.', run: (r) => { r.stationBlackout('tsunami flooding', true); r.s.passiveOn = false; } },
      { t: h(13.2), clock: '04:00 (12 March)', label: 'Fire engines begin injecting fresh water into the reactor.', operator: true, run: (r) => { r.s.fireInjection = true; r.s.depress = true; r.note('Reactor depressurised; fire engine injection started.'); } },
    ],
  },
];

export const plantById = (id: string) => PLANTS.find((p) => p.id === id);

export function buildReactor(p: NuclearPlant, mode: 'watch' | 'control') {
  const init = p.id === 'chernobyl' ? { power: 0.065, xenon: 2.4, rods: 0.03 } : { power: p.id === 'tmi' ? 0.97 : 1 };
  const r = new Reactor(SPECS[p.spec], init);
  if (p.id === 'chernobyl') r.s.flow = 1.15;
  p.setup(r);
  for (const st of p.steps) {
    r.at(st.t, (rr) => {
      if (mode === 'control' && st.operator) return;
      st.run(rr);
    });
  }
  return r;
}
