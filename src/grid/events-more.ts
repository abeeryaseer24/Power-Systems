// Second batch of historical events, staged on the existing regions.
import type { BlackoutEvent, Helpers } from './events';
import type { RegionSim } from './region';

const lowF = (s: RegionSim, f: number) => s.frequency > 0 && s.frequency < f;

export const MORE_EVENTS: BlackoutEvent[] = [
  {
    id: 'london-2003',
    region: 'london',
    title: 'South London blackout',
    where: 'South London and north Kent',
    date: '28 August 2003',
    time: '18:20 BST',
    hook: 'One protection relay with the wrong rating. Rush hour. Half the Underground stops.',
    people: 'About 410,000 customers',
    duration: 'About 40 minutes',
    summary: [
      'On a Thursday evening, an alarm on a transformer at Hurst substation led operators to take it out of service, a routine action that left south London supplied through one remaining circuit.',
      'A protection relay on that circuit at Wimbledon had been installed with a 1 A rating instead of 5 A. Seeing normal load as an overload, it tripped.',
      'Seven hundred and twenty-four megawatts of demand in south London and Kent were lost. About 60 % of the Underground stopped and trains were trapped in tunnels during the evening rush.',
    ],
    causes: ['An incorrectly rated protection relay installed during earlier work.', 'Operators switching for a transformer alarm, leaving a single path.'],
    lessons: ['Commissioning checks for protection settings and tighter control of relay records.'],
    sources: ['Ofgem, Report on the investigation of the power failure in South London on 28 August 2003, 2003.', 'National Grid Transco, Investigation report into the loss of supply incident affecting parts of South London, 2003.'],
    lead: 15,
    span: 120,
    setup: () => {},
    steps: [
      { t: 15, clock: '18:11', kind: 'operator', label: 'An alarm at Hurst substation. Operators take a transformer out of service.', run: (s, h) => h.tripAt('Hurst', 51.44, 0.14, 1, 'transformer taken out after a Buchholz alarm') },
      { t: 30, clock: '18:20', kind: 'trigger', label: 'A wrongly rated relay at Wimbledon trips the remaining circuit.', run: (s, h) => h.tripAt('Wimbledon', 51.42, -0.21, 2, 'protection relay with a 1 A rating instead of 5 A') },
      { t: 31, clock: '18:20', kind: 'consequence', label: 'South London and Kent lose supply. The Underground stops.', run: (s, h) => { s.shedLoad(1, h.area(51.46, -0.05, 12)); s.raise('South London is dark', '724 MW of demand lost. Trains stop in tunnels at rush hour.', 'blackout'); } },
      { t: 90, clock: '19:00', kind: 'operator', label: 'Supply is restored about 40 minutes later.', run: (s) => { s.restoreLoad(1); s.note('info', 'Supply restored'); } },
    ],
  },
  {
    id: 'northeast-1965',
    region: 'newyork',
    title: 'Northeast blackout of 1965',
    where: 'North-eastern US and Ontario',
    date: '9 November 1965',
    time: '17:16 EST',
    hook: 'A relay set years earlier, too low for the load it now carried. Thirty million people in the dark.',
    people: 'About 30 million',
    duration: 'Up to 13 hours',
    summary: [
      'At the Sir Adam Beck station near Niagara Falls, a backup relay protecting one of five lines toward Toronto had been set years before, when flows were lower.',
      'At 17:16 a normal fluctuation pushed the flow past that setting. The line tripped, and its power jumped onto the other four, which tripped in turn. The surge reversed into New York State.',
      'Within twelve minutes the cascade reached New York City. Commuters were stranded in the subway and lifts; the city stayed dark until early morning.',
    ],
    causes: ['A relay setting not updated as flows grew.', 'Weak coordination between interconnected utilities.'],
    lessons: ['The event led to the creation of the North American Electric Reliability Council (NERC) in 1968.'],
    sources: ['Federal Power Commission, Report to the President on the Northeast Power Failure, December 1965.'],
    lead: 15,
    span: 120,
    setup: (s) => {
      s.dispatch(3000);
      s.settle(30);
    },
    steps: [
      { t: 15, clock: '17:16', kind: 'trigger', label: 'A backup relay at Sir Adam Beck trips a line to Toronto. The other four follow.', run: (s, h) => h.extLoss(Math.round(s.ext.MW * 0.2), 'Ontario lines tripped; power surges reverse into New York State') },
      { t: 25, clock: '17:24', kind: 'consequence', label: 'The cascade sweeps through New York State.', run: (s, h) => h.tripCut([41.4, -74.6], [41.4, -73.3], 'power swing across the upstate corridors', 4) },
      { t: 30, clock: '17:28', kind: 'consequence', label: 'New York City separates and collapses.', run: (s) => s.tripExt('separated during the cascade') },
    ],
  },
  {
    id: 'europe-2006',
    region: 'madrid',
    title: 'Europe splits in three',
    where: 'Continental Europe',
    date: '4 November 2006',
    time: '22:10 CET',
    hook: 'A double line over the Ems river is switched off to let a cruise ship pass. Europe tears into three pieces.',
    people: 'About 15 million households',
    duration: 'Up to 2 hours',
    summary: [
      'To let the cruise ship Norwegian Pearl pass safely under the lines on the Ems river, the German operator switched off the 380 kV Conneforde–Diele double circuit, earlier than first planned.',
      'Flows rearranged across northern Germany. At 22:10 the Landesbergen–Wehrendorf line overloaded and tripped, and within seconds the continental grid split into three areas.',
      'The western area, including France, Spain, Portugal and Italy, was short by about 9 GW. Frequency fell to about 49 Hz and automatic load shedding disconnected around 17 GW of demand across western Europe, including in Spain.',
    ],
    causes: ['Switching off a double line without a full security assessment for the new timing.', 'Protection settings at the two ends of a tie line that the operators did not know differed.', 'High east-to-west flows across Germany.'],
    lessons: ['Better coordination of cross-border switching and shared real-time security analysis.'],
    sources: ['UCTE, Final Report: System Disturbance on 4 November 2006, January 2007.'],
    lead: 15,
    span: 120,
    setup: (s) => {
      s.dispatch(800);
      s.settle(30);
    },
    steps: [
      { t: 15, clock: '21:38', kind: 'operator', label: 'The Conneforde–Diele 380 kV double line is switched off for a cruise ship.', run: (s) => s.note('warn', 'Germany: Conneforde–Diele switched off for the Norwegian Pearl. Flows rearrange across Europe.') },
      { t: 60, clock: '22:10:13', kind: 'trigger', label: 'Landesbergen–Wehrendorf trips. Europe splits into three areas.', run: (s, h) => h.extLoss(Math.round(s.ext.MW * 0.11), 'continental grid split; the western area is about 9 GW short') },
      { t: 62, clock: '22:10:15', kind: 'consequence', label: 'Frequency falls toward 49 Hz. Automatic load shedding cuts 17 GW across western Europe.', run: (s) => { s.shedLoad(0.06); s.ext.shed += s.ext.MW * 0.08; s.raise('Load shedding across western Europe', 'About 17 GW of demand disconnected, including in Spain.', 'major'); } },
      { t: 110, clock: '22:49', kind: 'operator', label: 'The three areas are resynchronised within about 40 minutes; supply returns.', run: (s) => { s.ext.deficit = 0; s.restoreLoad(0.1); } },
    ],
  },
  {
    id: 'europe-2021',
    region: 'rome',
    title: 'Europe splits in two',
    where: 'Continental Europe',
    date: '8 January 2021',
    time: '14:04 CET',
    hook: 'A busbar coupler in Croatia. Europe splits along a jagged line. This time, it holds.',
    people: 'About 1.7 GW of interruptible customers',
    duration: 'About an hour until resynchronised',
    summary: [
      'At Ernestinovo substation in Croatia, a busbar coupler tripped on overcurrent. Power moved onto parallel lines, which tripped one after another across the Balkans.',
      'At 14:05 continental Europe split in two. The south-east had too much generation and frequency rose to 50.6 Hz; the north-west, including Italy, was 6.3 GW short and frequency fell to 49.74 Hz.',
      'Frequency containment reserves and 1.7 GW of contracted interruptible customers in France and Italy caught the fall. The two halves were resynchronised at 15:07. There was no blackout.',
    ],
    causes: ['Overcurrent trip of a busbar coupler under heavy south-east to north-west flows.'],
    lessons: ['A system with enough reserve and interruptible load can survive a split. Europe reviewed flow limits across the Balkans.'],
    sources: ['ENTSO-E, Continental Europe Synchronous Area Separation on 08 January 2021, final report, July 2021.'],
    lead: 15,
    span: 120,
    setup: (s) => {
      s.dispatch(600);
      s.settle(30);
    },
    steps: [
      { t: 15, clock: '14:04:25', kind: 'trigger', label: 'Ernestinovo, Croatia: a busbar coupler trips.', run: (s) => s.note('warn', 'Croatia: Ernestinovo busbar coupler tripped on overcurrent. Lines across the Balkans begin to trip.') },
      { t: 58, clock: '14:05:08', kind: 'consequence', label: 'Europe splits. The north-west, including Italy, is 6.3 GW short.', run: (s, h) => h.extLoss(Math.round(s.ext.MW * 0.03), 'continental separation; north-west area short of 6.3 GW') },
      { t: 60, clock: '14:05:10', kind: 'operator', label: 'Interruptible customers in Italy and France are disconnected: 1.7 GW.', run: (s) => { s.ext.shed += s.ext.MW * 0.05; s.note('warn', 'Interruptible load disconnected in Italy and France'); } },
      { t: 110, clock: '15:07', kind: 'operator', label: 'The two areas are resynchronised.', run: (s) => { s.ext.deficit = 0; s.ext.shed = 0; } },
    ],
  },
  {
    id: 'pakistan-2021',
    region: 'karachi',
    title: 'Pakistan blackout, 2021',
    where: 'Pakistan',
    date: '9 January 2021',
    time: '23:41 PKT',
    hook: 'A fault at Guddu. Frequency falls from 50 hertz to zero in under a second.',
    people: 'About 200 million',
    duration: 'Up to 18 hours',
    summary: [
      'Late on a Saturday night, a fault in the switchyard at Guddu power station in Sindh tripped lines and generators.',
      'According to the government, frequency fell from 50 Hz to zero in less than a second as the disturbance cascaded through the national grid.',
      'Karachi, Lahore, Islamabad and almost every city went dark. Restoration took most of the following day.',
    ],
    causes: ['A switchyard fault at Guddu cascading through a low-inertia night-time grid.'],
    lessons: ['Inquiries focused on protection coordination and operating practices; the 2023 blackout showed many issues remained.'],
    sources: ['Government of Pakistan and NTDC statements, January 2021, as reported by Dawn.'],
    lead: 15,
    span: 90,
    setup: (s) => {
      s.loadScale = 0.6;
      s.dispatch(600);
      s.settle(30);
    },
    steps: [
      { t: 15, clock: '23:41', kind: 'trigger', label: 'A fault in the Guddu switchyard trips lines and generators.', run: (s, h) => h.extLoss(Math.round(s.ext.MW * 0.35), 'fault at Guddu; generators trip across the south') },
      { t: 16, clock: '23:41:01', kind: 'consequence', label: 'The national grid collapses in under a second. Karachi is cut off.', run: (s) => s.tripExt('national grid collapse') },
    ],
  },
  {
    id: 'texas-2011',
    region: 'houston',
    title: 'Texas Groundhog Day freeze',
    where: 'ERCOT, Texas',
    date: '2 February 2011',
    time: '05:43 CST',
    hook: 'A cold snap freezes power plants across Texas. A decade-early warning nobody fully heeded.',
    people: 'About 3.2 million customers',
    duration: 'Up to 8 hours of rolling outages',
    summary: [
      'A severe cold front swept Texas overnight. Instrument lines, valves and water systems froze at power plants, and gas supply was curtailed.',
      'By early morning so many units had tripped or failed to start that ERCOT ordered 4,000 MW of rolling outages to protect the grid.',
      'The federal investigation recommended winterisation of plants. Ten years later, Winter Storm Uri found many still unprepared.',
    ],
    causes: ['Freezing of plant instrumentation and equipment.', 'Gas supply curtailments.'],
    lessons: ['Winterisation recommendations that were largely voluntary until after 2021.'],
    sources: ['FERC and NERC, Report on Outages and Curtailments During the Southwest Cold Weather Event of February 1–5, 2011, August 2011.'],
    lead: 15,
    span: 600,
    setup: (s) => {
      s.ufGenRule = { f: 59.4, seconds: 540 };
      s.dispatch();
      s.settle(30);
    },
    steps: [
      { t: 20, clock: '05:10', kind: 'trigger', label: 'Units across Texas trip as instrument lines freeze.', run: (s, h: Helpers) => h.extLoss(Math.round(s.ext.MW * 0.04), 'frozen instrumentation across ERCOT') },
      { t: 120, clock: '05:30', kind: 'trigger', label: 'A Houston gas unit trips in the cold.', run: (s) => { const g = s.gens.map((g, i) => ({ g, i })).filter(({ g }) => g.online && g.def.kind === 'gas' && g.p > 50).sort((a, b) => a.g.p - b.g.p); const pick = g[Math.floor(g.length / 2)]; if (pick) s.tripGen(pick.i, 'frozen instrumentation'); } },
      { t: 180, clock: '05:43', kind: 'operator', label: 'ERCOT orders 4,000 MW of rolling outages.', run: (s) => { s.shedLoad(0.07); s.ext.shed += s.ext.MW * 0.06; s.note('warn', 'Operator: rolling outages ordered'); } },
    ],
  },
];

void lowF;
