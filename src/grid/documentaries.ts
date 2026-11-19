// Documentary episodes: the minute-by-minute lead-up to each blackout, told as
// scenes. `simT` is the replay time (seconds) the map is advanced to for the scene.

export interface Scene {
  clock: string;
  title: string;
  body?: string;
  simT: number;
  /** Seconds the scene stays on screen at normal speed. */
  hold: number;
  mood?: 'calm' | 'tension' | 'impact' | 'dark' | 'after';
}

export interface Episode {
  id: string;
  number: number;
  title: string;
  tagline: string;
  scenes: Scene[];
}

export const EPISODES: Episode[] = [
  {
    id: 'bangladesh-2022',
    number: 1,
    title: 'The Afternoon Dhaka Went Dark',
    tagline: '4 October 2022. 140 million people. One line in the east.',
    scenes: [
      { clock: '13:30', title: 'A Tuesday like any other.', body: 'Dhaka hums at eleven gigawatts. Garment factories, hospitals, water pumps, twenty million people.', simT: 0, hold: 6, mood: 'calm' },
      { clock: '13:58', title: 'The grid is running thin.', body: 'Gas is short. Reserves are low. In the east, the power stations of Ashuganj and Ghorashal push electricity west across the Jamuna.', simT: 8, hold: 6, mood: 'calm' },
      { clock: '14:04:10', title: 'Ashuganj. A breaker opens.', body: 'A 230 kV circuit in the eastern grid trips. On its own, it should be survivable.', simT: 20.2, hold: 5, mood: 'tension' },
      { clock: '14:04:11', title: 'The power has nowhere to go.', body: 'Megawatts that were flowing west slam onto the remaining lines. They swing. Relays read the swing as a fault.', simT: 21.3, hold: 5, mood: 'tension' },
      { clock: '14:04:12', title: 'The country splits in two.', body: 'East and west tear apart. One side has too much power. The other has far too little.', simT: 22.5, hold: 5, mood: 'impact' },
      { clock: '14:04:16', title: 'The link to India goes silent.', body: 'Voltage in the west collapses. The Bheramara converter blocks. Another thousand megawatts, gone.', simT: 26.2, hold: 5, mood: 'impact' },
      { clock: '14:04:20', title: 'One by one, the generators give up.', body: 'Frequency falls past 48 hertz. Turbines protect themselves and trip. The load-shedding relays cannot keep up.', simT: 31, hold: 6, mood: 'impact' },
      { clock: '14:05', title: 'Dhaka goes dark.', body: 'Traffic signals die on Airport Road. Lifts stop between floors. Across most of Bangladesh, the lights are out.', simT: 60, hold: 7, mood: 'dark' },
      { clock: '14:30', title: 'Silence on the grid.', body: 'In control rooms, operators begin the slow climb back: Kaptai hydro first, then one substation at a time.', simT: 90, hold: 7, mood: 'dark' },
      { clock: '22:00', title: 'Power returns. The questions remain.', body: 'Dhaka is back by late night. The probe committee will ask how one trip in the east took down a nation.', simT: 140, hold: 8, mood: 'after' },
    ],
  },
];

export const episodeById = (id: string) => EPISODES.find((e) => e.id === id);
