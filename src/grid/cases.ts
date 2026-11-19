// Case files: why each blackout happened, written from the investigation
// reports listed with each event in events.ts. Where reports differ or are
// still incomplete, the text says so.

export type CauseKind = 'trigger' | 'protection' | 'people' | 'planning' | 'design' | 'weather';

export interface CaseFile {
  id: string;
  /** The single-sentence answer to "why". */
  verdict: string;
  /** What the system looked like just before. */
  before: string[];
  /** Detailed timeline. */
  sequence: { time: string; text: string }[];
  /** Physical mechanisms, each tied to a lesson. */
  mechanisms: { title: string; body: string; lesson?: string }[];
  causes: { kind: CauseKind; text: string }[];
  numbers: [string, string][];
  aftermath: string[];
  /** Could it happen again, and what would stop it. */
  again: string;
}

export const CAUSE_LABEL: Record<CauseKind, string> = {
  trigger: 'Initiating event',
  protection: 'Protection and control',
  people: 'People and procedures',
  planning: 'Planning and operation',
  design: 'Equipment and design',
  weather: 'Weather and nature',
};

export const CASES: CaseFile[] = [
  {
    id: 'bangladesh-2022',
    verdict: 'A single 230 kV trip in the east split a grid that was moving a lot of power from east to west, and neither half had the reserve or the load shedding to survive on its own.',
    before: [
      'Bangladesh’s gas-fired generation is concentrated in the east, near the gas fields of Sylhet and Brahmanbaria: Ashuganj, Ghorashal, Haripur, Meghnaghat. The big demand centres are Dhaka and the west, and the coal plants of the south-west.',
      'In 2022 the country was also short of imported LNG, so generation was tight and load shedding was already common. Tight systems run with little spinning reserve.',
    ],
    sequence: [
      { time: '14:04', text: 'A 230 kV circuit trips in the Ashuganj–Ghorashal area of the eastern grid, according to early reports from the probe committee.' },
      { time: 'seconds later', text: 'Power that had been flowing west reroutes onto the remaining east–west paths, which swing and trip. The grid separates into islands.' },
      { time: 'seconds later', text: 'The eastern islands, rich in generation and now with too little load, see frequency rise; generators trip on over-speed and protection. The western islands, short of generation, see frequency fall.' },
      { time: 'within a minute', text: 'Under-frequency load shedding operates but cannot arrest the fall. Generators trip on under-frequency and most of the national grid collapses.' },
      { time: 'late afternoon', text: 'Restoration begins from hydro at Kaptai and plants still running in the north-west. Dhaka’s supply returns in stages through the evening.' },
    ],
    mechanisms: [
      { title: 'Islanding turns one problem into two', body: 'Before the split, a surplus in the east and a deficit in the west cancel out. After it, each island has to balance itself instantly. The bigger the transfer between them, the bigger the imbalance each side inherits.', lesson: 'powerflow' },
      { title: 'Frequency falls at a rate set by inertia', body: 'The deficit island’s frequency falls at a rate proportional to the lost power divided by its spinning mass. A small, gas-heavy island with few machines falls fast, giving relays only a second or two to act.', lesson: 'frequency' },
      { title: 'Load shedding has to match the worst case', body: 'Under-frequency relays shed fixed blocks of demand at set frequencies. If the blocks are too small, the relays are slow, or some do not work, the fall continues until generators protect themselves by tripping, and the collapse becomes total.', lesson: 'cascade' },
    ],
    causes: [
      { kind: 'trigger', text: 'Trip of a 230 kV circuit in the eastern grid.' },
      { kind: 'planning', text: 'High east-to-west transfer with generation concentrated near the gas fields.' },
      { kind: 'planning', text: 'Thin spinning reserve during a period of fuel shortage.' },
      { kind: 'protection', text: 'Under-frequency load shedding not fast or deep enough for a separation of this size.' },
      { kind: 'design', text: 'No wide-area scheme to keep the islands balanced after separation.' },
    ],
    numbers: [['People affected', 'About 140 million'], ['Area affected', 'Most of the country'], ['Restoration', 'Up to 7–8 hours in Dhaka'], ['Demand at the time', 'Around 11 GW (approximate)']],
    aftermath: ['The government formed probe committees and PGCB reviewed protection settings and load-shedding schemes. The event renewed attention on east–west transmission and on reserve planning as the large Rooppur and coal units come online.'],
    again: 'A grid that concentrates generation on one side of a narrow corridor is always exposed to splitting. Stronger east–west links, wide-area protection that sheds the right load in the right island, and enough reserve for the largest credible separation would change the outcome.',
  },
  {
    id: 'bangladesh-2014',
    verdict: 'The HVDC import from India was a large share of a small, stretched system, and when it tripped the rest of the grid had neither the reserve nor the working load shedding to replace it.',
    before: [
      'The Bheramara back-to-back HVDC station had begun importing power from India in late 2013, about 500 MW at most: a large single infeed for a system then serving around 6 GW.',
      'Demand was being met with little margin, and many plants were running near their limits.',
    ],
    sequence: [
      { time: '11:27', text: 'The Bheramara HVDC station trips and the import from India stops.' },
      { time: 'seconds later', text: 'Frequency falls. The plants that could have picked up the loss do not respond fast enough, and load shedding does not operate as designed.' },
      { time: 'seconds later', text: 'Generators trip on under-frequency, one after another, and the national grid collapses.' },
      { time: 'that night', text: 'Restoration takes around 12 hours for most of the country, longer in places.' },
    ],
    mechanisms: [
      { title: 'The largest infeed sets the reserve you need', body: 'Operators hold enough spinning reserve to cover the loss of the single largest generator or link. An interconnector counts too. If the reserve is smaller than the link, losing the link guarantees a frequency fall that only load shedding can stop.', lesson: 'frequency' },
      { title: 'HVDC brings power but no inertia', body: 'A converter station delivers megawatts but contributes no spinning mass to resist a frequency change, and it can block in milliseconds. Its loss is instant and total.', lesson: 'frequency' },
    ],
    causes: [
      { kind: 'trigger', text: 'Trip of the Bheramara HVDC link.' },
      { kind: 'planning', text: 'Spinning reserve smaller than the largest infeed.' },
      { kind: 'protection', text: 'Load-shedding relays that did not operate as designed.' },
      { kind: 'people', text: 'The inquiry cited weaknesses in protection coordination and maintenance.' },
    ],
    numbers: [['People affected', 'About 150 million'], ['Import lost', 'About 450–500 MW'], ['Restoration', 'Around 12 hours']],
    aftermath: ['The investigation recommended better protection coordination, functioning under-frequency schemes and more reserve. Import capacity from India has since grown well beyond the 2014 level, which makes the same lesson more important.'],
    again: 'Any single infeed larger than the available reserve is a blackout waiting for a trip. The fix is boring and effective: size reserve for the largest infeed and test the load-shedding relays.',
  },
  {
    id: 'gb-2019',
    verdict: 'A routine lightning fault caused two large generators to fail almost at once, and together with lost embedded generation the total exceeded what the system was secured for.',
    before: [
      'A wet, windy Friday afternoon with demand around 29 GW and wind supplying a large share. The system was secured against the loss of about 1,000 MW, the largest single infeed.',
      'Inertia was moderate. Much of the frequency response was coming from batteries and fast-acting plant.',
    ],
    sequence: [
      { time: '16:52:33', text: 'Lightning strikes the Eaton Socon–Wymondley 400 kV line. Protection clears the fault in about 70 ms, as designed.' },
      { time: '16:52:33', text: 'The Hornsea One offshore wind farm’s voltage control becomes unstable after the fault and it reduces output by 737 MW.' },
      { time: '16:52:34', text: 'The steam turbine at Little Barford trips (244 MW). Around 500 MW of embedded generation disconnects on loss-of-mains protection.' },
      { time: '16:52:58', text: 'Frequency bottoms at about 49.1 Hz and begins to recover as response arrives.' },
      { time: '16:53:31', text: 'Gas turbine 1a at Little Barford trips (210 MW). Frequency falls again to 48.8 Hz.' },
      { time: '16:53:49', text: 'Low-frequency demand disconnection removes 931 MW, about 5 % of demand. Frequency recovers.' },
      { time: '16:57', text: 'Frequency is back to 50 Hz. Distribution networks restore customers within about 45 minutes; some trains need technicians to restart.' },
    ],
    mechanisms: [
      { title: 'Ride-through: the grid assumes generators stay on', body: 'Generators are required to stay connected through short faults. When two large ones failed to, the loss was far bigger than the fault itself.', lesson: 'frequency' },
      { title: 'Loss of mains protection can make it worse', body: 'Small generators on distribution networks use rate-of-change-of-frequency and vector-shift relays to detect islanding. On 9 August these relays read the national disturbance as an island and disconnected hundreds of megawatts at the worst moment.', lesson: 'frequency' },
      { title: 'Load shedding worked', body: 'The demand disconnection did exactly its job: frequency never reached the level where generators trip and the system could collapse.', lesson: 'cascade' },
    ],
    causes: [
      { kind: 'weather', text: 'Lightning strike on a 400 kV line.' },
      { kind: 'design', text: 'Hornsea One’s voltage control instability after the fault.' },
      { kind: 'design', text: 'Little Barford steam turbine trip on a speed signal discrepancy, then the gas turbines.' },
      { kind: 'protection', text: 'Loss-of-mains settings on embedded generation too sensitive.' },
      { kind: 'planning', text: 'Combined loss beyond the 1,000 MW secured contingency.' },
    ],
    numbers: [['Customers disconnected', 'About 1.1 million'], ['Demand disconnected', '931 MW'], ['Generation lost', 'About 1,900 MW'], ['Lowest frequency', '48.8 Hz']],
    aftermath: ['GB launched a programme to change loss-of-mains settings on tens of thousands of distributed generators, reviewed fault ride-through compliance, and the companies involved paid into a redress fund. Rail rolling stock software was changed so trains could restart without technicians.'],
    again: 'Large, simultaneous non-compliant trips are rarer now, but as more generation connects through inverters, ride-through performance is the thing to watch.',
  },
  {
    id: 'northeast-2003',
    verdict: 'Ohio lines sagged into untrimmed trees while a failed alarm system kept operators unaware, and once the cascade began, distance relays tripping on overload spread it across eight states and Ontario.',
    before: [
      'A hot August afternoon with high demand and large power transfers across the Midwest. Reactive power reserves in northern Ohio were low.',
      'At FirstEnergy’s control centre the alarm system had silently failed after a software race condition, so operators did not see the trips that followed.',
    ],
    sequence: [
      { time: '13:31', text: 'The Eastlake 5 generator trips, reducing voltage support in northern Ohio.' },
      { time: '14:14', text: 'FirstEnergy’s alarm and logging software fails; operators lose their alarms without realising it.' },
      { time: '15:05–15:41', text: 'Three 345 kV lines sag into trees and trip, one after another, as their loading increases. Operators remain unaware.' },
      { time: '15:39–16:05', text: '138 kV lines in the Akron area overload and trip in quick succession.' },
      { time: '16:05:57', text: 'The Sammis–Star 345 kV line trips on a zone 3 relay reading heavy load as a fault. From here the cascade cannot be stopped.' },
      { time: '16:06–16:10', text: 'Power swings through Michigan, Ontario, New York and New Jersey. Lines and generators trip by the hundred.' },
      { time: '16:10:39', text: 'The New York City area separates with a generation deficit and collapses.' },
      { time: '16:13', text: 'The cascade is over: 61,800 MW of load lost.' },
    ],
    mechanisms: [
      { title: 'Thermal sag: a line’s rating is about clearance', body: 'Current heats a conductor and it stretches and sags. If the trees under it are too tall, it flashes over long before reaching its nominal rating.', lesson: 'cascade' },
      { title: 'Flow redistributes instantly', body: 'Each trip pushed its power onto parallel paths, overloading the next line. The redistribution follows reactances, not operator wishes.', lesson: 'powerflow' },
      { title: 'Zone 3 relays and load encroachment', body: 'Backup distance relays saw the high current and depressed voltage of heavy load as a distant fault and tripped healthy lines, turning a regional problem into a continental one.', lesson: 'cascade' },
    ],
    causes: [
      { kind: 'planning', text: 'Inadequate vegetation management under 345 kV lines.' },
      { kind: 'people', text: 'Loss of situational awareness after the alarm failure.' },
      { kind: 'design', text: 'Alarm software race condition.' },
      { kind: 'protection', text: 'Zone 3 relays tripping on load during the cascade.' },
      { kind: 'planning', text: 'Weak reliability coordination across utility boundaries.' },
    ],
    numbers: [['People affected', 'About 50 million'], ['Load lost', '61,800 MW'], ['New York City restored', 'About 29 hours'], ['Time from first line trip to collapse', 'About 65 minutes']],
    aftermath: ['The Energy Policy Act of 2005 made reliability standards mandatory and enforceable through NERC. Vegetation management, real-time tools and zone 3 relay settings were all tightened.'],
    again: 'Mandatory standards and better tools make a repeat of this exact chain unlikely, but the pattern of overloads plus poor awareness remains the classic cascade.',
  },
  {
    id: 'newyork-1977',
    verdict: 'Lightning knocked out the lines that carried power into the city, and Con Edison could neither shed load nor start reserves fast enough before the remaining ties tripped.',
    before: ['A hot July evening. New York City depended heavily on imports from upstate over a handful of 345 kV corridors.'],
    sequence: [
      { time: '20:37', text: 'Lightning strikes near Buchanan South on the Hudson, tripping two 345 kV lines and taking Indian Point 3 off line.' },
      { time: '20:55', text: 'A second strike trips two more 345 kV lines. The remaining ties into the city are heavily overloaded.' },
      { time: '21:19', text: 'A major tie trips on overload. Con Edison tries to shed load and start gas turbines; several fail to start.' },
      { time: '21:36', text: 'The last ties open. Con Edison is islanded with far too little generation and collapses.' },
    ],
    mechanisms: [
      { title: 'Import corridors are single points of failure', body: 'When a city depends on a few corridors, losing two of them can push the rest beyond their limits. Each trip makes the next more likely.', lesson: 'cascade' },
      { title: 'Manual load shedding is too slow', body: 'An operator phoning instructions cannot act in the seconds a frequency collapse takes. The event pushed utilities toward automatic schemes.', lesson: 'frequency' },
    ],
    causes: [
      { kind: 'weather', text: 'Multiple lightning strikes on 345 kV lines.' },
      { kind: 'planning', text: 'Dependence on imports through few corridors.' },
      { kind: 'people', text: 'Slow load shedding.' },
      { kind: 'design', text: 'Reserve gas turbines that failed to start.' },
    ],
    numbers: [['People affected', 'About 9 million'], ['Duration', 'About 25 hours'], ['Time from first strike to collapse', 'About 1 hour']],
    aftermath: ['New York introduced stricter limits on how much of the city’s demand can be imported and requirements for local generation, plus automatic load shedding.'],
    again: 'New York still keeps a large share of in-city generation for exactly this reason.',
  },
  {
    id: 'texas-2021',
    verdict: 'Extreme cold took out generation faster than operators could shed load, and the grid came within minutes of a collapse that could have taken weeks to recover from.',
    before: ['An Arctic outbreak drove ERCOT demand to a winter record. Much of the generation fleet and gas supply chain had not been winterised. ERCOT has very limited links to other grids.'],
    sequence: [
      { time: '14 Feb, evening', text: 'Demand climbs; generator outages rise as wells, pipelines and instruments freeze.' },
      { time: '15 Feb, 00:15', text: 'ERCOT declares an energy emergency.' },
      { time: '01:20–01:50', text: 'Generation trips rapidly. Frequency falls; ERCOT orders rolling outages in stages, eventually 20,000 MW at the peak.' },
      { time: '01:51', text: 'Frequency reaches 59.302 Hz and stays below 59.4 Hz for 4 minutes and 37 seconds.' },
      { time: '15–18 Feb', text: 'Rolling outages continue for days, many customers without power for long periods in freezing conditions.' },
    ],
    mechanisms: [
      { title: 'Generator endurance limits', body: 'Generators are designed to ride through under-frequency for limited times. Below 59.4 Hz, ERCOT generators are only required to stay on for nine minutes. Had frequency stayed low longer, mass tripping could have caused a total blackout and a black start lasting weeks.', lesson: 'frequency' },
      { title: 'Load shedding saved the system', body: 'The rolling outages were the system working as a last resort. Without them, ERCOT would have collapsed.', lesson: 'cascade' },
    ],
    causes: [
      { kind: 'weather', text: 'Extreme cold beyond planning assumptions.' },
      { kind: 'design', text: 'Generation and gas infrastructure not winterised.' },
      { kind: 'planning', text: 'Demand far above the extreme-weather forecast; little import capability.' },
    ],
    numbers: [['Homes without power', 'About 4.5 million'], ['Load shed at peak', '20,000 MW'], ['Time below 59.4 Hz', '4 min 37 s'], ['Deaths (Texas DSHS)', '246']],
    aftermath: ['Texas passed winterisation requirements for generators and gas facilities, and NERC introduced mandatory cold-weather standards (EOP-012).'],
    again: 'Weatherisation rules reduce the risk, but an islanded grid relying on fuel supply chains exposed to weather stays vulnerable.',
  },
  {
    id: 'iberia-2025',
    verdict: 'Voltage rose until generation started tripping on overvoltage, each trip removed voltage control and pushed voltage higher, and within seconds the peninsula lost synchronism with France and collapsed.',
    before: [
      'A sunny midday with high solar output and moderate demand. Oscillations had been observed at 12:03 and 12:19, and operators had taken actions to damp them.',
      'With much inverter-based generation operating at fixed power factor, the amount of dynamic voltage control on the system was limited.',
    ],
    sequence: [
      { time: '12:32:57', text: 'Generation in southern Spain begins disconnecting, starting with a plant in Granada, amid rising voltages.' },
      { time: '12:33:16–12:33:17', text: 'Further disconnections in Badajoz and Seville: around 2.2 GW lost in total within about 20 seconds.' },
      { time: '12:33:18–12:33:20', text: 'Voltage rises sharply; more generation trips on overvoltage protection across the peninsula.' },
      { time: '12:33:21', text: 'The Iberian system loses synchronism with France; interconnectors trip. Frequency and voltage collapse.' },
      { time: 'Evening to next morning', text: 'Restoration from hydro and the interconnectors with France and Morocco; most supply back within 10–16 hours.' },
    ],
    mechanisms: [
      { title: 'Overvoltage is a cascade too', body: 'Lightly loaded lines generate reactive power. If too few machines are absorbing it, voltage rises. Generators trip to protect themselves, which removes more absorption, which raises voltage further.', lesson: 'powerflow' },
      { title: 'Voltage and frequency are linked in a collapse', body: 'Once enough generation had tripped, the loss of synchronism and frequency collapse followed in seconds.', lesson: 'frequency' },
    ],
    causes: [
      { kind: 'design', text: 'Cascade of overvoltage disconnections of generation.' },
      { kind: 'planning', text: 'Insufficient dynamic voltage control scheduled on the system.' },
      { kind: 'trigger', text: 'Root-cause analysis was published in stages; this summary follows the factual report.' },
    ],
    numbers: [['People affected', 'About 55–60 million'], ['Generation lost before collapse', 'About 2.2 GW'], ['Time from first trip to collapse', 'About 24 seconds']],
    aftermath: ['Spain and Portugal reviewed voltage control services and requirements for inverter-based generation to provide dynamic voltage support.'],
    again: 'As grids shift to inverters, voltage control must be bought and scheduled as a service, like reserve and inertia.',
  },
  {
    id: 'india-2012',
    verdict: 'Northern India was drawing far more power from its neighbours than scheduled, over too few lines, until a key line tripped on load and the region separated and collapsed.',
    before: ['A weak monsoon pushed up demand for irrigation pumping and cooling. Northern states were over-drawing against schedule, and several inter-regional lines were out of service.'],
    sequence: [
      { time: '30 July, 02:33', text: 'The Bina–Gwalior 400 kV line trips on zone 3. The Northern Region separates from the Western Region and collapses: about 300 million people affected.' },
      { time: '31 July, 12:58', text: 'With restoration barely complete and the same over-drawal pattern, Bina–Gwalior trips again.' },
      { time: '13:00', text: 'The Northern, Eastern and North-Eastern regions collapse together: about 620 million people affected.' },
    ],
    mechanisms: [
      { title: 'Load encroachment', body: 'Heavy flow on a few remaining lines made distance relays see load as a fault.', lesson: 'cascade' },
      { title: 'Separating while importing', body: 'An importing region that separates loses the import instantly and its frequency falls; if the loss exceeds load-shedding capability, it collapses.', lesson: 'frequency' },
    ],
    causes: [
      { kind: 'people', text: 'Over-drawal against schedule by northern states.' },
      { kind: 'planning', text: 'Several inter-regional lines unavailable.' },
      { kind: 'protection', text: 'Zone 3 load encroachment on Bina–Gwalior.' },
    ],
    numbers: [['People affected (31 July)', 'About 620 million'], ['Load lost (31 July)', 'About 48 GW'], ['Restoration', 'Most within about 15 hours']],
    aftermath: ['India expanded wide-area monitoring with PMUs, enforced schedules more strictly, and reviewed zone 3 settings.'],
    again: 'A national synchronous grid now links all regions, but discipline on schedules and protection settings remains the key.',
  },
  {
    id: 'italy-2003',
    verdict: 'Italy was importing 6.4 GW overnight; a tree in Switzerland started a chain of line trips that cut it off, and the frequency fell too fast for load shedding to save it.',
    before: ['Sunday night, low demand, with Italy importing heavily because imported power was cheaper than running domestic plant.'],
    sequence: [
      { time: '03:01:42', text: 'The Lukmanier 380 kV line (Mettlen–Lavorgo) flashes over to a tree and trips.' },
      { time: '03:01–03:25', text: 'Swiss and Italian operators attempt to relieve the overloaded San Bernardino line; the import reduction is too small and too late.' },
      { time: '03:25:21', text: 'The San Bernardino line trips. Within seconds the remaining links to Italy trip; Italy separates while importing about 6.4 GW.' },
      { time: '03:25–03:28', text: 'Frequency falls; load shedding operates, but generators trip early. Frequency reaches 47.5 Hz about two and a half minutes after separation and the system collapses.' },
    ],
    mechanisms: [
      { title: 'An importing island inherits the import as a deficit', body: 'On separation, every megawatt that was flowing in becomes missing generation.', lesson: 'frequency' },
      { title: 'Early generator tripping', body: 'Plants tripping before the frequency reached their design limits deepened the deficit.', lesson: 'cascade' },
    ],
    causes: [
      { kind: 'trigger', text: 'Tree flashover on the Lukmanier line.' },
      { kind: 'people', text: 'Slow and insufficient cross-border coordination.' },
      { kind: 'design', text: 'Generators tripping earlier than required.' },
    ],
    numbers: [['People affected', 'About 56 million'], ['Import at the time', 'About 6.4 GW'], ['Restoration', 'Up to 18 hours']],
    aftermath: ['European operators strengthened cross-border coordination, later creating regional security coordinators.'],
    again: 'Better coordination and tools reduce the risk, but large imports always create a large potential deficit.',
  },
  {
    id: 'sa-2016',
    verdict: 'Storm damage caused repeated faults, wind farms reduced output because of ride-through settings, and the interconnector to Victoria tripped, leaving South Australia with far too little generation.',
    before: ['A severe storm with tornadoes; South Australia was importing over the Heywood interconnector and wind was supplying a large share.'],
    sequence: [
      { time: '16:16:46', text: 'Tornadoes bring down towers on 275 kV lines in the mid-north.' },
      { time: '16:16–16:18', text: 'Six voltage dips occur in about two minutes.' },
      { time: '16:18:08', text: 'Nine wind farms reduce output by 456 MW: protection limited the number of ride-throughs.' },
      { time: '16:18:15', text: 'Flow on the Heywood interconnector surges; its loss-of-synchronism protection trips it. South Australia is islanded.' },
      { time: '16:18:16', text: 'Frequency collapses in under a second. The state is black.' },
    ],
    mechanisms: [
      { title: 'Ride-through settings matter', body: 'Wind farms with a limit on consecutive ride-throughs disconnected after repeated faults.', lesson: 'frequency' },
      { title: 'An islanded state with low inertia', body: 'With little synchronous generation, the frequency fell almost instantly once the interconnector tripped.', lesson: 'frequency' },
    ],
    causes: [
      { kind: 'weather', text: 'Tornadoes destroying transmission towers.' },
      { kind: 'design', text: 'Wind farm ride-through settings not known to the operator.' },
      { kind: 'protection', text: 'Interconnector protection islanding the state as designed.' },
    ],
    numbers: [['Customers affected', 'About 850,000'], ['Wind reduction', '456 MW'], ['Most restored', 'Within about 8 hours']],
    aftermath: ['Australia tightened generator performance standards, and introduced requirements for system strength and inertia.'],
    again: 'System strength and inertia are now planned requirements, reducing the chance of a repeat.',
  },
  {
    id: 'hokkaido-2018',
    verdict: 'An earthquake removed half of Hokkaido’s largest plant and cut off hydro; operators nearly held on, but when the plant’s last unit failed eighteen minutes later there was nothing left to replace it.',
    before: ['Early morning, low demand. Tomato-Atsuma, the island’s largest coal plant, was supplying around half of Hokkaido’s demand. The link to Honshu was a 600 MW HVDC connection.'],
    sequence: [
      { time: '03:07:59', text: 'Magnitude 6.7 earthquake. Tomato-Atsuma units 2 and 4 trip; lines trip, cutting off hydro.' },
      { time: '03:08', text: 'Load shedding operates and the HVDC link ramps up imports; frequency recovers.' },
      { time: '03:25', text: 'Tomato-Atsuma unit 1 trips with boiler damage. Frequency collapses and Hokkaido goes black.' },
    ],
    mechanisms: [
      { title: 'Concentration risk', body: 'When one site supplies half of a small island, losing it is unrecoverable without large imports.', lesson: 'frequency' },
    ],
    causes: [
      { kind: 'weather', text: 'Earthquake close to the main plant.' },
      { kind: 'planning', text: 'Generation concentrated at one site.' },
      { kind: 'planning', text: 'Limited link capacity to Honshu.' },
    ],
    numbers: [['Households affected', 'About 2.95 million'], ['Time to collapse after the quake', '18 minutes'], ['Restoration', 'About 45 hours for most']],
    aftermath: ['A second Hokkaido–Honshu HVDC link was built and limits were placed on the share of demand one plant can supply.'],
    again: 'More link capacity and less concentration reduce the risk, but small islands remain fragile.',
  },
  {
    id: 'pakistan-2023',
    verdict: 'With few machines online on a cold, low-demand morning, voltage swings in the south cascaded into line and generator trips across the national grid.',
    before: ['Winter demand was low and many plants had been shut overnight to save fuel, leaving little inertia and voltage control.'],
    sequence: [
      { time: '07:34', text: 'Frequency and voltage variation in the southern grid.' },
      { time: '07:34', text: 'Lines and generators trip in cascade; the national grid collapses within seconds.' },
      { time: 'Over the next day', text: 'Restoration takes up to 20 hours.' },
    ],
    mechanisms: [
      { title: 'Light load raises voltage', body: 'Lightly loaded long lines generate reactive power; with few machines online to absorb it, voltages rise and protection trips.', lesson: 'powerflow' },
    ],
    causes: [
      { kind: 'planning', text: 'Few units online at low demand to save fuel.' },
      { kind: 'trigger', text: 'Voltage and frequency variation in the south.' },
    ],
    numbers: [['People affected', 'About 220 million'], ['Restoration', 'Up to 20 hours']],
    aftermath: ['The government ordered inquiries into the cascade and operating practices at low demand.'],
    again: 'Keeping enough synchronous machines online for stability, not just energy, is the guard against a repeat.',
  },
];

export const caseById = (id: string) => CASES.find((c) => c.id === id);
