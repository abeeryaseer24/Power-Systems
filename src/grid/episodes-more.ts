import type { Episode } from './documentaries';

export const MORE_EPISODES: Episode[] = [
  {
    id: 'london-2003',
    number: 13,
    title: 'The Wrong Relay',
    tagline: '28 August 2003. South London at rush hour. A one-amp mistake.',
    diagram: {
      nodes: [
        { id: 'hur', label: 'Hurst', x: 300, y: 90, kind: 'sub' },
        { id: 'wim', label: 'Wimbledon', x: 90, y: 110, kind: 'sub' },
        { id: 'nc', label: 'New Cross', x: 200, y: 60, kind: 'sub' },
        { id: 'sl', label: 'South London', x: 200, y: 190, kind: 'city' },
        { id: 'kent', label: 'North Kent', x: 330, y: 200, kind: 'city' },
      ],
      links: [
        { id: 'hs', a: 'hur', b: 'sl' },
        { id: 'wn', a: 'wim', b: 'nc', label: '275 kV' },
        { id: 'ns', a: 'nc', b: 'sl' },
        { id: 'sk', a: 'sl', b: 'kent' },
      ],
    },
    scenes: [
      { clock: '18:00', title: 'Rush hour in London.', body: 'The Underground is packed. Offices empty. South London draws its power along two paths.', simT: 0, hold: 6, mood: 'calm' },
      { clock: '18:11', title: 'An alarm at Hurst.', body: 'A transformer warning. Operators do the textbook thing and take it out. One path left.', simT: 15.2, hold: 5, mood: 'tension', fx: [{ trip: 'hs' }, { surge: 'wn' }] },
      { clock: '18:20', title: 'A relay at Wimbledon wakes up.', body: 'Installed years earlier with a one-amp rating instead of five. It sees normal load as a fault.', simT: 30.2, hold: 5, mood: 'impact', fx: [{ trip: 'wn' }] },
      { clock: '18:20', title: 'South London goes dark.', body: 'Trains stop in tunnels. Two hundred and fifty thousand people stranded underground.', simT: 32, hold: 7, mood: 'dark', fx: [{ dark: ['sl', 'kent'] }] },
      { clock: '18:57', title: 'Forty minutes.', body: 'The lights return. The investigation finds one wrong number on one relay.', simT: 95, hold: 8, mood: 'after', fx: [{ restore: ['sl', 'kent'] }] },
    ],
  },
  {
    id: 'northeast-1965',
    number: 14,
    title: 'The Great Northeast Blackout',
    tagline: '9 November 1965. Twelve minutes from Niagara to Manhattan.',
    diagram: {
      nodes: [
        { id: 'ab', label: 'Sir Adam Beck', x: 70, y: 150, kind: 'gen' },
        { id: 'tor', label: 'Toronto', x: 120, y: 50, kind: 'city' },
        { id: 'ups', label: 'Upstate NY', x: 220, y: 120, kind: 'sub' },
        { id: 'nyc', label: 'New York City', x: 330, y: 200, kind: 'city' },
        { id: 'ne', label: 'New England', x: 330, y: 70, kind: 'city' },
      ],
      links: [
        { id: 'at', a: 'ab', b: 'tor', label: '230 kV' },
        { id: 'au', a: 'ab', b: 'ups' },
        { id: 'un', a: 'ups', b: 'nyc' },
        { id: 'ue', a: 'ups', b: 'ne' },
      ],
    },
    scenes: [
      { clock: '17:00', title: 'An ordinary November evening.', body: 'Lights coming on across the Northeast. Power flows north from Niagara to Toronto.', simT: 0, hold: 6, mood: 'calm', fx: [{ surge: 'at' }] },
      { clock: '17:16:11', title: 'A relay set too low.', body: 'At Sir Adam Beck, a backup relay trips one of five lines to Toronto. Its setting was years out of date.', simT: 15.2, hold: 5, mood: 'impact', fx: [{ trip: 'at' }] },
      { clock: '17:16:14', title: 'The power turns around.', body: 'With nowhere to go north, the surge reverses into New York State.', simT: 18, hold: 5, mood: 'impact', fx: [{ surge: 'au' }, { surge: 'un' }] },
      { clock: '17:24', title: 'The cascade crosses the state.', body: 'Lines and generators trip from Buffalo to Boston.', simT: 25.2, hold: 5, mood: 'impact', fx: [{ trip: 'ue' }, { dark: ['tor', 'ne'] }] },
      { clock: '17:28', title: 'Manhattan goes dark.', body: 'Eight hundred thousand people trapped in the subway. A full moon lights the streets.', simT: 31, hold: 7, mood: 'dark', fx: [{ trip: 'un' }, { dark: ['nyc'] }] },
      { clock: 'Dawn', title: 'Thirteen hours.', body: 'Power returns. Within three years, America creates NERC to make sure it never happens again.', simT: 110, hold: 8, mood: 'after', fx: [{ restore: ['nyc', 'tor', 'ne'] }] },
    ],
  },
  {
    id: 'europe-2006',
    number: 15,
    title: 'The Cruise Ship and the Continent',
    tagline: '4 November 2006. A line switched off for a ship. Europe in three pieces.',
    diagram: {
      nodes: [
        { id: 'ems', label: 'Ems river', x: 160, y: 50, kind: 'sub' },
        { id: 'lw', label: 'Landesbergen', x: 230, y: 110, kind: 'sub' },
        { id: 'east', label: 'Eastern Europe', x: 350, y: 120, kind: 'gen' },
        { id: 'fr', label: 'France', x: 90, y: 160, kind: 'city' },
        { id: 'es', label: 'Spain', x: 60, y: 230, kind: 'city' },
        { id: 'it', label: 'Italy', x: 230, y: 220, kind: 'city' },
      ],
      links: [
        { id: 'el', a: 'ems', b: 'lw', label: '380 kV' },
        { id: 'le', a: 'lw', b: 'east' },
        { id: 'lf', a: 'lw', b: 'fr' },
        { id: 'fe', a: 'fr', b: 'es' },
        { id: 'li', a: 'lw', b: 'it' },
      ],
    },
    scenes: [
      { clock: '21:38', title: 'A ship comes down the river.', body: 'The Norwegian Pearl needs to pass under the power lines on the Ems. The operator switches them off.', simT: 15.2, hold: 6, mood: 'calm', fx: [{ trip: 'el' }] },
      { clock: '22:05', title: 'The flows shift.', body: 'Power reroutes across northern Germany. One line is now carrying too much.', simT: 40, hold: 5, mood: 'tension', fx: [{ surge: 'le' }, { surge: 'lf' }] },
      { clock: '22:10:13', title: 'Landesbergen trips.', body: 'In seconds, the continental grid tears into three islands.', simT: 60.2, hold: 5, mood: 'impact', fx: [{ trip: 'le' }, { split: [290, 20, 300, 250] }] },
      { clock: '22:10:15', title: '49 hertz in the west.', body: 'France, Spain, Italy: nine gigawatts short. Relays cut seventeen gigawatts of demand.', simT: 62.5, hold: 6, mood: 'dark', fx: [{ dark: ['fr', 'es'] }] },
      { clock: '22:47', title: 'Stitched back together.', body: 'The three islands resynchronise. Fifteen million households had lost power for up to two hours.', simT: 112, hold: 8, mood: 'after', fx: [{ restore: ['fr', 'es'] }] },
    ],
  },
  {
    id: 'europe-2021',
    number: 16,
    title: 'The Day Europe Held',
    tagline: '8 January 2021. Europe splits in two. Nobody goes dark.',
    diagram: {
      nodes: [
        { id: 'ern', label: 'Ernestinovo', x: 250, y: 150, kind: 'sub' },
        { id: 'bal', label: 'Balkans', x: 330, y: 200, kind: 'gen' },
        { id: 'it', label: 'Italy', x: 150, y: 200, kind: 'city' },
        { id: 'fr', label: 'France', x: 70, y: 100, kind: 'city' },
        { id: 'de', label: 'Germany', x: 170, y: 60, kind: 'city' },
      ],
      links: [
        { id: 'be', a: 'bal', b: 'ern' },
        { id: 'ei', a: 'ern', b: 'it' },
        { id: 'ed', a: 'ern', b: 'de' },
        { id: 'df', a: 'de', b: 'fr' },
      ],
    },
    scenes: [
      { clock: '14:00', title: 'Power flows west.', body: 'A winter Friday. Gigawatts stream from the Balkans toward Italy and France.', simT: 0, hold: 6, mood: 'calm', fx: [{ surge: 'be' }] },
      { clock: '14:04:25', title: 'Ernestinovo, Croatia.', body: 'A busbar coupler trips on overcurrent. One by one, Balkan lines follow.', simT: 15.2, hold: 5, mood: 'tension', fx: [{ trip: 'be' }] },
      { clock: '14:05:08', title: 'Europe splits in two.', body: 'The north-west is six gigawatts short. Frequency drops to 49.74 hertz.', simT: 58.2, hold: 5, mood: 'impact', fx: [{ split: [280, 20, 300, 250] }] },
      { clock: '14:05:10', title: 'The safety net works.', body: 'Reserves surge. Big factories in France and Italy switch off by contract. The fall stops.', simT: 61, hold: 6, mood: 'tension' },
      { clock: '15:07', title: 'Nobody noticed.', body: 'One hour later, the halves are reconnected. A near miss, caught by design.', simT: 112, hold: 8, mood: 'after' },
    ],
  },
  {
    id: 'pakistan-2021',
    number: 17,
    title: 'Zero Hertz',
    tagline: '9 January 2021. Fifty hertz to nothing in under a second.',
    diagram: {
      nodes: [
        { id: 'gud', label: 'Guddu', x: 200, y: 90, kind: 'gen' },
        { id: 'north', label: 'Lahore and Islamabad', x: 300, y: 40, kind: 'city' },
        { id: 'jam', label: 'Jamshoro', x: 150, y: 170, kind: 'sub' },
        { id: 'kar', label: 'Karachi', x: 100, y: 230, kind: 'city' },
      ],
      links: [
        { id: 'gn', a: 'gud', b: 'north', label: '500 kV' },
        { id: 'gj', a: 'gud', b: 'jam' },
        { id: 'jk', a: 'jam', b: 'kar' },
      ],
    },
    scenes: [
      { clock: '23:30', title: 'Saturday night.', body: 'Demand is low. Few machines are spinning to hold the frequency.', simT: 0, hold: 6, mood: 'calm' },
      { clock: '23:41', title: 'A fault at Guddu.', body: 'In the switchyard, something fails. Lines and generators trip.', simT: 15.2, hold: 5, mood: 'impact', fx: [{ lose: 'gud' }, { trip: 'gn' }, { trip: 'gj' }] },
      { clock: '23:41:01', title: 'Zero.', body: 'Frequency falls from fifty hertz to nothing in under a second. The whole country goes dark.', simT: 17, hold: 7, mood: 'dark', fx: [{ trip: 'jk' }, { dark: ['north', 'kar'] }] },
      { clock: 'Sunday', title: 'Eighteen hours.', body: 'Power returns city by city. Two years later, it would happen again.', simT: 85, hold: 8, mood: 'after', fx: [{ restore: ['north', 'kar'] }] },
    ],
  },
  {
    id: 'texas-2011',
    number: 18,
    title: 'The Warning',
    tagline: '2 February 2011. Texas freezes. Ten years before Uri.',
    diagram: {
      nodes: [
        { id: 'pl', label: 'Power plants', x: 150, y: 80, kind: 'gen' },
        { id: 'gas', label: 'Gas supply', x: 50, y: 80, kind: 'gen' },
        { id: 'hou', label: 'Houston', x: 300, y: 170, kind: 'city' },
        { id: 'dal', label: 'Dallas', x: 180, y: 200, kind: 'city' },
      ],
      links: [
        { id: 'gp', a: 'gas', b: 'pl' },
        { id: 'ph', a: 'pl', b: 'hou' },
        { id: 'pd', a: 'pl', b: 'dal' },
      ],
    },
    scenes: [
      { clock: '1 February, night', title: 'The cold arrives.', body: 'A front sweeps across Texas. Pipes and instruments at power plants begin to freeze.', simT: 0, hold: 6, mood: 'tension' },
      { clock: '05:10', title: 'Plants start failing.', body: 'Frozen sensing lines. Frozen valves. Units trip, others fail to start.', simT: 21, hold: 5, mood: 'impact', fx: [{ surge: 'gp' }] },
      { clock: '05:43', title: 'Rolling blackouts.', body: 'ERCOT orders four thousand megawatts of outages. Three million customers in the cold.', simT: 181, hold: 6, mood: 'dark', fx: [{ dark: ['dal', 'hou'] }] },
      { clock: 'Afternoon', title: 'A warning, filed away.', body: 'Investigators recommend winterising plants. Most of it stays voluntary. In 2021, the cold comes back.', simT: 500, hold: 8, mood: 'after', fx: [{ restore: ['dal', 'hou'] }] },
    ],
  },
];
