// Third batch: blackouts on six regions added for them (Venezuela, Brazil,
// Türkiye, Sri Lanka, Moscow, Central Asia). Same rules as events.ts.
import type { BlackoutEvent } from './events';
import type { RegionSim } from './region';

const lowF = (s: RegionSim, f: number) => s.frequency > 0 && s.frequency < f;
const overloaded = (s: RegionSim, x = 1.1) => s.branches.some((b) => b.closed && b.loading > x);

/** Generators trip on under-frequency until about `share` of the running output is gone. */
function ufTrip(s: RegionSim, share = 0.5) {
  const on = s.gens.map((g, i) => ({ g, i })).filter((x) => x.g.online && x.g.p > 1 && s.buses[x.g.def.bus].live).sort((a, b) => b.g.p - a.g.p);
  const total = on.reduce((a, x) => a + x.g.p, 0);
  let lost = 0;
  for (const x of on) {
    if (lost > total * share) break;
    lost += x.g.p;
    s.tripGen(x.i, 'under-frequency protection');
  }
}

const ALL: BlackoutEvent[] = [
  // ------------------------------------------------------------------ Venezuela 2019
  {
    id: 'venezuela-2019',
    region: 'caracas',
    title: 'Venezuela national blackout',
    where: 'Venezuela',
    date: '7 March 2019',
    time: '16:53 VET',
    hook: 'One dam supplies most of the country through three 765 kV lines. A fire burns beneath them.',
    people: 'About 30 million',
    duration: 'Up to five days in parts of the country',
    summary: [
      'The Simón Bolívar hydro plant at Guri, one of the largest in the world, supplied most of Venezuela’s electricity through a 765 kV corridor running hundreds of kilometres north and west to the cities.',
      'On the afternoon of 7 March, the lines out of Guri tripped. Engineers outside the government pointed to a vegetation fire beneath the corridor and years of skipped maintenance; the government blamed sabotage.',
      'With its outlet gone, Guri’s turbines over-sped and tripped. The thermal plants that should have carried the north were largely out of service, and the rest of the grid collapsed. Power returned in stages over the following days, then failed again more than once.',
    ],
    causes: [
      'Heavy dependence on one plant and one transmission corridor.',
      'A fire under the 765 kV lines, according to independent engineers, after years of poor vegetation management.',
      'Little working thermal generation near the load centres to hold the system once Guri was cut off.',
    ],
    lessons: [
      'A grid that leans on one corridor needs local generation that is actually available, and protection that can island the cities in balance.',
      'Maintenance budgets are a reliability decision, not a saving.',
    ],
    sources: [
      'Reuters and Associated Press reporting, 7–14 March 2019.',
      'Public analyses by Venezuelan electrical engineers and the Colegio de Ingenieros de Venezuela, March 2019.',
    ],
    lead: 20,
    span: 150,
    setup: (s) => {
      // thin reserves: most thermal plant was broken and what ran was already loaded
      s.responseShare = 0.15;
      s.uflsWorks = 0.35;
    },
    steps: [
      { t: 20, clock: '16:53', kind: 'trigger', label: 'A fire under the corridor. The first 765 kV line out of Guri trips.', run: (s, h) => h.tripAt('Guri', 7.76, -62.99, 1, 'flashover from a fire beneath the line') },
      { t: 22, clock: '16:53', kind: 'consequence', label: 'Flow jumps onto the remaining lines. They trip too. Guri is cut off.', cond: (s) => overloaded(s, 1.05), run: (s, h) => h.tripCut([8.6, -64.6], [7.0, -63.6], 'overload and distance protection on the 765 kV corridor') },
      { t: 23, clock: '16:54', kind: 'consequence', label: 'With nowhere to send its power, Guri over-speeds and trips.', run: (s, h) => h.tripPlant('Guri', 7.76, -62.99, 'over-speed after losing its outlet', 'hydro') },
      { t: 30, clock: '16:54', kind: 'consequence', label: 'Frequency collapses across the north. The country goes dark.', cond: (s) => lowF(s, 58.8), run: (s) => ufTrip(s, 0.7) },
    ],
  },
  // ------------------------------------------------------------------ Brazil 2009
  {
    id: 'brazil-2009',
    region: 'saopaulo',
    title: 'The Itaipu blackout',
    where: 'Brazil and Paraguay',
    date: '10 November 2009',
    time: '22:13 BRST',
    hook: 'A storm over the 765 kV lines from Itaipu. Fourteen gigawatts vanish, and São Paulo and Rio go dark.',
    people: 'About 60 million in Brazil, and all of Paraguay',
    duration: 'Up to 5 hours',
    summary: [
      'Itaipu, on the Paraná river between Brazil and Paraguay, sends power to south-east Brazil through two routes: an HVDC link from its 50 Hz units and three 765 kV AC lines from its 60 Hz units.',
      'During heavy rain and wind, short circuits at the Itaberá substation tripped the 765 kV lines. The HVDC link blocked in the disturbance. All of Itaipu’s output was suddenly cut off from the load.',
      'About 24 GW of demand was lost across 18 Brazilian states, around 40 % of the national load. Paraguay, which takes its power from Itaipu, lost supply entirely. Most areas were restored within a few hours.',
    ],
    causes: [
      'Insulator flashovers in bad weather at the 765 kV Itaberá substation, according to the system operator ONS.',
      'Itaipu’s whole output depended on two corridors that failed in the same event.',
    ],
    lessons: [
      'Special protection schemes were revised so that losing Itaipu sheds load and generation in balance instead of collapsing the south-east.',
      'Substation insulation was upgraded for the local weather.',
    ],
    sources: [
      'Operador Nacional do Sistema Elétrico (ONS), Relatório de Análise de Perturbação, 10 November 2009 event.',
      'ANEEL statements and Reuters reporting, November 2009.',
    ],
    lead: 20,
    span: 150,
    setup: (s) => {
      s.dispatch(undefined, 1.06);
      s.settle(30);
      // the defence plan of the time could not cope with losing all of Itaipu at once
      s.uflsWorks = 0.4;
    },
    steps: [
      { t: 20, clock: '22:13:06', kind: 'trigger', label: 'Short circuits at Itaberá in the storm. The first 765 kV lines trip.', run: (s, h) => h.tripAt('Itaberá', -23.85, -49.13, 2, 'insulator flashover in heavy rain') },
      { t: 20.5, clock: '22:13:07', kind: 'trigger', label: 'The HVDC link from Itaipu’s 50 Hz units blocks.', run: (s, h) => h.extLoss(5500, 'Itaipu HVDC bipoles blocked during the disturbance') },
      { t: 21.5, clock: '22:13:08', kind: 'consequence', label: 'The last 765 kV path trips. Itaipu is cut off and its 60 Hz units trip.', cond: (s) => overloaded(s, 1.05), run: (s, h) => { h.tripCut([-24.4, -52.0], [-23.0, -51.4], 'overload on the remaining 765 kV circuits'); h.tripPlant('Itaipu', -25.41, -54.59, 'over-speed after losing the 765 kV outlet', 'hydro'); } },
      { t: 28, clock: '22:13:15', kind: 'consequence', label: 'São Paulo is short by thousands of megawatts. The south-east collapses.', cond: (s) => lowF(s, 58.5), run: (s) => ufTrip(s, 0.7) },
    ],
  },
  // ------------------------------------------------------------------ Türkiye 2015
  {
    id: 'turkey-2015',
    region: 'istanbul',
    title: 'Türkiye national blackout',
    where: 'Türkiye',
    date: '31 March 2015',
    time: '10:36 EEST',
    hook: 'Power flows west across Anatolia. One line trips, the country tears in two, and both halves fail.',
    people: 'About 70 million',
    duration: 'Up to 9 hours',
    summary: [
      'On a weekday morning, a large share of Türkiye’s generation was in the east, hydro and lignite, while much of the demand was in the west around Istanbul. The 400 kV lines across central Anatolia were heavily loaded, with several out for maintenance.',
      'At 10:36 one heavily loaded east–west line tripped. Its flow moved onto the parallel lines, which lost synchronism, and the system split into an eastern and a western island.',
      'The west was suddenly short of thousands of megawatts and the east had far too much. The ties to continental Europe opened to protect it. Both islands collapsed within seconds. Restoration took most of the day.',
    ],
    causes: [
      'High east-to-west transfer across a weakened 400 kV corridor, with lines out for maintenance.',
      'No controlled islanding or fast load shedding big enough for an east–west split.',
    ],
    lessons: [
      'ENTSO-E recommended better security assessment of transfer limits and coordinated defence plans for Türkiye’s synchronous connection to Europe.',
    ],
    sources: ['ENTSO-E, Report on Blackout in Turkey on 31st March 2015, September 2015.'],
    lead: 20,
    span: 150,
    setup: (s, h) => {
      // maintenance outages on the central corridor
      h.tripCut([41.5, 33.9], [37.5, 33.9], 'out for maintenance', 2);
      s.settle(20);
      s.uflsWorks = 0.4;
    },
    steps: [
      { t: 20, clock: '10:36:27', kind: 'trigger', label: 'A heavily loaded 400 kV line in central Anatolia trips.', run: (s, h) => h.tripCut([41.5, 34.4], [37.5, 34.4], 'overload protection on an east–west 400 kV line', 1) },
      { t: 21.5, clock: '10:36:29', kind: 'consequence', label: 'The parallel lines lose synchronism. Türkiye splits into east and west.', cond: (s) => overloaded(s, 1.1), run: (s, h) => h.tripCut([41.5, 34.4], [37.5, 34.4], 'out-of-step protection, east–west separation') },
      { t: 22.5, clock: '10:36:30', kind: 'consequence', label: 'The ties to Bulgaria and Greece open to protect continental Europe.', cond: (s) => Math.abs(s.frequency - 50) > 0.3, run: (s) => s.tripExt('interconnection protection opened the ties to Europe') },
      { t: 30, clock: '10:36:38', kind: 'consequence', label: 'Both islands collapse. Türkiye goes dark.', cond: (s) => lowF(s, 49.0) || s.frequency > 51.5, run: (s) => ufTrip(s, 0.6) },
    ],
  },
  // ------------------------------------------------------------------ Sri Lanka 2020
  {
    id: 'srilanka-2020',
    region: 'colombo',
    title: 'Sri Lanka island-wide blackout',
    where: 'Sri Lanka',
    date: '17 August 2020',
    time: '12:30 SLST',
    hook: 'A fault during work at one substation trips the island’s biggest power station. A small isolated grid has nowhere to turn.',
    people: 'About 21 million',
    duration: 'Up to 8 hours',
    summary: [
      'Sri Lanka’s grid is an island with no interconnection. Its largest plant, the 900 MW Lakvijaya coal station at Norochcholai, supplied a large share of the midday demand.',
      'During work at the Kerawalapitiya substation north of Colombo, a fault disturbed the network. Lakvijaya’s units tripped.',
      'Losing that much generation at once was more than the remaining plants and load shedding could absorb. Frequency collapsed and the whole island lost power. Most supply was back by the evening; the coal units took days.',
    ],
    causes: [
      'A fault during maintenance work at Kerawalapitiya, according to the investigation by the Public Utilities Commission of Sri Lanka.',
      'Heavy reliance on one large plant in a small, isolated, low-inertia grid.',
    ],
    lessons: ['Spinning reserve and load shedding sized for the largest unit trip, and better work procedures in substations.'],
    sources: ['Public Utilities Commission of Sri Lanka, report on the island-wide power failure of 17 August 2020.', 'Ceylon Electricity Board statements, August 2020.'],
    lead: 20,
    span: 120,
    setup: (s) => {
      s.dispatch(undefined, 1.05);
      s.settle(30);
      s.uflsWorks = 0.45;
    },
    steps: [
      { t: 20, clock: '12:30', kind: 'trigger', label: 'A fault during work at Kerawalapitiya substation.', run: (s, h) => h.tripAt('Kerawalapitiya', 7.02, 79.88, 2, 'fault during maintenance work') },
      { t: 20.6, clock: '12:30', kind: 'consequence', label: 'The Lakvijaya coal station at Norochcholai trips.', cond: (s) => s.buses.some((b) => b.live && b.V < 0.85), run: (s, h) => h.tripPlant('Lakvijaya', 8.02, 79.72, 'unit protection during the voltage dip', 'coal') },
      { t: 26, clock: '12:31', kind: 'consequence', label: 'Frequency collapses. The whole island goes dark.', cond: (s) => lowF(s, 48.5), run: (s) => ufTrip(s, 0.7) },
    ],
  },
  // ------------------------------------------------------------------ Moscow 2005
  {
    id: 'moscow-2005',
    region: 'moscow',
    title: 'Moscow blackout',
    where: 'Moscow and the Moscow, Tula, Kaluga and Ryazan regions',
    date: '25 May 2005',
    time: '11:00 MSK',
    hook: 'An old substation catches fire in a heatwave. Over the morning, the south of Moscow unravels.',
    people: 'About 2 million',
    duration: 'Up to a day in places',
    summary: [
      'On the evening of 24 May, a fire broke out in a current transformer at the ageing Chagino substation in south-east Moscow. Equipment was disconnected, and the remaining lines around the substation took on more load in unusually hot weather.',
      'Through the morning of 25 May more equipment at Chagino failed and lines sagged and tripped on overload. Each loss pushed more power onto the next path.',
      'By late morning a cascade had taken out the supply to much of southern Moscow and neighbouring regions. The metro stopped with thousands of passengers in tunnels; factories, water supply and traffic lights failed.',
    ],
    causes: ['Ageing equipment at Chagino and an initial fire in a current transformer.', 'Operators did not shed load in time as overloads spread in the heat.'],
    lessons: ['A large investment programme in Moscow’s grid followed, and the restructuring of Russia’s power sector accelerated.'],
    sources: ['Government commission and Rostekhnadzor findings on the 25 May 2005 accident in the Moscow power system, as reported by Kommersant and RIA Novosti, 2005.'],
    lead: 20,
    span: 180,
    setup: (s, h) => {
      // the evening before: equipment at Chagino already out after the fire
      h.tripAt('Чагино', 55.66, 37.76, 1, 'current transformer fire the evening before');
      s.loadStep(s.demand * 0.06); // hot weather
      s.settle(20);
    },
    steps: [
      { t: 20, clock: '09:00', kind: 'trigger', label: 'More equipment fails at Chagino. Another line is lost.', run: (s, h) => h.tripAt('Чагино', 55.66, 37.76, 2, 'equipment failure at the damaged substation') },
      { t: 60, clock: '10:30', kind: 'consequence', label: 'Overloaded lines in the south of the city sag and trip.', cond: (s) => overloaded(s, 1.05), run: (s, h) => h.tripCut([55.62, 37.3], [55.62, 38.1], 'thermal overload in the heat', 3) },
      { t: 90, clock: '11:00', kind: 'consequence', label: 'The cascade spreads. Southern Moscow and neighbouring regions go dark.', cond: (s) => overloaded(s, 1.05) || s.buses.some((b) => b.live && b.V < 0.85), run: (s, h) => { s.shedLoad(0.42, h.area(55.55, 37.7, 40)); s.raise('Southern Moscow is dark', 'The metro stops with passengers in the tunnels.', 'blackout'); } },
    ],
  },
  // ------------------------------------------------------------------ Central Asia 2022
  {
    id: 'central-asia-2022',
    region: 'tashkent',
    title: 'Central Asia blackout',
    where: 'Uzbekistan, Kyrgyzstan and southern Kazakhstan',
    date: '25 January 2022',
    time: '11:00 local',
    hook: 'A deficit in one country overloads the lines of another. Three countries go dark on a winter morning.',
    people: 'About 25 million',
    duration: 'Up to a day in places',
    summary: [
      'The Central Asian power ring links Uzbekistan, Kyrgyzstan, Tajikistan and southern Kazakhstan, and connects north through Kazakhstan’s 500 kV transit to the rest of the Kazakh and Russian grids.',
      'On a cold January morning, a power deficit in the Uzbek system drew a surge of power from the north. The transit lines through Kazakhstan overloaded and were disconnected.',
      'Cut off and short of power, the southern ring collapsed. Tashkent, Bishkek, Almaty and other cities lost electricity, heating, the metro and flights.',
    ],
    causes: [
      'A large imbalance in the Uzbek system, according to the Kazakh energy ministry and grid operator KEGOC.',
      'Weak north–south transfer capacity and limited reserves inside the Central Asian ring.',
    ],
    lessons: ['Coordinated reserves and automatic load shedding across the national systems of the ring.'],
    sources: ['Kazakhstan Ministry of Energy and KEGOC statements, 25 January 2022.', 'Uzbekistan Ministry of Energy statements and Reuters reporting, January 2022.'],
    lead: 20,
    span: 150,
    setup: (s) => {
      s.dispatch(1500, 1.03);
      s.settle(30);
      s.uflsWorks = 0.4;
    },
    steps: [
      { t: 20, clock: '11:00', kind: 'trigger', label: 'A large power deficit opens in the Uzbek system (shown here as lost generation at Syrdarya).', run: (s, h) => h.tripPlant('Syrdarya', 40.24, 68.96, 'sudden generation deficit in the Uzbek system') },
      { t: 22, clock: '11:00', kind: 'consequence', label: 'Power surges south through Kazakhstan. The 500 kV transit overloads and is disconnected.', cond: (s) => Math.abs(s.ext.p) > s.ext.MW * 0.1 || lowF(s, 49.6), run: (s) => s.tripExt('transit lines overloaded and disconnected') },
      { t: 30, clock: '11:01', kind: 'consequence', label: 'The southern ring collapses. Tashkent, Bishkek and Almaty go dark.', cond: (s) => lowF(s, 48.8), run: (s) => ufTrip(s, 0.65) },
    ],
  },
];

/** Replays whose region file is still being built from OpenStreetMap stay hidden until it exists. */
export const PENDING = new Set(['turkey-2015']);
export const REGION_EVENTS = ALL.filter((e) => !PENDING.has(e.id));
