import type { CaseFile } from './cases';
import { PENDING } from './events-regions';

const ALL: CaseFile[] = [
  {
    id: 'venezuela-2019',
    verdict: 'Most of Venezuela’s power came from one dam over one corridor. When the 765 kV lines out of Guri tripped, the dam had nowhere to send its power, and the rest of the grid had too little working generation to stand on its own.',
    before: [
      'Guri supplied most of the national demand through three 765 kV lines running north and west.',
      'Years of under-investment had left much of the thermal fleet near Caracas and in the west unavailable, so the cities depended on Guri’s power arriving over the corridor.',
    ],
    sequence: [
      { time: '16:53', text: 'Lines in the 765 kV corridor out of Guri trip. Independent engineers point to a vegetation fire beneath them; the government blames sabotage.' },
      { time: '16:53', text: 'Flow moves onto the remaining circuits, which trip in turn. Guri is separated from the load.' },
      { time: '16:54', text: 'Guri’s turbines over-speed and trip. The north and west are short of most of their supply.' },
      { time: '16:54', text: 'Frequency collapses. Almost the whole country loses power.' },
      { time: 'Next days', text: 'Partial restoration, with further collapses as the weakened system was reloaded. Some regions were without power for about five days.' },
    ],
    mechanisms: [
      { title: 'One corridor is a single point of failure', body: 'When most of the supply crosses one corridor, losing it removes most of the generation at once. No under-frequency scheme sheds that much load fast enough.', lesson: 'frequency' },
      { title: 'A plant with no outlet speeds up', body: 'Cut off from its load, a generator’s turbine power has nowhere to go. It accelerates until over-speed protection trips it, so the surplus side fails too.', lesson: 'frequency' },
      { title: 'Restoring a stressed grid is fragile', body: 'Re-energising a system with little reserve and damaged equipment led to repeated collapses. Each attempt has to pick up load in steps the generation can follow.', lesson: 'blackstart' },
    ],
    causes: [
      { kind: 'trigger', text: 'Tripping of the 765 kV lines out of Guri; a fire under the lines according to independent engineers.' },
      { kind: 'planning', text: 'Extreme dependence on one plant and corridor.' },
      { kind: 'people', text: 'Years of skipped maintenance, including vegetation clearance.' },
      { kind: 'planning', text: 'Thermal plants near the load largely unavailable.' },
    ],
    numbers: [['People affected', 'About 30 million'], ['Share of supply from Guri', 'Roughly 70–80 %'], ['Longest outages', 'About five days']],
    aftermath: ['Further national blackouts followed in March and July 2019.', 'Rationing of electricity continued in many regions.'],
    again: 'As long as the grid leans on one corridor and local plants stay broken, the same failure can repeat.',
  },
  {
    id: 'brazil-2009',
    verdict: 'Bad weather caused short circuits at one 765 kV substation, which disconnected Itaipu’s AC lines while its HVDC link also blocked, removing about 14 GW of supply from south-east Brazil in seconds.',
    before: [
      'Late evening in November. Itaipu was producing heavily, sending power to São Paulo over its HVDC link and three 765 kV AC lines.',
      'Heavy rain and wind were moving across Paraná and São Paulo states.',
    ],
    sequence: [
      { time: '22:13', text: 'Insulator flashovers at the Itaberá 765 kV substation trip the AC circuits from Itaipu.' },
      { time: '22:13', text: 'The HVDC bipoles block in the disturbance. All of Itaipu’s output is cut off.' },
      { time: '22:13', text: 'The south-east is short of about 14 GW. Frequency falls, load shedding and generator trips follow.' },
      { time: '22:14', text: 'About 24 GW of load is lost across 18 states. Paraguay loses supply entirely.' },
      { time: '23:00–03:00', text: 'Restoration area by area; most supply back within a few hours.' },
    ],
    mechanisms: [
      { title: 'Two corridors, one event', body: 'Itaipu’s output was split between AC and DC paths, but a single substation disturbance took both out. Redundancy that can fail together is not redundancy.', lesson: 'cascade' },
      { title: 'Losing a giant infeed', body: 'Fourteen gigawatts is far beyond the reserve any part of the grid holds. Frequency falls faster than load shedding can follow, and the collapse spreads.', lesson: 'frequency' },
    ],
    causes: [
      { kind: 'weather', text: 'Heavy rain and wind causing insulator flashovers at Itaberá.' },
      { kind: 'design', text: 'Substation insulation and protection that let one site disconnect all AC paths.' },
      { kind: 'protection', text: 'Special protection schemes not able to keep the south-east in balance after losing Itaipu.' },
    ],
    numbers: [['People affected', 'About 60 million in Brazil, plus Paraguay'], ['Itaipu output lost', 'About 14 GW'], ['Load lost', 'About 24 GW (≈ 40 % of Brazil)']],
    aftermath: ['ONS revised special protection schemes for loss of Itaipu.', 'Insulation upgrades at the 765 kV substations.'],
    again: 'Large remote hydro over long corridors is efficient and exposed. Defence schemes now shed load and generation together to keep the rest standing.',
  },
  {
    id: 'turkey-2015',
    verdict: 'With heavy power flowing west across a weakened 400 kV corridor, one line trip split Türkiye into an eastern surplus island and a western deficit island, and neither could survive the imbalance.',
    before: [
      'A weekday morning. Hydro and lignite in the east were exporting to the industrial west.',
      'Several 400 kV lines on the central corridor were out for maintenance, reducing its capacity.',
    ],
    sequence: [
      { time: '10:36:27', text: 'A heavily loaded east–west 400 kV line trips.' },
      { time: '10:36:28', text: 'Parallel lines take its flow, lose synchronism, and open. The grid separates into east and west.' },
      { time: '10:36:30', text: 'Interconnection protection opens the ties to Bulgaria and Greece.' },
      { time: '10:36:38', text: 'The western island collapses on under-frequency; the eastern island fails on over-frequency and instability.' },
      { time: 'Afternoon', text: 'Restoration through the day; most of the country back within about seven to nine hours.' },
    ],
    mechanisms: [
      { title: 'Transfer becomes imbalance', body: 'The more power flows between two areas before a split, the larger each island’s imbalance after it. Heavy east–west transfer made the split fatal.', lesson: 'powerflow' },
      { title: 'Losing synchronism', body: 'As a corridor weakens, the angle between its ends grows. Past a limit, the two sides slip apart and out-of-step protection separates them.', lesson: 'cascade' },
    ],
    causes: [
      { kind: 'trigger', text: 'Trip of a heavily loaded 400 kV line.' },
      { kind: 'planning', text: 'High east-to-west transfer with corridor lines out for maintenance.' },
      { kind: 'protection', text: 'No defence plan sized for an east–west separation.' },
    ],
    numbers: [['People affected', 'About 70 million'], ['Demand before the event', 'About 32 GW'], ['Restoration', 'Most areas within 7–9 hours']],
    aftermath: ['ENTSO-E’s investigation recommended stronger security assessment and defence plans.'],
    again: 'Any grid with a long corridor between generation and load faces the same risk if transfers are not limited to what a split can survive.',
  },
  {
    id: 'srilanka-2020',
    verdict: 'A fault during work at one substation tripped the 900 MW Lakvijaya coal plant, and Sri Lanka’s small, isolated grid could not absorb the loss of so much generation at once.',
    before: ['Midday on a Monday. Lakvijaya was supplying a large share of the island’s demand. Sri Lanka has no interconnection to share reserves.'],
    sequence: [
      { time: '12:30', text: 'A fault occurs during maintenance work at Kerawalapitiya substation.' },
      { time: '12:30', text: 'The disturbance trips the Lakvijaya coal units at Norochcholai.' },
      { time: '12:31', text: 'Frequency collapses faster than load shedding can follow. The island goes dark.' },
      { time: 'Evening', text: 'Supply restored from hydro and other plants over about seven to eight hours; the coal units take days.' },
    ],
    mechanisms: [
      { title: 'Small grids have little inertia', body: 'With few machines spinning, frequency falls very fast after a big loss. Load-shedding relays have only moments to act.', lesson: 'frequency' },
      { title: 'The largest unit sets the reserve', body: 'A grid must carry enough reserve to survive losing its largest infeed. When one plant is a large share of demand, that is expensive, and often not done.', lesson: 'frequency' },
    ],
    causes: [
      { kind: 'trigger', text: 'Fault during work at Kerawalapitiya substation.' },
      { kind: 'people', text: 'Work procedures in the substation, according to the PUCSL investigation.' },
      { kind: 'planning', text: 'Reserve and load shedding too small for the trip of Lakvijaya.' },
    ],
    numbers: [['People affected', 'About 21 million'], ['Lakvijaya capacity', '900 MW'], ['Duration', 'Up to about 8 hours']],
    aftermath: ['PUCSL recommended changes to maintenance practice and system protection.', 'Another island-wide blackout followed in February 2025.'],
    again: 'Repeated island-wide blackouts show the risk remains while one plant dominates a small isolated grid.',
  },
  {
    id: 'moscow-2005',
    verdict: 'A fire at the ageing Chagino substation removed key equipment, and as more failed in hot weather, overloaded lines tripped one after another until much of southern Moscow lost supply.',
    before: [
      'Unusually hot late May. Demand for cooling was high.',
      'The evening before, a current transformer at Chagino caught fire and equipment was taken out of service.',
    ],
    sequence: [
      { time: '24 May, evening', text: 'Fire in a current transformer at Chagino; equipment disconnected.' },
      { time: '25 May, morning', text: 'Further equipment at Chagino fails. Neighbouring lines take on more load.' },
      { time: '10:00–11:00', text: 'Overloaded 220 and 110 kV lines sag and trip. Each trip loads the next path.' },
      { time: '11:00', text: 'Supply lost across southern Moscow and parts of the Moscow, Tula, Kaluga and Ryazan regions. The metro stops.' },
      { time: 'Evening', text: 'Most supply restored; some areas take until the next day.' },
    ],
    mechanisms: [
      { title: 'A slow cascade', body: 'Unlike a frequency collapse, this unfolded over hours. Each lost line made the rest more loaded. Shedding load early would have stopped it.', lesson: 'cascade' },
      { title: 'Heat lowers line ratings', body: 'A line’s limit is set by how much it sags as it heats. On a hot, still day, the same current makes it hotter, and it reaches the trees or the ground sooner.', lesson: 'cascade' },
    ],
    causes: [
      { kind: 'trigger', text: 'Current transformer fire at Chagino.' },
      { kind: 'design', text: 'Ageing substation equipment.' },
      { kind: 'people', text: 'Load not shed in time as overloads spread.' },
      { kind: 'weather', text: 'Hot weather raising demand and reducing line ratings.' },
    ],
    numbers: [['People affected', 'About 2 million'], ['Load lost', 'Roughly 3,500 MW'], ['Passengers stuck in the metro', 'About 20,000']],
    aftermath: ['Large investment in the Moscow grid followed.', 'The event fed into the restructuring of Russia’s power sector.'],
    again: 'Slow cascades can still happen anywhere operators lack the tools or authority to shed load early.',
  },
  {
    id: 'central-asia-2022',
    verdict: 'A large power deficit in Uzbekistan pulled more power from the north than Kazakhstan’s transit lines could carry. When they disconnected, the Central Asian ring was left short and collapsed.',
    before: ['A cold January morning with high heating demand. The Central Asian ring was importing power from northern Kazakhstan and Russia through the 500 kV transit.'],
    sequence: [
      { time: '11:00', text: 'A large imbalance appears in the Uzbek system.' },
      { time: '11:00', text: 'Power surges south over the transit lines through Kazakhstan, which overload and are disconnected by automatic protection.' },
      { time: '11:01', text: 'The southern ring, cut off and short of supply, collapses. Uzbekistan, Kyrgyzstan and southern Kazakhstan lose power.' },
      { time: 'Evening', text: 'Restoration proceeds through the day; some areas are without power until the next day.' },
    ],
    mechanisms: [
      { title: 'A neighbour’s problem becomes yours', body: 'In an interconnected grid, a deficit anywhere is shared through the ties. If the ties cannot carry the extra flow, they open, and the area with the deficit is on its own.', lesson: 'powerflow' },
      { title: 'Separation without load shedding', body: 'An island cut off while importing loses that import instantly. Without enough automatic load shedding, its frequency keeps falling.', lesson: 'frequency' },
    ],
    causes: [
      { kind: 'trigger', text: 'Sudden power imbalance in the Uzbek system, as stated by Kazakh officials.' },
      { kind: 'planning', text: 'Weak north–south transit capacity and limited reserves in the ring.' },
      { kind: 'protection', text: 'Load shedding insufficient after separation.' },
    ],
    numbers: [['People affected', 'About 25 million'], ['Countries', 'Uzbekistan, Kyrgyzstan, southern Kazakhstan'], ['Duration', 'Up to a day']],
    aftermath: ['Governments in the region agreed to review coordination and reserves in the ring.'],
    again: 'Interconnection helps until the ties are overloaded. Coordinated reserves and shedding make it safe.',
  },
];

export const REGION_CASES = ALL.filter((e) => !PENDING.has(e.id));
