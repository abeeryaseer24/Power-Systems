// Plants where the electrical system itself was the story.
import type { NuclearPlant } from './plants';

const h = (x: number) => x * 3600;

export const MORE_PLANTS: NuclearPlant[] = [
  {
    id: 'forsmark',
    name: 'Forsmark unit 1',
    place: 'Uppland, Sweden',
    type: 'ASEA-Atom boiling water reactor',
    spec: 'forsmark',
    when: '25 July 2006, 13:19 local time',
    hook: 'A short circuit in the switchyard. Half the backup power fails to connect, and the control room goes partly blind.',
    status: 'Operating. Safety systems were redesigned after the event.',
    facts: [
      ['Type', 'Boiling water reactor'], ['Electrical output', 'About 1,000 MW'], ['Backup power', 'Four diesel trains, each with a UPS'],
      ['Trains that worked', 'Two of four'], ['Time to restore normal power', 'About 22 minutes'], ['INES rating', 'Level 2'],
    ],
    design: [
      'Forsmark’s safety systems are split into four independent trains. Each has its own diesel generator and its own battery-backed UPS, which keeps instruments and controls alive and tells the diesels when to connect.',
      'Two working trains are enough to cool the core. The design assumes that a single fault can take out at most one train.',
    ],
    story: [
      'During maintenance in the 400 kV switchyard, an electrical short circuit disconnected the plant from the grid. The disturbance sent a voltage surge into the plant’s own electrical system.',
      'The reactor scrammed correctly. But the surge tripped two of the four UPS units. Without them, two diesel trains started yet never connected to their busbars, and half of the control room’s indications went dark.',
      'With half their information missing, operators worked out what had happened and, after about 22 minutes, manually connected the plant to an off-site supply. The two working trains had kept the core cooled throughout. The event showed that one electrical disturbance could defeat several “independent” trains at once.',
    ],
    lessons: ['Electrical disturbances can be a common cause that defeats redundancy.', 'Plants across Europe re-examined how their UPS and diesel systems respond to grid-side voltage transients.'],
    sources: ['Swedish Nuclear Power Inspectorate (SKI), reports on the Forsmark 1 event of 25 July 2006.', 'IAEA, reports and INES rating of the Forsmark 1 event, 2006.'],
    scenarioTitle: 'Switchyard short circuit and loss of two safety trains',
    span: 1800,
    speed: 10,
    setup: () => {},
    steps: [
      { t: 1, clock: '13:19:48', label: 'A short circuit in the 400 kV switchyard cuts the plant off from the grid. A voltage surge hits the plant network. The reactor scrams.', run: (r) => { r.loseOffsite('short circuit in the 400 kV switchyard'); r.scram('loss of grid connection'); } },
      { t: 3, clock: '13:19:50', label: 'Two of the four UPS units trip on the surge. Their diesels start but never connect. Half the control room goes dark.', run: (r) => { r.note('Two of four UPS units tripped: their diesel trains did not connect. Half of the indications are lost.', 'alarm'); r.s.alarms.add('DC power lost'); } },
      { t: 1320, clock: '13:41', label: 'Operators connect an off-site supply by hand. Full power to the safety systems is restored.', operator: true, run: (r) => { r.s.offsite = true; r.note('Off-site supply connected manually. All safety buses energised.'); } },
    ],
  },
  {
    id: 'fukushima-daini',
    name: 'Fukushima Daini',
    place: 'Naraha and Tomioka, Fukushima, Japan',
    type: 'Four boiling water reactors',
    spec: 'daini',
    when: '11 March 2011, 14:46 local time',
    hook: 'Twelve kilometres from Daiichi, the same earthquake and tsunami. One power line survived, and so did all four reactors.',
    status: 'Shut down after 2011; decommissioning decided in 2019.',
    facts: [
      ['Units', '4 × boiling water reactor'], ['Electrical output', 'About 1,100 MW each'], ['Off-site lines that survived', 'One'],
      ['Temporary cable laid', 'About 9 km in roughly 30 hours'], ['Cold shutdown', 'All four units by 15 March'], ['INES rating', 'Level 3'],
    ],
    design: [
      'Like Daiichi, Daini’s reactors depend on seawater pumps to carry decay heat away to the ocean through heat exchangers.',
      'Unlike Daiichi, the plant still had alternating current after the tsunami: one off-site line stayed connected, so pumps, valves and instruments could work if the cooling chain could be repaired.',
    ],
    story: [
      'The earthquake scrammed all four reactors. About forty minutes later the tsunami flooded the seawater pump buildings, wrecking the heat sink for three of the four units.',
      'But the lights stayed on. One off-site power line had survived, so operators kept injecting make-up water and could watch every reading as reactor temperatures climbed.',
      'Over about thirty hours, some two hundred workers laid roughly nine kilometres of heavy temporary cable by hand and replaced flooded pump motors. Cooling was restored, and all four units reached cold shutdown by 15 March. The difference from Daiichi came down to electricity.',
    ],
    lessons: ['Keeping even one source of AC power can decide the outcome of a severe accident.', 'Prepared, practised improvisation saved the plant.'],
    sources: ['TEPCO, Fukushima Nuclear Accidents Investigation Report, 2012 (Fukushima Daini sections).', 'IAEA International Fact Finding Expert Mission report, 2011.'],
    scenarioTitle: 'The tsunami takes the heat sink, but not the power',
    span: h(40),
    speed: 600,
    setup: () => {},
    steps: [
      { t: 1, clock: '14:46', label: 'Earthquake: all four reactors scram. Off-site power holds.', run: (r) => r.scram('seismic trip') },
      { t: 2160, clock: '15:22', label: 'The tsunami floods the seawater pumps. The heat sink is gone, but one power line survives.', run: (r) => { r.s.feed = false; r.s.hpi = 0.35; r.note('Seawater pumps flooded: residual heat removal lost. Off-site AC still available; make-up water continues.', 'alarm'); } },
      { t: h(30), clock: '12 March, evening', label: 'Workers finish laying 9 km of temporary cable. Cooling is restored.', operator: true, run: (r) => { r.s.feed = true; r.note('Temporary cables connected, pump motors replaced: residual heat removal restored.'); } },
    ],
  },
  {
    id: 'zaporizhzhia',
    name: 'Zaporizhzhia',
    place: 'Enerhodar, Ukraine',
    type: 'Six VVER-1000 pressurised water reactors',
    spec: 'zaporizhzhia',
    when: '9 March 2023, the sixth loss of all off-site power',
    hook: 'Europe’s largest nuclear plant, in a war zone. Again and again, the last power line is cut and the diesels take over.',
    status: 'All six reactors shut down; the IAEA has kept experts on site since 2022.',
    facts: [
      ['Units', '6 × VVER-1000'], ['Capacity before the war', 'About 5,700 MW'], ['Off-site lines before the war', 'Four 750 kV plus backups'],
      ['Diesel generators', '20, with fuel for over ten days'], ['Complete losses of off-site power', 'Several since 2022 (IAEA)'], ['Reactor state', 'Cold shutdown'],
    ],
    design: [
      'Even in cold shutdown, a reactor still produces decay heat, and its spent fuel pool needs cooling. Both depend on electrically driven pumps.',
      'Normally that power comes from the grid through several high-voltage lines. When they are all lost, emergency diesel generators start automatically.',
    ],
    story: [
      'Since 2022 the plant has been in an active conflict zone. Its high-voltage lines have been repeatedly damaged, leaving it on a single connection, or none.',
      'On 9 March 2023, for the sixth time according to the IAEA, the plant lost all off-site power. Its diesel generators started and kept the cooling running for about eleven hours until a line was reconnected.',
      'Because the reactors are shut down, decay heat is low and the plant has much more time than Daiichi did. But every loss of off-site power puts the plant on its last line of defence. The simulator below shows a reactor in cold shutdown riding through on diesels.',
    ],
    lessons: ['Off-site power is the first and most important safety system a nuclear plant has.', 'Cold shutdown buys time, but cooling must never stop.'],
    sources: ['IAEA, Update statements by the Director General on the situation at Zaporizhzhia Nuclear Power Plant, 2022–2024.'],
    scenarioTitle: 'Loss of all off-site power in cold shutdown',
    span: h(12),
    speed: 600,
    setup: (r) => {
      r.s.turbineOnline = false;
      r.s.Pe = 0;
    },
    steps: [
      { t: 60, clock: '05:00', label: 'The last off-site power line is lost. The diesel generators start.', run: (r) => r.loseOffsite('last off-site line lost') },
      { t: h(5), clock: '10:00', label: 'Hours on diesel power. Cooling pumps keep running; decay heat is low.', run: (r) => r.note('Diesels running. Cooling maintained on emergency power.') },
      { t: h(11), clock: '16:00', label: 'A power line is reconnected. The plant returns to off-site power.', operator: true, run: (r) => { r.s.offsite = true; r.note('Off-site power restored.'); } },
    ],
  },
];
