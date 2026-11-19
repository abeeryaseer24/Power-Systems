// Episodes for the blackouts staged on the six newer regions. Ids match events-regions.ts.
import type { Episode } from './documentaries';
import { PENDING } from './events-regions';

const ALL: Episode[] = [
  {
    id: 'venezuela-2019',
    number: 19,
    title: 'The Dam at the End of the Line',
    tagline: '7 March 2019. One dam, one corridor, thirty million people.',
    diagram: {
      nodes: [
        { id: 'guri', label: 'Guri dam', x: 330, y: 200, kind: 'gen' },
        { id: 'mal', label: 'Malena', x: 250, y: 150, kind: 'sub' },
        { id: 'sg', label: 'San Gerónimo', x: 170, y: 100, kind: 'sub' },
        { id: 'ccs', label: 'Caracas', x: 210, y: 40, kind: 'city' },
        { id: 'west', label: 'The west', x: 60, y: 90, kind: 'city' },
        { id: 'thermal', label: 'Thermal plants (mostly idle)', x: 90, y: 200, kind: 'gen' },
      ],
      links: [
        { id: 'gm', a: 'guri', b: 'mal', label: '765 kV' },
        { id: 'ms', a: 'mal', b: 'sg', label: '765 kV' },
        { id: 'sc', a: 'sg', b: 'ccs' },
        { id: 'sw', a: 'sg', b: 'west' },
        { id: 'tw', a: 'thermal', b: 'west' },
      ],
    },
    scenes: [
      { clock: '16:30', title: 'A country on one dam', body: 'Guri, on the Caroní river, supplies most of Venezuela’s electricity. It travels hundreds of kilometres to the cities on a handful of 765 kV lines.', simT: 5, hold: 9, mood: 'calm', fx: [{ surge: 'gm' }, { surge: 'ms' }] },
      { clock: '16:45', title: 'The backup is broken', body: 'The oil and gas plants near Caracas and in the west should carry the load if Guri is cut off. Most of them have not run properly in years.', simT: 15, hold: 9, mood: 'tension', fx: [{ lose: 'thermal' }] },
      { clock: '16:53', title: 'Fire under the lines', body: 'Brush burns beneath the corridor. Smoke and heat ionise the air, and a 765 kV line flashes over to the ground.', simT: 20.5, hold: 8, mood: 'impact', fx: [{ trip: 'gm' }] },
      { clock: '16:53', title: 'The others follow', body: 'The power that line carried jumps onto the rest. They overload and trip. Guri is alone.', simT: 22.5, hold: 8, mood: 'impact', fx: [{ trip: 'ms' }] },
      { clock: '16:54', title: 'The turbines run away', body: 'With nowhere to send its power, Guri’s turbines speed up until protection trips them. The country has lost most of its supply.', simT: 24, hold: 8, mood: 'impact', fx: [{ lose: 'guri' }] },
      { clock: '16:54', title: 'Venezuela goes dark', body: 'Caracas, Maracaibo, Valencia. Hospitals on generators, water pumps stopped, phones dead within hours.', simT: 34, hold: 10, mood: 'dark', fx: [{ dark: ['ccs', 'west', 'sg', 'mal'] }] },
      { clock: 'The next five days', title: 'It keeps failing', body: 'Every attempt to restart the weakened grid trips again. Some cities wait five days. Two more national blackouts follow that year.', simT: 80, hold: 12, mood: 'after' },
    ],
  },
  {
    id: 'brazil-2009',
    number: 20,
    title: 'Fourteen Gigawatts',
    tagline: '10 November 2009. A storm over Itaipu, and São Paulo and Rio go dark at ten at night.',
    diagram: {
      nodes: [
        { id: 'itaipu', label: 'Itaipu', x: 50, y: 150, kind: 'gen' },
        { id: 'iva', label: 'Ivaiporã', x: 150, y: 120, kind: 'sub' },
        { id: 'ita', label: 'Itaberá', x: 240, y: 100, kind: 'sub' },
        { id: 'sp', label: 'São Paulo', x: 350, y: 80, kind: 'city' },
        { id: 'dc', label: 'HVDC to Ibiúna', x: 230, y: 200, kind: 'sub' },
        { id: 'py', label: 'Paraguay', x: 40, y: 240, kind: 'city' },
      ],
      links: [
        { id: 'ai', a: 'itaipu', b: 'iva', label: '765 kV' },
        { id: 'it', a: 'iva', b: 'ita', label: '765 kV' },
        { id: 'ts', a: 'ita', b: 'sp' },
        { id: 'ad', a: 'itaipu', b: 'dc', label: '±600 kV DC' },
        { id: 'ds', a: 'dc', b: 'sp' },
        { id: 'ap', a: 'itaipu', b: 'py' },
      ],
    },
    scenes: [
      { clock: '22:00', title: 'The biggest dam in the west', body: 'Itaipu sends power east to São Paulo by two roads: high-voltage DC from its 50 Hz turbines and three 765 kV AC lines from its 60 Hz ones.', simT: 5, hold: 9, mood: 'calm', fx: [{ surge: 'it' }, { surge: 'ad' }] },
      { clock: '22:10', title: 'The storm', body: 'Heavy rain and wind sweep across Paraná and São Paulo. Water and dirt build up on the insulators at Itaberá.', simT: 15, hold: 8, mood: 'tension' },
      { clock: '22:13:06', title: 'Flashover', body: 'Three short circuits at Itaberá in quick succession. The 765 kV lines trip.', simT: 20.3, hold: 8, mood: 'impact', fx: [{ trip: 'it' }, { lose: 'ita' }] },
      { clock: '22:13:07', title: 'The DC blocks too', body: 'In the disturbance the HVDC converters block. Both roads out of Itaipu are closed.', simT: 21, hold: 8, mood: 'impact', fx: [{ trip: 'ad' }, { trip: 'ai' }] },
      { clock: '22:13:08', title: 'Fourteen gigawatts gone', body: 'The south-east loses a fifth of its supply in a second. Frequency falls. Plants trip to protect themselves.', simT: 24, hold: 9, mood: 'impact', fx: [{ lose: 'itaipu' }] },
      { clock: '22:14', title: 'Eighteen states go dark', body: 'São Paulo, Rio de Janeiro, Minas Gerais. All of Paraguay. Sixty million people at ten at night.', simT: 32, hold: 10, mood: 'dark', fx: [{ dark: ['sp', 'py', 'dc', 'iva'] }] },
      { clock: '03:00', title: 'Back by morning', body: 'Most cities are restored within a few hours. Brazil rewrites its defence schemes so losing Itaipu never takes the south-east with it again.', simT: 80, hold: 12, mood: 'after' },
    ],
  },
  {
    id: 'turkey-2015',
    number: 21,
    title: 'East Meets West',
    tagline: '31 March 2015. Türkiye tears in two along Anatolia, and neither half survives.',
    diagram: {
      nodes: [
        { id: 'east', label: 'Eastern hydro and lignite', x: 340, y: 130, kind: 'gen' },
        { id: 'ana', label: 'Central Anatolia', x: 220, y: 130, kind: 'sub' },
        { id: 'ist', label: 'Istanbul', x: 90, y: 60, kind: 'city' },
        { id: 'izm', label: 'Izmir and the west', x: 60, y: 170, kind: 'city' },
        { id: 'eu', label: 'Europe', x: 30, y: 30, kind: 'ext' },
      ],
      links: [
        { id: 'ea', a: 'east', b: 'ana', label: '400 kV' },
        { id: 'ai', a: 'ana', b: 'ist', label: '400 kV' },
        { id: 'az', a: 'ana', b: 'izm' },
        { id: 'ie', a: 'ist', b: 'eu', label: 'Thrace ties' },
      ],
    },
    scenes: [
      { clock: '10:00', title: 'Power runs west', body: 'A Tuesday morning. The dams and lignite plants of the east are pushing thousands of megawatts toward the factories and cities of the west.', simT: 5, hold: 9, mood: 'calm', fx: [{ surge: 'ea' }, { surge: 'ai' }] },
      { clock: '10:30', title: 'Lines out for work', body: 'Several 400 kV lines on the central corridor are switched out for maintenance. The rest carry more than usual.', simT: 15, hold: 8, mood: 'tension' },
      { clock: '10:36:27', title: 'One line trips', body: 'A heavily loaded line in central Anatolia trips on overload. Its power moves onto its neighbours.', simT: 20.5, hold: 8, mood: 'impact', fx: [{ trip: 'ea' }] },
      { clock: '10:36:29', title: 'The country splits', body: 'The parallel lines lose step and open. Türkiye is now two islands: the east with far too much power, the west with far too little.', simT: 22, hold: 9, mood: 'impact', fx: [{ split: [220, 20, 260, 250] }] },
      { clock: '10:36:30', title: 'Europe lets go', body: 'Protection opens the ties to Bulgaria and Greece so the disturbance cannot spread into the continent.', simT: 23, hold: 8, mood: 'impact', fx: [{ trip: 'ie' }] },
      { clock: '10:36:38', title: 'Seventy million in the dark', body: 'Both islands collapse. Istanbul’s metro stops, traffic lights go out, and factories across the country fall silent.', simT: 32, hold: 10, mood: 'dark', fx: [{ dark: ['ist', 'izm', 'ana', 'east'] }] },
      { clock: 'Evening', title: 'A day to rebuild', body: 'Restoration takes most of the day. ENTSO-E’s inquiry asks for tighter transfer limits and a defence plan for exactly this split.', simT: 80, hold: 12, mood: 'after' },
    ],
  },
  {
    id: 'srilanka-2020',
    number: 22,
    title: 'Island',
    tagline: '17 August 2020. A small grid with no neighbours loses its biggest power station at lunchtime.',
    diagram: {
      nodes: [
        { id: 'lak', label: 'Lakvijaya coal', x: 80, y: 60, kind: 'gen' },
        { id: 'ker', label: 'Kerawalapitiya', x: 140, y: 140, kind: 'sub' },
        { id: 'col', label: 'Colombo', x: 150, y: 210, kind: 'city' },
        { id: 'hyd', label: 'Hill-country hydro', x: 300, y: 140, kind: 'gen' },
        { id: 'kan', label: 'Kandy', x: 280, y: 70, kind: 'city' },
      ],
      links: [
        { id: 'lk', a: 'lak', b: 'ker', label: '220 kV' },
        { id: 'kc', a: 'ker', b: 'col' },
        { id: 'hk', a: 'hyd', b: 'ker', label: '220 kV' },
        { id: 'hka', a: 'hyd', b: 'kan' },
      ],
    },
    scenes: [
      { clock: '12:00', title: 'No one to call', body: 'Sri Lanka’s grid is an island in every sense: no cable to India, no neighbour to lend power. Whatever it loses, it must cover itself.', simT: 5, hold: 9, mood: 'calm' },
      { clock: '12:15', title: 'One plant, a big share', body: 'At Norochcholai, the Lakvijaya coal station is producing a large share of the island’s midday power.', simT: 12, hold: 8, mood: 'calm', fx: [{ surge: 'lk' }] },
      { clock: '12:30', title: 'A fault in the substation', body: 'During work at Kerawalapitiya, north of Colombo, a fault hits the network.', simT: 20.3, hold: 8, mood: 'impact', fx: [{ lose: 'ker' }] },
      { clock: '12:30', title: 'Lakvijaya trips', body: 'The voltage dip trips the coal units. In a second the island loses its biggest source of power.', simT: 21, hold: 8, mood: 'impact', fx: [{ lose: 'lak' }, { trip: 'lk' }] },
      { clock: '12:31', title: 'Too fast to catch', body: 'With so little spinning mass, frequency drops in moments. Load shedding cannot keep up.', simT: 26, hold: 8, mood: 'tension' },
      { clock: '12:31', title: 'The whole island goes dark', body: 'Twenty-one million people. Colombo, Kandy, Jaffna, Galle.', simT: 30, hold: 10, mood: 'dark', fx: [{ dark: ['col', 'kan', 'hyd'] }] },
      { clock: 'Evening', title: 'Hydro first', body: 'The hill-country hydro plants restart the grid. Most of the island is back by evening. The coal units take days.', simT: 80, hold: 12, mood: 'after', fx: [{ restore: ['hyd', 'kan', 'col'] }] },
    ],
  },
  {
    id: 'moscow-2005',
    number: 23,
    title: 'The Hot Morning',
    tagline: '25 May 2005. An old substation burns, and Moscow unravels line by line.',
    diagram: {
      nodes: [
        { id: 'chag', label: 'Chagino', x: 230, y: 130, kind: 'sub' },
        { id: 'ring', label: '500 kV ring', x: 130, y: 60, kind: 'sub' },
        { id: 'south', label: 'South Moscow', x: 200, y: 220, kind: 'city' },
        { id: 'tula', label: 'Tula, Kaluga, Ryazan', x: 340, y: 220, kind: 'city' },
        { id: 'center', label: 'City centre', x: 110, y: 160, kind: 'city' },
      ],
      links: [
        { id: 'rc', a: 'ring', b: 'chag', label: '500 kV' },
        { id: 'cs', a: 'chag', b: 'south', label: '220 kV' },
        { id: 'ct', a: 'chag', b: 'tula' },
        { id: 'rce', a: 'ring', b: 'center' },
        { id: 'ces', a: 'center', b: 'south', label: '110 kV' },
      ],
    },
    scenes: [
      { clock: '24 May, 20:00', title: 'A fire at Chagino', body: 'A current transformer catches fire at a substation built in the 1950s. Equipment is switched out. Nobody expects a crisis.', simT: 2, hold: 9, mood: 'tension', fx: [{ lose: 'chag' }] },
      { clock: '25 May, 08:00', title: 'Heat', body: 'It is unusually hot. Air conditioners and fans run across the city. The lines around Chagino are carrying more than they should.', simT: 15, hold: 8, mood: 'tension', fx: [{ surge: 'cs' }, { surge: 'ces' }] },
      { clock: '09:00', title: 'More fails', body: 'Further equipment at Chagino breaks down. Another path into the south of the city is gone.', simT: 22, hold: 8, mood: 'impact', fx: [{ trip: 'rc' }] },
      { clock: '10:30', title: 'Lines begin to sag', body: 'Hot conductors stretch and droop. One by one, overloaded lines touch trees or trip on protection, and each pushes more onto the next.', simT: 62, hold: 9, mood: 'tension', fx: [{ trip: 'ces' }] },
      { clock: '11:00', title: 'The south goes dark', body: 'Supply fails across southern Moscow and three neighbouring regions. The metro stops with twenty thousand people in the tunnels.', simT: 92, hold: 10, mood: 'dark', fx: [{ trip: 'cs' }, { trip: 'ct' }, { dark: ['south', 'tula'] }] },
      { clock: 'Evening', title: 'A slow cascade', body: 'It took hours, not seconds. Earlier load shedding could have stopped it. Moscow spent billions rebuilding its grid in the years that followed.', simT: 150, hold: 12, mood: 'after' },
    ],
  },
  {
    id: 'central-asia-2022',
    number: 24,
    title: 'The Ring Breaks',
    tagline: '25 January 2022. A shortage in one country overloads the lines of another, and three capitals go dark.',
    diagram: {
      nodes: [
        { id: 'north', label: 'North Kazakhstan and Russia', x: 200, y: 30, kind: 'ext' },
        { id: 'alm', label: 'Almaty', x: 330, y: 90, kind: 'city' },
        { id: 'bish', label: 'Bishkek', x: 270, y: 140, kind: 'city' },
        { id: 'tash', label: 'Tashkent', x: 130, y: 170, kind: 'city' },
        { id: 'syr', label: 'Uzbek plants', x: 90, y: 230, kind: 'gen' },
        { id: 'tok', label: 'Toktogul hydro', x: 250, y: 220, kind: 'gen' },
      ],
      links: [
        { id: 'na', a: 'north', b: 'alm', label: '500 kV transit' },
        { id: 'ab', a: 'alm', b: 'bish' },
        { id: 'bt', a: 'bish', b: 'tash', label: '500 kV ring' },
        { id: 'st', a: 'syr', b: 'tash' },
        { id: 'tb', a: 'tok', b: 'bish' },
      ],
    },
    scenes: [
      { clock: '10:30', title: 'A cold morning', body: 'Heating demand is high across Central Asia. The southern ring is drawing power from the north through Kazakhstan’s 500 kV transit.', simT: 5, hold: 9, mood: 'calm', fx: [{ surge: 'na' }] },
      { clock: '11:00', title: 'A hole in Uzbekistan', body: 'A large deficit opens in the Uzbek system. Somewhere, generation is no longer matching demand.', simT: 20.5, hold: 8, mood: 'impact', fx: [{ lose: 'syr' }] },
      { clock: '11:00', title: 'The north pays', body: 'Power rushes south to fill the gap, through lines in Kazakhstan that were never built for it.', simT: 21.5, hold: 8, mood: 'tension', fx: [{ surge: 'ab' }, { surge: 'bt' }] },
      { clock: '11:00', title: 'Cut loose', body: 'The transit lines overload. Protection disconnects them. The southern ring is on its own and short of power.', simT: 23, hold: 8, mood: 'impact', fx: [{ trip: 'na' }] },
      { clock: '11:01', title: 'Three countries go dark', body: 'Tashkent, Bishkek, Almaty, Shymkent. The metro stops, flights are grounded, and homes lose heat in the middle of winter.', simT: 32, hold: 10, mood: 'dark', fx: [{ dark: ['tash', 'bish', 'alm'] }] },
      { clock: 'Night', title: 'Neighbours again', body: 'Power returns through the evening. Each country blamed another at first. The physics did not care whose deficit it was.', simT: 80, hold: 12, mood: 'after' },
    ],
  },
];

export const REGION_EPISODES = ALL.filter((e) => !PENDING.has(e.id));
