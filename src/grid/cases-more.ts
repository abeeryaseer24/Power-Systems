import type { CaseFile } from './cases';

export const MORE_CASES: CaseFile[] = [
  {
    id: 'london-2003',
    verdict: 'A routine switching action left south London on one circuit, and a relay installed with the wrong rating tripped that circuit on normal load.',
    before: ['Thursday evening rush hour. South London was supplied through a pair of paths; one was about to be taken out for a transformer alarm.'],
    sequence: [
      { time: '18:11', text: 'A Buchholz alarm on a transformer at Hurst substation. Operators switch it out, leaving supply on the Wimbledon–New Cross route.' },
      { time: '18:20', text: 'A protection relay on that route, installed with a 1 A rating instead of 5 A, sees normal load as an overload and trips.' },
      { time: '18:20', text: '724 MW of demand lost: south London and parts of Kent. About 60 % of the Underground stops.' },
      { time: '18:57', text: 'Supply restored after about 40 minutes.' },
    ],
    mechanisms: [
      { title: 'N−1 only works if the backup is real', body: 'Switching out one path is safe only if the remaining path can carry the load. A hidden defect in that path turns a routine action into a blackout.', lesson: 'cascade' },
      { title: 'Protection that cannot tell load from fault', body: 'A relay with the wrong rating trips at a fraction of its intended current. It is a dormant fault waiting for the day it carries full load.', lesson: 'cascade' },
    ],
    causes: [
      { kind: 'design', text: 'Relay installed with a 1 A rather than 5 A rating during earlier work.' },
      { kind: 'people', text: 'Switching that left a single circuit without checking its protection.' },
      { kind: 'trigger', text: 'Transformer alarm at Hurst.' },
    ],
    numbers: [['Customers affected', 'About 410,000'], ['Demand lost', '724 MW'], ['Duration', 'About 40 minutes']],
    aftermath: ['Ofgem and National Grid reviewed relay commissioning and record-keeping.'],
    again: 'Hidden protection errors still exist in every grid; only rigorous testing finds them.',
  },
  {
    id: 'northeast-1965',
    verdict: 'A backup relay in Ontario had been set for flows that had long since grown, so a normal fluctuation tripped a line and the cascade reversed power into New York.',
    before: ['A November evening peak. Five 230 kV lines carried power from the Niagara stations toward Toronto.'],
    sequence: [
      { time: '17:16:11', text: 'A backup relay at Sir Adam Beck No. 2 trips one of the five lines to Toronto.' },
      { time: 'seconds later', text: 'The other four lines overload and trip. Power from Niagara reverses into New York State.' },
      { time: '17:16–17:28', text: 'The surge trips lines and generators across New York and New England.' },
      { time: '17:28', text: 'New York City is dark. Thirty million people across the region lose power.' },
    ],
    mechanisms: [
      { title: 'Settings age as the grid grows', body: 'A relay set correctly for last decade’s flows can be wrong today. Nobody had revisited this one.', lesson: 'cascade' },
      { title: 'Power reverses when paths disappear', body: 'With the Ontario lines gone, the same generation pushed its power through New York instead.', lesson: 'powerflow' },
    ],
    causes: [
      { kind: 'protection', text: 'Backup relay setting below the line’s normal load.' },
      { kind: 'planning', text: 'Loose coordination between utilities in different countries.' },
    ],
    numbers: [['People affected', 'About 30 million'], ['Duration', 'Up to 13 hours']],
    aftermath: ['The blackout led to regional reliability councils and, in 1968, the founding of NERC.'],
    again: 'Settings reviews are now required, but the lesson repeats: protection must keep up with the grid.',
  },
  {
    id: 'europe-2006',
    verdict: 'A line switched off for a cruise ship, without a full security check for the new timing, left northern Germany one trip from a split, and the trip came.',
    before: ['A Saturday night with heavy flows from east to west across Germany toward the Netherlands and France.'],
    sequence: [
      { time: '21:38', text: 'The Conneforde–Diele 380 kV double line is switched off so the Norwegian Pearl can sail down the Ems.' },
      { time: '22:05', text: 'Flows rise on the Landesbergen–Wehrendorf line. Operators take an action that makes it worse.' },
      { time: '22:10:13', text: 'Landesbergen–Wehrendorf trips. A cascade splits continental Europe into three areas within seconds.' },
      { time: '22:10:28', text: 'The western area is about 9 GW short. Frequency falls to about 49 Hz; automatic load shedding cuts around 17 GW.' },
      { time: '22:47', text: 'The areas are resynchronised.' },
    ],
    mechanisms: [
      { title: 'N−1 after switching', body: 'Taking a line out changes every flow. The security check must be redone for the new state, and at the time actually used.', lesson: 'powerflow' },
      { title: 'Load shedding that worked', body: 'Under-frequency relays across the west disconnected enough demand to save the system from collapse.', lesson: 'frequency' },
    ],
    causes: [
      { kind: 'people', text: 'Switching brought forward without a full N−1 assessment.' },
      { kind: 'protection', text: 'Different protection settings at the two ends of a tie line.' },
      { kind: 'planning', text: 'High east–west transit flows across Germany.' },
    ],
    numbers: [['Households affected', 'About 15 million'], ['Load shed', 'About 17 GW'], ['Lowest frequency (west)', 'About 49.0 Hz']],
    aftermath: ['UCTE tightened rules for coordinating cross-border switching and real-time security assessment.'],
    again: 'Regional security coordinators now check such actions, but one unplanned trip can still split a continent.',
  },
  {
    id: 'europe-2021',
    verdict: 'A coupler tripped in Croatia under heavy south-east to north-west flows and split Europe in two, but enough reserve and interruptible load meant nobody lost power by accident.',
    before: ['A winter Friday with large flows from the Balkans toward western Europe.'],
    sequence: [
      { time: '14:04:25', text: 'A busbar coupler at Ernestinovo, Croatia, trips on overcurrent.' },
      { time: '14:04:48–14:05:08', text: 'Lines trip one after another across the Balkans.' },
      { time: '14:05:08', text: 'Continental Europe separates. The north-west falls to 49.74 Hz; the south-east rises to 50.6 Hz.' },
      { time: '14:05', text: 'Reserves respond; 1.7 GW of interruptible customers in France and Italy are disconnected by contract.' },
      { time: '15:07', text: 'The two areas are resynchronised.' },
    ],
    mechanisms: [
      { title: 'A split you survive', body: 'With enough frequency containment reserve and interruptible load, each half rebalanced in seconds.', lesson: 'frequency' },
    ],
    causes: [
      { kind: 'protection', text: 'Overcurrent trip of a busbar coupler.' },
      { kind: 'planning', text: 'Heavy south-east to north-west flows.' },
    ],
    numbers: [['Lowest frequency (north-west)', '49.74 Hz'], ['Highest frequency (south-east)', '50.6 Hz'], ['Interruptible load used', 'About 1.7 GW']],
    aftermath: ['ENTSO-E reviewed flow limits and coordination in south-east Europe.'],
    again: 'It will happen again somewhere; the point is that a well-reserved grid can split without a blackout.',
  },
  {
    id: 'pakistan-2021',
    verdict: 'A switchyard fault at Guddu cascaded through a lightly loaded night-time grid so fast that frequency fell to zero in under a second.',
    before: ['Late Saturday night, low demand and few machines online.'],
    sequence: [
      { time: '23:41', text: 'A fault in the Guddu power station switchyard trips lines and generators.' },
      { time: '23:41', text: 'Frequency falls from 50 Hz to zero in less than a second, according to the government.' },
      { time: 'Next day', text: 'Power returns city by city over about 18 hours.' },
    ],
    mechanisms: [
      { title: 'Low inertia, high speed', body: 'With few machines spinning at night, a large loss drives frequency down faster than protection can respond.', lesson: 'frequency' },
    ],
    causes: [
      { kind: 'trigger', text: 'Fault at the Guddu switchyard.' },
      { kind: 'planning', text: 'Low inertia during night-time light load.' },
    ],
    numbers: [['People affected', 'About 200 million'], ['Restoration', 'Up to 18 hours']],
    aftermath: ['An inquiry examined protection and operations; the 2023 blackout two years later showed problems remained.'],
    again: 'It did happen again, in January 2023.',
  },
  {
    id: 'texas-2011',
    verdict: 'Cold froze instrument lines and equipment at plants across Texas faster than the grid could replace them, forcing 4,000 MW of rolling outages.',
    before: ['A cold front pushed demand up overnight; many plants lacked winter protection.'],
    sequence: [
      { time: '1 February, night', text: 'Temperatures plunge across Texas. Plant equipment begins to freeze.' },
      { time: '2 February, 05:00–05:40', text: 'Dozens of units trip or fail to start; gas supply is curtailed.' },
      { time: '05:43', text: 'ERCOT orders 4,000 MW of rolling outages.' },
      { time: 'Afternoon', text: 'Outages end as units return.' },
    ],
    mechanisms: [
      { title: 'Correlated failure', body: 'Cold hits every plant at once. Reserves sized for independent failures cannot cover a common cause.', lesson: 'frequency' },
    ],
    causes: [
      { kind: 'weather', text: 'Extreme cold.' },
      { kind: 'design', text: 'Plant instrumentation and equipment not winterised.' },
    ],
    numbers: [['Customers affected', 'About 3.2 million'], ['Rolling outages', '4,000 MW']],
    aftermath: ['FERC and NERC recommended winterisation; most measures stayed voluntary until after 2021.'],
    again: 'It did: Winter Storm Uri in 2021, far worse.',
  },
];
