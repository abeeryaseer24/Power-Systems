import { MORE_EPISODES } from './episodes-more';
// Documentary episodes: the minute-by-minute lead-up to each blackout, told as
// scenes. `simT` is the replay time (seconds) the map is advanced to for the scene.
// `fx` drives the anatomy diagram: effects accumulate from scene to scene.

export type Fx =
  | { trip: string } // a link fails
  | { surge: string } // flow piles onto a link
  | { lose: string } // a node (plant, link) is lost
  | { dark: string[] } // nodes go black
  | { split: [number, number, number, number] } // a tear line across the diagram
  | { restore: string[] };

export interface Scene {
  clock: string;
  title: string;
  body?: string;
  simT: number;
  /** Seconds the scene stays on screen at normal speed. */
  hold: number;
  mood?: 'calm' | 'tension' | 'impact' | 'dark' | 'after';
  fx?: Fx[];
}

export interface DiagramNode { id: string; label: string; x: number; y: number; kind: 'gen' | 'city' | 'sub' | 'ext' }
export interface DiagramLink { id: string; a: string; b: string; label?: string }

export interface Episode {
  id: string;
  number: number;
  title: string;
  tagline: string;
  diagram: { nodes: DiagramNode[]; links: DiagramLink[] };
  scenes: Scene[];
}

export const EPISODES: Episode[] = [
  {
    id: 'bangladesh-2022',
    number: 1,
    title: 'The Afternoon Dhaka Went Dark',
    tagline: '4 October 2022. 140 million people. One line in the east.',
    diagram: {
      nodes: [
        { id: 'ash', label: 'Ashuganj', x: 330, y: 90, kind: 'gen' },
        { id: 'gho', label: 'Ghorashal', x: 250, y: 70, kind: 'gen' },
        { id: 'dha', label: 'Dhaka', x: 200, y: 150, kind: 'city' },
        { id: 'west', label: 'West and north', x: 70, y: 110, kind: 'city' },
        { id: 'ind', label: 'India HVDC', x: 40, y: 200, kind: 'ext' },
        { id: 'south', label: 'South-west', x: 150, y: 225, kind: 'city' },
      ],
      links: [
        { id: 'ag', a: 'ash', b: 'gho', label: '230 kV' },
        { id: 'gd', a: 'gho', b: 'dha' },
        { id: 'ad', a: 'ash', b: 'dha' },
        { id: 'dw', a: 'dha', b: 'west', label: 'Jamuna crossing' },
        { id: 'iw', a: 'ind', b: 'west' },
        { id: 'ds', a: 'dha', b: 'south' },
      ],
    },
    scenes: [
      { clock: '13:30', title: 'A Tuesday like any other.', body: 'Dhaka hums at eleven gigawatts. Garment factories, hospitals, water pumps, twenty million people.', simT: 0, hold: 6, mood: 'calm' },
      { clock: '13:58', title: 'The grid is running thin.', body: 'Gas is short. Reserves are low. In the east, the power stations of Ashuganj and Ghorashal push electricity west across the Jamuna.', simT: 8, hold: 6, mood: 'calm' },
      { clock: '14:04:10', title: 'Ashuganj. A breaker opens.', body: 'A 230 kV circuit in the eastern grid trips. On its own, it should be survivable.', simT: 20.2, hold: 5, mood: 'tension', fx: [{ trip: 'ag' }] },
      { clock: '14:04:11', title: 'The power has nowhere to go.', body: 'Megawatts that were flowing west slam onto the remaining lines. They swing. Relays read the swing as a fault.', simT: 21.3, hold: 5, mood: 'tension', fx: [{ surge: 'ad' }, { surge: 'dw' }] },
      { clock: '14:04:12', title: 'The country splits in two.', body: 'East and west tear apart. One side has too much power. The other has far too little.', simT: 22.5, hold: 5, mood: 'impact', fx: [{ trip: 'dw' }, { split: [140, 20, 120, 250] }] },
      { clock: '14:04:16', title: 'The link to India goes silent.', body: 'Voltage in the west collapses. The Bheramara converter blocks. Another thousand megawatts, gone.', simT: 26.2, hold: 5, mood: 'impact', fx: [{ lose: 'ind' }, { trip: 'iw' }] },
      { clock: '14:04:20', title: 'One by one, the generators give up.', body: 'Frequency falls past 48 hertz. Turbines protect themselves and trip. The load-shedding relays cannot keep up.', simT: 31, hold: 6, mood: 'impact', fx: [{ lose: 'ash' }, { lose: 'gho' }] },
      { clock: '14:05', title: 'Dhaka goes dark.', body: 'Traffic signals die on Airport Road. Lifts stop between floors. Across most of Bangladesh, the lights are out.', simT: 60, hold: 7, mood: 'dark', fx: [{ dark: ['dha', 'west', 'south'] }] },
      { clock: '14:30', title: 'Silence on the grid.', body: 'In control rooms, operators begin the slow climb back: Kaptai hydro first, then one substation at a time.', simT: 90, hold: 7, mood: 'dark' },
      { clock: '22:00', title: 'Power returns. The questions remain.', body: 'Dhaka is back by late night. The probe committee will ask how one trip in the east took down a nation.', simT: 140, hold: 8, mood: 'after', fx: [{ restore: ['dha', 'west', 'south'] }] },
    ],
  },
  {
    id: 'bangladesh-2014',
    number: 2,
    title: 'The Link That Held a Nation',
    tagline: '1 November 2014. A new cable from India. A grid with nothing in reserve.',
    diagram: {
      nodes: [
        { id: 'ind', label: 'India', x: 40, y: 120, kind: 'ext' },
        { id: 'bhe', label: 'Bheramara HVDC', x: 120, y: 120, kind: 'sub' },
        { id: 'west', label: 'West', x: 190, y: 70, kind: 'city' },
        { id: 'dha', label: 'Dhaka', x: 270, y: 140, kind: 'city' },
        { id: 'east', label: 'Eastern plants', x: 350, y: 90, kind: 'gen' },
        { id: 'south', label: 'South', x: 220, y: 220, kind: 'city' },
      ],
      links: [
        { id: 'ib', a: 'ind', b: 'bhe', label: '500 MW' },
        { id: 'bw', a: 'bhe', b: 'west' },
        { id: 'wd', a: 'west', b: 'dha' },
        { id: 'ed', a: 'east', b: 'dha' },
        { id: 'ds', a: 'dha', b: 'south' },
      ],
    },
    scenes: [
      { clock: '11:00', title: 'Saturday morning, Bangladesh.', body: 'Six gigawatts of demand, and almost every plant running near its limit.', simT: 0, hold: 6, mood: 'calm' },
      { clock: '11:20', title: 'A year-old lifeline.', body: 'The Bheramara HVDC station brings in nearly five hundred megawatts from India. It is the biggest single source on the grid.', simT: 8, hold: 6, mood: 'calm', fx: [{ surge: 'ib' }] },
      { clock: '11:27:00', title: 'Bheramara trips.', body: 'In a fraction of a second, the import is gone. There is no spinning reserve big enough to replace it.', simT: 15.2, hold: 5, mood: 'impact', fx: [{ trip: 'ib' }, { lose: 'ind' }] },
      { clock: '11:27:02', title: 'The frequency starts to fall.', body: '49.5 hertz. 49 hertz. The relays meant to shed load and save the grid do not act as designed.', simT: 17, hold: 5, mood: 'tension' },
      { clock: '11:27:04', title: 'The biggest machines let go.', body: 'Two of the largest running plants trip to save themselves. Each loss makes the next one certain.', simT: 20, hold: 5, mood: 'impact', fx: [{ lose: 'east' }] },
      { clock: '11:27:10', title: 'A nation in darkness.', body: 'Within seconds, the national grid collapses. 150 million people lose power.', simT: 40, hold: 7, mood: 'dark', fx: [{ dark: ['west', 'dha', 'south'] }] },
      { clock: 'Midnight', title: 'Twelve hours later.', body: 'Most of the country is back. The inquiry finds a grid that bet everything on one link, with no backup when it broke.', simT: 80, hold: 8, mood: 'after', fx: [{ restore: ['west', 'dha', 'south'] }] },
    ],
  },
  {
    id: 'gb-2019',
    number: 3,
    title: 'One Strike of Lightning',
    tagline: '9 August 2019. A routine fault. Two machines that should have held. A million homes cut off.',
    diagram: {
      nodes: [
        { id: 'hor', label: 'Hornsea One', x: 340, y: 50, kind: 'gen' },
        { id: 'lb', label: 'Little Barford', x: 200, y: 110, kind: 'gen' },
        { id: 'es', label: 'Eaton Socon', x: 230, y: 160, kind: 'sub' },
        { id: 'wy', label: 'Wymondley', x: 230, y: 230, kind: 'sub' },
        { id: 'lon', label: 'London', x: 120, y: 230, kind: 'city' },
        { id: 'gb', label: 'Rest of GB', x: 60, y: 90, kind: 'ext' },
      ],
      links: [
        { id: 'ew', a: 'es', b: 'wy', label: '400 kV' },
        { id: 'hl', a: 'hor', b: 'es' },
        { id: 'le', a: 'lb', b: 'es' },
        { id: 'wl', a: 'wy', b: 'lon' },
        { id: 'gl', a: 'gb', b: 'lon' },
      ],
    },
    scenes: [
      { clock: '16:45', title: 'A wet Friday afternoon.', body: 'Commuters head home. Wind is supplying a big share of Britain’s power. The grid is secured against losing one thousand megawatts.', simT: 0, hold: 6, mood: 'calm' },
      { clock: '16:52:33', title: 'Lightning hits the line.', body: 'A bolt strikes the Eaton Socon to Wymondley 400 kV line. Protection clears it in seventy milliseconds. Textbook.', simT: 15.1, hold: 5, mood: 'tension', fx: [{ trip: 'ew' }] },
      { clock: '16:52:33', title: 'Out at sea, Hornsea One falters.', body: 'The offshore wind farm’s controls go unstable after the dip. 737 megawatts vanish.', simT: 15.4, hold: 5, mood: 'impact', fx: [{ lose: 'hor' }] },
      { clock: '16:52:34', title: 'Little Barford trips.', body: 'A steam turbine shuts down. Five hundred megawatts of small generators disconnect on their own. The loss is already double what the grid is built for.', simT: 16, hold: 5, mood: 'impact', fx: [{ trip: 'le' }] },
      { clock: '16:52:58', title: '49.1 hertz. Holding.', body: 'Batteries and fast plants push back. The frequency stops falling. It starts to recover.', simT: 40, hold: 5, mood: 'tension' },
      { clock: '16:53:31', title: 'Then the second blow.', body: 'A gas turbine at Little Barford trips. Frequency plunges again.', simT: 72.2, hold: 5, mood: 'impact', fx: [{ lose: 'lb' }] },
      { clock: '16:53:49', title: '48.8 hertz. The relays act.', body: 'Automatic disconnection cuts 931 megawatts. A million homes go dark. Trains stop dead and will not restart.', simT: 74.5, hold: 6, mood: 'dark', fx: [{ dark: ['lon'] }] },
      { clock: '17:37', title: 'The grid survived.', body: 'Power is back within the hour. The sacrifice of a million homes kept the whole of Britain from going black.', simT: 115, hold: 8, mood: 'after', fx: [{ restore: ['lon'] }] },
    ],
  },
  {
    id: 'northeast-2003',
    number: 4,
    title: 'Fifty Million in the Dark',
    tagline: '14 August 2003. A software bug in Ohio. Trees under the wires. New York at rush hour.',
    diagram: {
      nodes: [
        { id: 'oh', label: 'Ohio', x: 60, y: 150, kind: 'sub' },
        { id: 'mi', label: 'Michigan', x: 120, y: 70, kind: 'sub' },
        { id: 'on', label: 'Ontario', x: 210, y: 50, kind: 'city' },
        { id: 'pa', label: 'Pennsylvania', x: 170, y: 190, kind: 'sub' },
        { id: 'ny', label: 'New York City', x: 330, y: 170, kind: 'city' },
        { id: 'ups', label: 'Upstate NY', x: 300, y: 80, kind: 'gen' },
      ],
      links: [
        { id: 'om', a: 'oh', b: 'mi' },
        { id: 'op', a: 'oh', b: 'pa', label: '345 kV' },
        { id: 'mo', a: 'mi', b: 'on' },
        { id: 'ou', a: 'on', b: 'ups' },
        { id: 'pn', a: 'pa', b: 'ny' },
        { id: 'un', a: 'ups', b: 'ny' },
      ],
    },
    scenes: [
      { clock: '14:14', title: 'The alarms go quiet.', body: 'In an Ohio control room, the alarm software fails silently. No one notices.', simT: 0, hold: 6, mood: 'calm' },
      { clock: '15:05', title: 'The first line touches a tree.', body: 'A 345 kV line sags in the heat and flashes over. It trips. On the operators’ screens, nothing.', simT: 4, hold: 5, mood: 'tension', fx: [{ trip: 'op' }] },
      { clock: '15:41', title: 'Two more lines. Then a dozen.', body: 'Each trip pushes power onto the next line. Each one sags. Ohio is coming apart, and no one sees it.', simT: 8, hold: 6, mood: 'tension', fx: [{ surge: 'om' }] },
      { clock: '16:05:57', title: 'Point of no return.', body: 'The Sammis–Star line trips on a relay that mistakes heavy load for a fault. The cascade begins.', simT: 14, hold: 5, mood: 'impact', fx: [{ trip: 'om' }, { surge: 'mo' }] },
      { clock: '16:10', title: 'Power swings across a continent.', body: 'Michigan, Ontario, Pennsylvania, New York. Lines and plants trip by the hundred in seconds.', simT: 16, hold: 5, mood: 'impact', fx: [{ trip: 'mo' }, { trip: 'pn' }, { split: [240, 20, 250, 250] }] },
      { clock: '16:10:39', title: 'New York City goes dark.', body: 'Cut off with too little generation, the city collapses. Subways stop. Millions walk home over the bridges.', simT: 24, hold: 7, mood: 'dark', fx: [{ dark: ['ny', 'on'] }] },
      { clock: '16:13', title: '61,800 megawatts lost.', body: 'Fifty million people across eight states and Ontario. The largest blackout in North American history.', simT: 60, hold: 7, mood: 'dark' },
      { clock: 'Next day', title: 'The lights come back.', body: 'It takes about 29 hours for all of New York. Within two years, grid rules in America become law.', simT: 85, hold: 8, mood: 'after', fx: [{ restore: ['ny', 'on'] }] },
    ],
  },
  {
    id: 'newyork-1977',
    number: 5,
    title: 'The Night of the Lightning',
    tagline: '13 July 1977. Four strikes on the Hudson. One hour. A city of nine million.',
    diagram: {
      nodes: [
        { id: 'ip', label: 'Indian Point', x: 120, y: 50, kind: 'gen' },
        { id: 'bu', label: 'Buchanan South', x: 160, y: 90, kind: 'sub' },
        { id: 'sp', label: 'Sprain Brook', x: 230, y: 130, kind: 'sub' },
        { id: 'nyc', label: 'New York City', x: 250, y: 210, kind: 'city' },
        { id: 'li', label: 'Long Island tie', x: 350, y: 200, kind: 'ext' },
        { id: 'nj', label: 'New Jersey ties', x: 90, y: 200, kind: 'ext' },
      ],
      links: [
        { id: 'ib', a: 'ip', b: 'bu' },
        { id: 'bs', a: 'bu', b: 'sp', label: '345 kV' },
        { id: 'sn', a: 'sp', b: 'nyc' },
        { id: 'ln', a: 'li', b: 'nyc' },
        { id: 'jn', a: 'nj', b: 'nyc' },
      ],
    },
    scenes: [
      { clock: '20:30', title: 'A heat-heavy summer night.', body: 'New York is drawing hard on power from upstate, carried south along a few high-voltage corridors.', simT: 0, hold: 6, mood: 'calm' },
      { clock: '20:37', title: 'Lightning strikes the Hudson.', body: 'A bolt near Buchanan South trips two 345 kV lines. Indian Point goes off line.', simT: 10.5, hold: 5, mood: 'impact', fx: [{ trip: 'ib' }, { lose: 'ip' }] },
      { clock: '20:55', title: 'It strikes again.', body: 'Two more lines from the north are gone. Everything left is overloaded.', simT: 121, hold: 5, mood: 'impact', fx: [{ trip: 'bs' }, { surge: 'jn' }, { surge: 'ln' }] },
      { clock: '21:19', title: 'Con Edison is running out of time.', body: 'Operators try to shed load and start reserve turbines. Several will not start.', simT: 401, hold: 6, mood: 'tension', fx: [{ trip: 'jn' }] },
      { clock: '21:36', title: 'The last tie opens.', body: 'Islanded with far too little generation, the system collapses. New York City is dark.', simT: 701, hold: 7, mood: 'dark', fx: [{ trip: 'ln' }, { dark: ['nyc'] }] },
      { clock: 'All night', title: 'A city on its own.', body: 'Twenty-five hours without power. The city would change its rules to keep generation inside its own borders.', simT: 880, hold: 8, mood: 'after' },
    ],
  },
  {
    id: 'texas-2021',
    number: 6,
    title: 'Four Minutes and Thirty-Seven Seconds',
    tagline: '15 February 2021. Texas freezes. The grid comes within minutes of collapse.',
    diagram: {
      nodes: [
        { id: 'gas', label: 'Gas fields', x: 60, y: 80, kind: 'gen' },
        { id: 'pl', label: 'Power plants', x: 170, y: 80, kind: 'gen' },
        { id: 'hou', label: 'Houston', x: 290, y: 170, kind: 'city' },
        { id: 'dal', label: 'Dallas', x: 210, y: 210, kind: 'city' },
        { id: 'aus', label: 'Austin', x: 100, y: 200, kind: 'city' },
      ],
      links: [
        { id: 'gp', a: 'gas', b: 'pl', label: 'fuel' },
        { id: 'ph', a: 'pl', b: 'hou' },
        { id: 'pd', a: 'pl', b: 'dal' },
        { id: 'pa', a: 'pl', b: 'aus' },
      ],
    },
    scenes: [
      { clock: '00:15', title: 'Texas declares an emergency.', body: 'Arctic air has driven demand to a winter record. Wells, pipelines and power plants are freezing.', simT: 0, hold: 6, mood: 'tension' },
      { clock: '01:23', title: 'Plants start dropping off.', body: 'Frozen instruments. Frozen fuel lines. Gigawatt after gigawatt of generation trips.', simT: 22, hold: 5, mood: 'impact', fx: [{ surge: 'gp' }] },
      { clock: '01:25', title: 'ERCOT orders blackouts.', body: 'One thousand megawatts of rolling outages. Then three thousand. It is not enough.', simT: 62, hold: 5, mood: 'tension', fx: [{ dark: ['aus'] }] },
      { clock: '01:43', title: 'The frequency keeps sliding.', body: 'Below 59.4 hertz, the clock starts. Generators will hold for nine minutes. After that, they let go.', simT: 300, hold: 6, mood: 'impact', fx: [{ trip: 'gp' }] },
      { clock: '01:51', title: '59.302 hertz.', body: 'Operators order more outages: ten thousand megawatts, then twenty. Millions of homes go cold and dark.', simT: 400, hold: 6, mood: 'dark', fx: [{ dark: ['dal', 'hou'] }] },
      { clock: '01:55', title: 'Four minutes, thirty-seven seconds.', body: 'The frequency recovers. Texas avoided a total collapse that could have lasted weeks.', simT: 600, hold: 7, mood: 'tension' },
      { clock: '15–18 February', title: 'The cost of survival.', body: 'Rolling outages last for days in freezing cold. 246 people die. The grid survived; many did not.', simT: 900, hold: 8, mood: 'after' },
    ],
  },
  {
    id: 'iberia-2025',
    number: 7,
    title: 'Twenty Seconds in April',
    tagline: '28 April 2025. Not too little power. Too much voltage.',
    diagram: {
      nodes: [
        { id: 'sol', label: 'Southern solar', x: 120, y: 220, kind: 'gen' },
        { id: 'sev', label: 'Seville', x: 70, y: 180, kind: 'sub' },
        { id: 'gra', label: 'Granada', x: 190, y: 190, kind: 'sub' },
        { id: 'mad', label: 'Madrid', x: 180, y: 110, kind: 'city' },
        { id: 'fr', label: 'France', x: 280, y: 30, kind: 'ext' },
        { id: 'por', label: 'Portugal', x: 50, y: 100, kind: 'city' },
      ],
      links: [
        { id: 'sg', a: 'sol', b: 'gra' },
        { id: 'ss', a: 'sol', b: 'sev' },
        { id: 'gm', a: 'gra', b: 'mad' },
        { id: 'sm', a: 'sev', b: 'mad' },
        { id: 'mf', a: 'mad', b: 'fr', label: 'interconnector' },
        { id: 'mp', a: 'mad', b: 'por' },
      ],
    },
    scenes: [
      { clock: '12:00', title: 'Sun over Spain.', body: 'A bright spring midday. Solar is supplying much of the peninsula. The grid has already shaken twice this hour.', simT: 0, hold: 6, mood: 'calm' },
      { clock: '12:32:57', title: 'Granada. A plant disconnects.', body: 'Voltages are rising. The first generator trips to protect itself.', simT: 15.2, hold: 5, mood: 'tension', fx: [{ trip: 'sg' }] },
      { clock: '12:33:16', title: 'Badajoz. Seville. Gone.', body: 'More plants trip on overvoltage. Each one removes voltage control. Voltage climbs higher.', simT: 31.2, hold: 5, mood: 'impact', fx: [{ trip: 'ss' }, { lose: 'sol' }] },
      { clock: '12:33:19', title: 'The cascade feeds itself.', body: 'Across the peninsula, protection trips plant after plant. Two point two gigawatts in twenty seconds.', simT: 34.2, hold: 5, mood: 'impact', fx: [{ surge: 'mf' }] },
      { clock: '12:33:21', title: 'Iberia breaks from Europe.', body: 'The link with France loses synchronism. Frequency and voltage collapse together.', simT: 36.2, hold: 5, mood: 'impact', fx: [{ trip: 'mf' }, { split: [230, 20, 250, 120] }] },
      { clock: '12:33:24', title: 'Spain and Portugal go black.', body: 'Madrid’s metro stops. Traffic lights die in Lisbon. Fifty-five million people, in under half a minute.', simT: 60, hold: 7, mood: 'dark', fx: [{ dark: ['mad', 'por'] }] },
      { clock: 'Next morning', title: 'A new kind of blackout.', body: 'Power returns overnight. Investigators study a grid that failed from too much voltage, not too little power.', simT: 78, hold: 8, mood: 'after', fx: [{ restore: ['mad', 'por'] }] },
    ],
  },
  {
    id: 'india-2012',
    number: 8,
    title: 'Half of India',
    tagline: '31 July 2012. 620 million people. The largest blackout in history, for the second day running.',
    diagram: {
      nodes: [
        { id: 'wr', label: 'Western Region', x: 80, y: 200, kind: 'gen' },
        { id: 'bina', label: 'Bina', x: 150, y: 160, kind: 'sub' },
        { id: 'gwa', label: 'Gwalior', x: 200, y: 110, kind: 'sub' },
        { id: 'del', label: 'Delhi', x: 230, y: 50, kind: 'city' },
        { id: 'nr', label: 'Northern Region', x: 300, y: 90, kind: 'city' },
        { id: 'er', label: 'Eastern Region', x: 340, y: 190, kind: 'city' },
      ],
      links: [
        { id: 'wb', a: 'wr', b: 'bina' },
        { id: 'bg', a: 'bina', b: 'gwa', label: '400 kV' },
        { id: 'gd', a: 'gwa', b: 'del' },
        { id: 'gn', a: 'gwa', b: 'nr' },
        { id: 'ne', a: 'nr', b: 'er' },
      ],
    },
    scenes: [
      { clock: '30 July, 02:33', title: 'The night before.', body: 'Northern India has already collapsed once. Three hundred million people lost power. By morning it is back.', simT: 0, hold: 6, mood: 'tension' },
      { clock: '31 July, 12:30', title: 'The same mistake.', body: 'A weak monsoon. Pumps and coolers running flat out. The north is drawing far more than scheduled, over too few lines.', simT: 8, hold: 6, mood: 'tension', fx: [{ surge: 'bg' }] },
      { clock: '12:58:19', title: 'Bina–Gwalior trips again.', body: 'A relay sees the heavy load as a fault. The north’s lifeline from the west is cut.', simT: 15.2, hold: 5, mood: 'impact', fx: [{ trip: 'bg' }] },
      { clock: '12:59', title: 'The north is on its own.', body: 'Islanded while importing thousands of megawatts. Frequency falls.', simT: 18.5, hold: 5, mood: 'impact', fx: [{ split: [120, 120, 260, 230] }] },
      { clock: '13:00', title: 'Three regions collapse.', body: 'North, east and north-east. Trains stop in tunnels. Miners are trapped underground. Delhi’s metro halts.', simT: 26, hold: 7, mood: 'dark', fx: [{ dark: ['del', 'nr', 'er'] }] },
      { clock: 'That night', title: 'Six hundred and twenty million.', body: 'Half of India, in the dark at once. Most power returns within fifteen hours.', simT: 80, hold: 8, mood: 'after', fx: [{ restore: ['del', 'nr', 'er'] }] },
    ],
  },
  {
    id: 'italy-2003',
    number: 9,
    title: 'A Tree in Switzerland',
    tagline: '28 September 2003. 3 am. Italy was importing a quarter of its power.',
    diagram: {
      nodes: [
        { id: 'ch', label: 'Switzerland', x: 120, y: 50, kind: 'ext' },
        { id: 'luk', label: 'Lukmanier', x: 90, y: 110, kind: 'sub' },
        { id: 'sb', label: 'San Bernardino', x: 170, y: 110, kind: 'sub' },
        { id: 'nit', label: 'Northern Italy', x: 140, y: 170, kind: 'city' },
        { id: 'rome', label: 'Rome', x: 230, y: 220, kind: 'city' },
        { id: 'fr', label: 'France', x: 40, y: 170, kind: 'ext' },
      ],
      links: [
        { id: 'cl', a: 'ch', b: 'luk', label: '380 kV' },
        { id: 'cs', a: 'ch', b: 'sb' },
        { id: 'ln', a: 'luk', b: 'nit' },
        { id: 'sn', a: 'sb', b: 'nit' },
        { id: 'fn', a: 'fr', b: 'nit' },
        { id: 'nr', a: 'nit', b: 'rome' },
      ],
    },
    scenes: [
      { clock: '03:00', title: 'Italy sleeps on borrowed power.', body: 'Six point four gigawatts flow in from its neighbours. Cheaper than running Italian plants at night.', simT: 0, hold: 6, mood: 'calm', fx: [{ surge: 'ln' }, { surge: 'sn' }] },
      { clock: '03:01:42', title: 'Lukmanier flashes over.', body: 'A Swiss line sags into a tree and trips. Its power shifts onto San Bernardino.', simT: 15.2, hold: 5, mood: 'tension', fx: [{ trip: 'cl' }, { trip: 'ln' }] },
      { clock: '03:11', title: 'Ten minutes of phone calls.', body: 'Swiss and Italian operators try to cut the import. It is too little, and too late.', simT: 60, hold: 6, mood: 'tension' },
      { clock: '03:25:21', title: 'San Bernardino goes.', body: 'The second line flashes over. In seconds every link to Italy trips. The country is on its own.', simT: 120.5, hold: 5, mood: 'impact', fx: [{ trip: 'sn' }, { trip: 'fn' }, { split: [30, 140, 250, 140] }] },
      { clock: '03:26', title: 'Italian plants trip early.', body: 'Frequency falls. Load shedding works. But generators let go before they should.', simT: 171, hold: 5, mood: 'impact' },
      { clock: '03:28', title: '47.5 hertz. Italy is dark.', body: 'Fifty-six million people. Rome’s Notte Bianca all-night festival ends in darkness.', simT: 240, hold: 7, mood: 'dark', fx: [{ dark: ['nit', 'rome'] }] },
      { clock: 'Sunday evening', title: 'Eighteen hours.', body: 'Power returns region by region. Europe’s operators learn to watch each other’s grids.', simT: 290, hold: 8, mood: 'after', fx: [{ restore: ['nit', 'rome'] }] },
    ],
  },
  {
    id: 'sa-2016',
    number: 10,
    title: 'The Storm That Blacked Out a State',
    tagline: '28 September 2016. Tornadoes. Six faults in two minutes. Then nothing.',
    diagram: {
      nodes: [
        { id: 'dav', label: 'Davenport', x: 90, y: 50, kind: 'sub' },
        { id: 'wind', label: 'Wind farms', x: 190, y: 60, kind: 'gen' },
        { id: 'bel', label: 'Belalie', x: 150, y: 110, kind: 'sub' },
        { id: 'adl', label: 'Adelaide', x: 130, y: 200, kind: 'city' },
        { id: 'hey', label: 'Heywood', x: 320, y: 220, kind: 'ext' },
      ],
      links: [
        { id: 'db', a: 'dav', b: 'bel', label: '275 kV' },
        { id: 'wb', a: 'wind', b: 'bel' },
        { id: 'ba', a: 'bel', b: 'adl' },
        { id: 'ha', a: 'hey', b: 'adl', label: 'interconnector' },
      ],
    },
    scenes: [
      { clock: '15:00', title: 'A storm rolls in.', body: 'Severe weather warnings across South Australia. Wind is supplying much of the state.', simT: 0, hold: 6, mood: 'tension' },
      { clock: '16:16:46', title: 'Tornadoes hit the towers.', body: 'Winds over 190 kilometres an hour fold steel pylons on the 275 kV lines from Davenport.', simT: 15.2, hold: 5, mood: 'impact', fx: [{ trip: 'db' }] },
      { clock: '16:17', title: 'Fault. Fault. Fault.', body: 'Six voltage dips in eighty-eight seconds. The wind farms ride through, again and again.', simT: 40, hold: 5, mood: 'tension' },
      { clock: '16:18:08', title: 'The wind farms quit.', body: 'Their protection allows only so many faults. 456 megawatts drop out at once.', simT: 51.2, hold: 5, mood: 'impact', fx: [{ lose: 'wind' }, { trip: 'wb' }, { surge: 'ha' }] },
      { clock: '16:18:15', title: 'Heywood overloads.', body: 'Power rushes in from Victoria to fill the gap. The interconnector’s protection trips it.', simT: 52.2, hold: 5, mood: 'impact', fx: [{ trip: 'ha' }, { split: [240, 140, 260, 260] }] },
      { clock: '16:18:16', title: 'Under a second.', body: 'Frequency collapses. All of South Australia goes black.', simT: 60, hold: 7, mood: 'dark', fx: [{ dark: ['adl'] }] },
      { clock: 'That night', title: 'Back by midnight, mostly.', body: 'Investigators find the wind farms behaved exactly as their settings told them to. Nobody had told the grid operator.', simT: 110, hold: 8, mood: 'after', fx: [{ restore: ['adl'] }] },
    ],
  },
  {
    id: 'hokkaido-2018',
    number: 11,
    title: 'Eighteen Minutes',
    tagline: '6 September 2018. An earthquake. One plant supplying half an island.',
    diagram: {
      nodes: [
        { id: 'ta', label: 'Tomato-Atsuma', x: 200, y: 160, kind: 'gen' },
        { id: 'hyd', label: 'Hydro', x: 260, y: 70, kind: 'gen' },
        { id: 'sap', label: 'Sapporo', x: 140, y: 90, kind: 'city' },
        { id: 'hok', label: 'Rest of Hokkaido', x: 320, y: 140, kind: 'city' },
        { id: 'hon', label: 'Honshu HVDC', x: 60, y: 220, kind: 'ext' },
      ],
      links: [
        { id: 'ts', a: 'ta', b: 'sap' },
        { id: 'th', a: 'ta', b: 'hok' },
        { id: 'hs', a: 'hyd', b: 'sap' },
        { id: 'hh', a: 'hyd', b: 'hok' },
        { id: 'ns', a: 'hon', b: 'sap', label: '600 MW' },
      ],
    },
    scenes: [
      { clock: '03:00', title: 'Hokkaido sleeps.', body: 'Demand is low. Tomato-Atsuma, the island’s biggest plant, carries about half of it.', simT: 0, hold: 6, mood: 'calm', fx: [{ surge: 'ts' }] },
      { clock: '03:07:59', title: 'The ground shakes.', body: 'Magnitude 6.7. Two of Tomato-Atsuma’s three units trip. Lines fall, cutting off hydro.', simT: 15.2, hold: 5, mood: 'impact', fx: [{ trip: 'hh' }, { trip: 'hs' }] },
      { clock: '03:08', title: 'Load shedding holds the line.', body: 'Relays cut demand. The link from Honshu ramps up. The frequency recovers.', simT: 30, hold: 6, mood: 'tension', fx: [{ surge: 'ns' }] },
      { clock: '03:15', title: 'Operators fight to stabilise.', body: 'The island is hanging on one last unit at Tomato-Atsuma.', simT: 500, hold: 6, mood: 'tension' },
      { clock: '03:25', title: 'The last unit fails.', body: 'Boiler damage from the quake. Tomato-Atsuma unit 1 trips. Nothing is left to replace it.', simT: 1061, hold: 5, mood: 'impact', fx: [{ lose: 'ta' }] },
      { clock: '03:25', title: 'All of Hokkaido goes black.', body: 'Two point nine five million households. The first full-area blackout in Japan’s history.', simT: 1100, hold: 7, mood: 'dark', fx: [{ dark: ['sap', 'hok'] }] },
      { clock: 'Two days later', title: 'Rebuilding an island.', body: 'Power takes about 45 hours to return. Japan builds a second link to Honshu.', simT: 1190, hold: 8, mood: 'after', fx: [{ restore: ['sap', 'hok'] }] },
    ],
  },
  {
    id: 'pakistan-2023',
    number: 12,
    title: 'A Quiet Winter Morning',
    tagline: '23 January 2023. Plants switched off to save fuel. 220 million people.',
    diagram: {
      nodes: [
        { id: 'north', label: 'Northern plants', x: 230, y: 40, kind: 'gen' },
        { id: 'dadu', label: 'Dadu', x: 190, y: 110, kind: 'sub' },
        { id: 'jam', label: 'Jamshoro', x: 150, y: 170, kind: 'sub' },
        { id: 'hub', label: 'Hub', x: 70, y: 210, kind: 'gen' },
        { id: 'kar', label: 'Karachi', x: 150, y: 230, kind: 'city' },
        { id: 'lah', label: 'Lahore', x: 320, y: 70, kind: 'city' },
      ],
      links: [
        { id: 'nd', a: 'north', b: 'dadu', label: '500 kV' },
        { id: 'dj', a: 'dadu', b: 'jam' },
        { id: 'hj', a: 'hub', b: 'jam' },
        { id: 'jk', a: 'jam', b: 'kar' },
        { id: 'nl', a: 'north', b: 'lah' },
      ],
    },
    scenes: [
      { clock: '06:00', title: 'Cold, still, and quiet.', body: 'Winter demand is at its lowest. To save fuel, many plants were shut down overnight.', simT: 0, hold: 6, mood: 'calm' },
      { clock: '07:30', title: 'A grid with little to hold it.', body: 'Few spinning machines. Long, lightly loaded lines pushing voltage up.', simT: 8, hold: 6, mood: 'tension' },
      { clock: '07:34', title: 'Voltage swings in the south.', body: 'Between Dadu and Jamshoro, voltage and frequency begin to oscillate. Protection trips a line.', simT: 15.2, hold: 5, mood: 'impact', fx: [{ trip: 'hj' }, { trip: 'dj' }] },
      { clock: '07:34:05', title: 'The generators follow.', body: 'Plant after plant trips across the south. The disturbance races north.', simT: 20.2, hold: 5, mood: 'impact', fx: [{ lose: 'hub' }, { trip: 'nd' }] },
      { clock: '07:34:08', title: 'Karachi is cut off.', body: 'The city separates from the national grid. Then the national grid itself collapses.', simT: 23.2, hold: 5, mood: 'impact', fx: [{ trip: 'jk' }] },
      { clock: '07:35', title: 'Pakistan goes dark.', body: 'Two hundred and twenty million people. Hospitals switch to generators. Mobile networks start to fail.', simT: 60, hold: 7, mood: 'dark', fx: [{ dark: ['kar', 'lah'] }] },
      { clock: 'Next morning', title: 'Twenty hours.', body: 'Power returns across the country. The lesson: keep enough machines running for stability, not just for energy.', simT: 110, hold: 8, mood: 'after', fx: [{ restore: ['kar', 'lah'] }] },
    ],
  },
];

EPISODES.push(...MORE_EPISODES);

export const episodeById = (id: string) => EPISODES.find((e) => e.id === id);
