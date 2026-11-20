// Tour content per plant, aligned with each site's stops: key statistics, a
// deeper insight for the film narration and the interactive cards, what the
// scene should do at that stop, and how the camera moves.

export type Shot = 'orbit' | 'dolly' | 'crane' | 'track';
export type TourAct = {
  hour?: number;
  cut?: boolean;
  era?: string;
  build?: [number, number];
  flood?: [number, number];
  stress?: 'trip' | 'loop';
};
export type TourStop = { stats: [string, string][]; deep: string; act?: TourAct; shot?: Shot; dur?: number };
export type Tour = { year: string; logline: string; stops: TourStop[] };

export const TOURS: Record<string, Tour> = {
  tmi: {
    year: '1974–2019',
    logline: 'Two reactors on a river island, and the accident that changed how control rooms are designed.',
    stops: [
      { shot: 'crane', act: { hour: 7.2, era: '1979' }, stats: [['Units', '2 × B&W PWR'], ['Unit 2 output', '906 MWe'], ['From Harrisburg', '16 km'], ['Unit 2 in service', '3 months']], deep: 'Unit 2 had been in commercial operation for only three months when it failed. Its core had less decay heat stored than an older plant would, which bought the operators time they did not use.' },
      { shot: 'dolly', act: { era: '1979' }, stats: [['Height', '113 m'], ['Heat rejected', '~1,850 MW per unit'], ['Shell at the throat', '~0.2 m'], ['Moving parts', 'none']], deep: 'A two-thirds-efficient steam cycle throws away about two megawatts of heat for every megawatt it sends to the grid. The towers are where that heat leaves: as warm, saturated air and a visible plume of condensed droplets, not smoke.' },
      { shot: 'orbit', act: { cut: true, era: '1979' }, stats: [['Thermal power', '2,772 MWt'], ['Fuel assemblies', '177'], ['Containment wall', '~1.2 m concrete'], ['Core melted', 'about half']], deep: 'The containment did its job. Although roughly half the fuel melted and slumped to the bottom of the vessel, almost all the radioactivity stayed inside this building. The vessel itself was not breached, which was only confirmed when it was opened in the 1980s.' },
      { shot: 'dolly', act: { cut: true, era: '1979', hour: 4.1 }, stats: [['Normal pressure', '2,155 psig'], ['PORV opened at', '2,255 psig'], ['Valve stuck open', '142 min'], ['Alarms in first minutes', '100+']], deep: 'The indicator light showed the command sent to the valve, not the valve\'s position. That single design choice turned a routine transient into a meltdown. After TMI, US plants added direct position indication, symptom-based procedures and plant-specific simulators.' },
      { shot: 'track', act: { cut: false, era: '1979' }, stats: [['Initiating event', 'feedwater pump trip'], ['Turbine trip', '04:00:37'], ['Reactor scram', '+8 s'], ['Unit 2 status today', 'defuelled']], deep: 'The sequence began with a clog in the condensate polishers, the filters that clean feedwater. Workers clearing it let water into an air line, which tripped the main feedwater pumps. Nothing on the nuclear side was wrong at that moment.' },
      { shot: 'orbit', act: { era: 'today', hour: 19.6 }, stats: [['Voltage', '500 kV'], ['Grid', 'PJM, 60 Hz'], ['Unit 1 shut', '2019'], ['Unit 1 restart', 'planned (Crane CEC)']], deep: 'Unit 1 ran for another 34 years after its neighbour failed, with one of the best capacity factors in the US fleet. It closed for economic reasons in 2019, and is now being prepared to restart under a long-term power agreement with a data-centre operator.' },
    ],
  },
  rooppur: {
    year: '2017–2026',
    logline: 'Bangladesh’s first nuclear plant, and the grid it had to be ready for.',
    stops: [
      { shot: 'crane', act: { build: [0, 1], hour: 9.5 }, dur: 16, stats: [['Units', '2 × VVER-1200'], ['Output', '2 × 1,200 MWe'], ['Cost', 'about US$12.65 bn'], ['Design life', '60 years']], deep: 'First concrete for unit 1 was poured in November 2017. The design is the Russian AES-2006, a Generation III+ pressurised-water reactor already running at Novovoronezh and Leningrad, built here by Rosatom with Bangladeshi engineers trained in Russia and India.' },
      { shot: 'orbit', act: { cut: true }, stats: [['Thermal power', '3,200 MWt'], ['Fuel assemblies', '163'], ['Coolant pressure', '16.2 MPa'], ['Core outlet', '~329 °C']], deep: 'Two containments, one inside the other. The inner shell holds the pressure of a pipe break; the outer one protects the reactor from the outside world. Between them, passive heat-removal systems can cool the inner shell for at least 72 hours without any power or operator action.' },
      { shot: 'dolly', act: { cut: true }, stats: [['Purpose', 'hold a molten core'], ['Needs power?', 'no'], ['First fitted', 'Tianwan, China, 2007'], ['At Fukushima', 'none']], deep: 'If everything else failed and the core melted through the vessel, the corium would fall into this crucible of sacrificial oxides, mix, spread and be cooled by water from above. It is the last barrier, and it works with no pumps and no instructions.' },
      { shot: 'orbit', act: { cut: true }, stats: [['Cooling loops', '4'], ['Tubes per SG', '~11,000'], ['Steam pressure', '~7 MPa'], ['Water inventory', 'large: hours of margin']], deep: 'Lying the steam generators on their side keeps a big pool of water above the tubes. If feedwater is lost, that inventory boils off slowly, giving operators far longer than a vertical design would.' },
      { shot: 'dolly', act: { cut: false, hour: 18.6 }, stats: [['Towers', '4'], ['Height', '~170 m'], ['Make-up water', 'from the Padma'], ['Padma swing', 'metres between seasons']], deep: 'A once-through cooling system would need the river to deliver a steady flow all year. The Padma floods in the monsoon and shrinks in the dry season, so the plant recirculates its cooling water through towers and only takes enough from the river to replace evaporation.' },
      { shot: 'track', act: { hour: 20.5 }, stats: [['Voltage', '400 kV'], ['Largest unit on the grid', '1,200 MW'], ['Grid peak demand', '~16 GW'], ['Share at full output', 'about one tenth']], deep: 'Adding a 1,200 MW unit to a 15 GW grid means that one trip can take out almost 8 % of supply at once. The rest of the system must carry enough spinning reserve and fast response to ride through it. Try the stress test to see what happens if both units go together.' },
      { shot: 'orbit', act: { hour: 21.5 }, stats: [['Opened', '1915'], ['Spans', '15'], ['Length', '~1.8 km'], ['Road bridge beside it', 'Lalon Shah, 2004']], deep: 'The Hardinge Bridge was one of the great engineering works of its day, its piers sunk deep into the shifting sand of the Padma. A century later, the river’s behaviour still sets the rules for anything built beside it, including a nuclear plant.' },
    ],
  },
  fukushima: {
    year: '1971–2011',
    logline: 'Six reactors, a 14-metre wave, and what happens when every source of power is lost at once.',
    stops: [
      { shot: 'crane', act: { era: 'built', hour: 14.5 }, stats: [['Units', '6 BWRs'], ['Total output', '4,696 MWe'], ['In service', '1971–1979'], ['Site grade', '10 m (units 1–4)']], deep: 'Daiichi was TEPCO’s first nuclear station, built when the company’s engineers had to learn the technology from General Electric as they went. The original bluff was 35 m high; it was cut down to make it cheaper to pump seawater for cooling.' },
      { shot: 'dolly', act: { era: 'built' }, stats: [['Unit 1 output', '460 MWe'], ['Containment', 'GE Mark I'], ['Building height', '~45 m'], ['Fuel pool', 'top floor']], deep: 'The sky mural made the buildings disappear against the coast. The weakness was hidden inside: a compact Mark I containment with little room for hydrogen, and spent fuel pools on the top floor, outside the containment, that needed cooling too.' },
      { shot: 'orbit', act: { era: 'built', cut: true }, stats: [['Unit 2 output', '784 MWe'], ['RCIC kept cooling', '~70 hours'], ['Torus', 'condenses steam'], ['Release from unit 2', 'largest of the three']], deep: 'Unit 2 kept cooling itself for almost three days on a steam-driven pump that needed no AC power. When that pump finally stopped, the containment could not be vented in time, and on the morning of 15 March unit 2 made the largest release of the accident.' },
      { shot: 'track', act: { era: 'built', flood: [0, 14.5] }, dur: 16, stats: [['Design tsunami', '5.7 m'], ['Actual wave', '14–15 m'], ['Diesels lost', '12 of 13'], ['Time from wave to blackout', '~5 min']], deep: 'Most emergency diesels and all the DC switchgear for units 1, 2 and 4 were in the turbine building basements, below the water. Estimates of a much larger tsunami existed before 2011; acting on them would have meant moving equipment higher or building a taller wall.' },
      { shot: 'crane', act: { era: 'built' }, stats: [['Height', '120 m'], ['Shared between', 'units 3 and 4'], ['Unit 4 explosion', '15 Mar, ~06:00'], ['Unit 4 core', 'unloaded']], deep: 'Unit 4’s reactor was empty for maintenance, yet its building exploded. Hydrogen from unit 3 flowed back through the shared vent ducts while unit 3 was being vented. Separate vent lines are now a requirement.' },
      { shot: 'dolly', act: { era: 'built' }, stats: [['Site grade', '13 m'], ['Surviving diesel', '1 (air-cooled, unit 6)'], ['Cold shutdown', '20 Mar 2011'], ['Core damage', 'none']], deep: 'Three metres of height and one air-cooled diesel made the difference. Power was shared from unit 6 to unit 5, and both reached cold shutdown without core damage. The lesson was not new technology; it was diversity and elevation.' },
      { shot: 'orbit', act: { era: 'today', hour: 16 }, stats: [['Treated-water tanks', '1,000+'], ['Sea release began', 'August 2023'], ['Decommissioning', '30–40 years'], ['Evacuated in 2011', '~154,000 people']], deep: 'Groundwater flowing through the damaged buildings becomes contaminated and must be pumped, treated and stored. After years of storage, the treated water is being diluted and released to the sea under IAEA review. Removing the melted fuel from units 1 to 3 has barely begun.' },
    ],
  },
  chernobyl: {
    year: '1977–2016',
    logline: 'Four RBMK reactors, one night in April 1986, and the largest movable structure on land.',
    stops: [
      { shot: 'crane', act: { era: 'today', hour: 8.5 }, stats: [['Units', '4 × RBMK-1000'], ['Cooling pond', '22 km²'], ['Exclusion zone', '~2,600 km²'], ['Last unit shut', '2000']], deep: 'Chernobyl was meant to become the largest nuclear station in the world, with six units and more planned. The RBMK was chosen because it could be built from standard parts without a heavy pressure vessel, and because it could produce plutonium as well as power.' },
      { shot: 'orbit', act: { era: 'today', build: [0.86, 1] }, dur: 14, stats: [['Span', '257 m'], ['Height', '108 m'], ['Mass', '36,000 t'], ['Design life', '100 years']], deep: 'The arch was assembled 327 m to the west, where workers would receive lower doses, then pushed on rails over unit 4 in November 2016. It is sealed and kept at controlled humidity so that the steel and the ruin beneath do not corrode.' },
      { shot: 'dolly', act: { era: 'today', cut: true }, stats: [['Shelter built in', '206 days'], ['Upper shield', '~2,000 t'], ['Fuel still inside', '~200 t (est.)'], ['Liquidators, 1986–90', '~600,000']], deep: 'The 1986 Shelter was built in haste around a ruin no one could approach, with steel and concrete placed by crane and remote equipment. By the 2000s its supports were failing. The new arch exists so the Shelter can be taken apart without releasing what is inside.' },
      { shot: 'orbit', act: { era: '1985', cut: true }, stats: [['Fuel channels', '1,661'], ['Graphite', '~1,700 t'], ['Thermal power', '3,200 MWt'], ['Void coefficient', 'positive']], deep: 'In an RBMK, water both cools the fuel and absorbs neutrons, while graphite slows them down. When water boils, fewer neutrons are absorbed and power rises. At low power, with most rods withdrawn, that feedback dominated, and nothing in the design stopped it.' },
      { shot: 'track', act: { era: '1985', cut: false, hour: 1.3 }, stats: [['Turbines', '8 (2 per unit)'], ['Test asked', '~40 s of coast-down'], ['Test start', '01:23:04'], ['Explosion', '01:23:44–47']], deep: 'The test should have been done at 700 MW thermal. A delay of ten hours, a shift change and a near-shutdown at 00:28 left the reactor at 200 MW, poisoned with xenon and with almost all rods out. The test went ahead anyway.' },
      { shot: 'dolly', act: { era: 'today', hour: 10 }, stats: [['Construction stopped', '1989'], ['Tower complete', '1 of 2'], ['Second tower', '62 % of height'], ['Units planned', '6']], deep: 'Work on units 5 and 6 continued for three years after the accident before it was abandoned. The cranes are still standing where they stopped.' },
      { shot: 'orbit', act: { era: 'today', hour: 18.4 }, stats: [['Population 1986', '49,000'], ['Distance', '3 km'], ['Evacuated', '27 Apr, 14:00'], ['Time to evacuate', '~3 hours']], deep: 'Pripyat was a young, prosperous town; the average age was under 30. It was evacuated 36 hours after the explosion. Residents were told to bring documents and food for three days.' },
    ],
  },
  drax: {
    year: '1974–today',
    logline: 'Britain’s biggest power station, from coal to wood.',
    stops: [
      { shot: 'crane', act: { era: 'today', hour: 9 }, stats: [['Peak capacity', '3,960 MW'], ['Units', '6 × 660 MW'], ['Built', '1967–1986'], ['Last coal', '2021']], deep: 'At its peak Drax was the largest and cleanest coal plant in western Europe, and also Britain’s largest single emitter of CO₂. Its conversion to biomass is one of the most debated choices in British energy policy.' },
      { shot: 'crane', act: { era: 'coal' }, stats: [['Height', '259 m'], ['Flues', '3'], ['Tallest industrial chimney', 'in the UK'], ['Purpose', 'disperse above the inversion']], deep: 'A tall chimney does not clean flue gas; it releases it high enough that it dilutes before reaching the ground. Sulphur was only removed after flue-gas desulphurisation was added from 1988.' },
      { shot: 'dolly', act: { era: 'coal' }, stats: [['Towers', '12'], ['Height', '114 m'], ['Heat rejected', '~4 GW at full load'], ['In service today', 'about two thirds']], deep: 'Twelve towers reject about as much heat as the plant sends to the grid. Switch the period to today and fewer towers steam, because only four units still run, on biomass.' },
      { shot: 'track', act: { era: 'today' }, stats: [['Boilers', '6'], ['Unit rating', '660 MW'], ['Units on biomass', '4 of 6'], ['Biomass burned', '~7 Mt a year']], deep: 'Wood pellets go through the same mills and burners as coal did, after modification. The generators and grid connection were not touched, which is why the conversion was possible at all.' },
      { shot: 'orbit', act: { era: 'today', hour: 17.8 }, stats: [['Domes', '4'], ['Height', '50 m'], ['Atmosphere inside', 'nitrogen-blanketed'], ['Why', 'wood dust can self-heat']], deep: 'Pellet dust is explosive and stored wood can heat itself. The domes are monitored for temperature and blanketed with inert gas, and the conveyors are designed to keep dust out of the air.' },
      { shot: 'track', act: { era: 'today', hour: 20.5 }, stats: [['Trains per day', 'up to 17'], ['Ports', 'Hull, Immingham, Tyne'], ['Pellets from', 'mostly North America'], ['Unloading', 'without stopping']], deep: 'Trains run round the loop at walking pace and drop their load through bottom doors into hoppers below the track. Most pellets cross the Atlantic, which is part of why the carbon accounting is contested.' },
    ],
  },
  'three-gorges': {
    year: '1994–2012',
    logline: 'The largest power station on Earth, and the river it tamed.',
    stops: [
      { shot: 'crane', act: { era: 'normal', hour: 9 }, dur: 14, stats: [['Capacity', '22,500 MW'], ['Record output', '~112 TWh (2020)'], ['Reservoir length', '~600 km'], ['People relocated', '~1.3 million']], deep: 'Three Gorges generates more electricity in a year than some countries use. It was also built to control floods on the Yangtze that had killed hundreds of thousands of people in the twentieth century, and to make the upper river navigable for large ships.' },
      { shot: 'track', act: { era: 'normal' }, stats: [['Crest', '185 m a.s.l.'], ['Length', '2,335 m'], ['Height', '181 m'], ['Concrete', '~28 million m³']], deep: 'It is a gravity dam: it holds the reservoir back by its own weight. The concrete was placed in blocks and cooled with embedded pipes, because concrete heats as it cures and a mass this large would otherwise crack.' },
      { shot: 'dolly', act: { era: 'flood' }, stats: [['Spillway capacity', '~102,500 m³/s'], ['Flood storage', '~22 km³'], ['Outlets', '23 deep, 22 surface'], ['Plunge pool', 'away from the toe']], deep: 'In flood season the reservoir is drawn down to make room. When a flood arrives, the dam holds back the peak and releases it through these outlets at a rate the river below can carry.' },
      { shot: 'orbit', act: { era: 'normal', hour: 18.8 }, stats: [['Main units', '32 × 700 MW'], ['Penstock diameter', '12.4 m'], ['Head', '~80–113 m'], ['Turbine type', 'Francis']], deep: 'Each turbine runner is about 10 m across and weighs hundreds of tonnes. The head changes by tens of metres between seasons, so the units were designed to run efficiently over a wide range.' },
      { shot: 'crane', act: { era: 'normal' }, stats: [['Steps', '5'], ['Lift', '113 m'], ['Chamber', '280 × 34 m'], ['Transit', '~3.5–4 hours']], deep: 'Two parallel staircases of locks carry ships up and down at once. The chamber walls stand on rock left in place when the channel was blasted out of the granite hillside.' },
      { shot: 'dolly', act: { era: 'normal', hour: 20.5 }, stats: [['Vessels', 'up to 3,000 t'], ['Lift', '113 m'], ['Opened', '2016'], ['Time', '~40 min']], deep: 'The lift carries a tank of water with the ship floating in it, balanced by counterweights, so the motors only overcome friction and imbalance. It cuts the crossing from hours to under an hour for smaller ships.' },
    ],
  },
};
