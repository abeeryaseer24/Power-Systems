// Study regions. Each is a reduced transmission model built from OpenStreetMap,
// with the rest of the interconnected system represented by one external
// equivalent behind the lines that cross the study boundary.
//
// demandMW is the regional demand at the time of the signature event (approximate,
// from the public reports listed in src/grid/events.ts).

export const KV_LADDER = [110, 115, 132, 138, 150, 187, 220, 230, 275, 330, 345, 380, 400, 500, 765];

export const REGIONS = [
  {
    id: 'dhaka', city: 'Dhaka', country: 'Bangladesh', scope: 'National grid of Bangladesh',
    bbox: [20.6, 88.0, 26.7, 92.75], area: 'BD', minKV: 230, freq: 50, center: [23.81, 90.41],
    demandMW: 11200, ext: { name: 'India (Bheramara HVDC)', MW: 1000, H: 0, hvdc: true, at: [24.07, 88.99] },
    roads: 'motorway|trunk', rivers: true,
  },
  {
    id: 'dhaka-metro', city: 'Dhaka metro', country: 'Bangladesh', scope: 'Greater Dhaka, 230 and 132 kV',
    bbox: [23.55, 90.15, 24.1, 90.7], minKV: 132, freq: 50, center: [23.81, 90.41],
    demandMW: 5200, ext: { name: 'Rest of the Bangladesh grid', MW: 9000, H: 4 },
    roads: 'motorway|trunk|primary', rivers: true,
  },
  {
    id: 'london', city: 'London', country: 'United Kingdom', scope: 'South and east England, 400 and 275 kV',
    bbox: [50.75, -1.7, 54.2, 2.3], exclude: [[49, 1.45, 51.08, 3]], minKV: 275, freq: 50, center: [51.507, -0.128],
    demandMW: 14000, ext: { name: 'Rest of Great Britain', MW: 18000, H: 4 },
    roads: 'motorway', rivers: false,
  },
  {
    id: 'newyork', city: 'New York', country: 'United States', scope: 'New York City and surroundings, 345 and 230 kV',
    bbox: [40.35, -74.75, 41.55, -73.25], minKV: 230, freq: 60, center: [40.713, -74.006],
    demandMW: 11000, ext: { name: 'Eastern Interconnection', MW: 30000, H: 5 },
    roads: 'motorway', rivers: false,
  },
  {
    id: 'houston', city: 'Houston', country: 'United States', scope: 'Greater Houston, ERCOT 345 kV',
    bbox: [28.8, -96.5, 30.7, -94.3], minKV: 345,
    // only the 345 kV grid is modelled; the parallel 138 kV network carries much of the local transfer
    ratingScale: 2, freq: 60, center: [29.76, -95.37],
    demandMW: 15000, ext: { name: 'Rest of ERCOT', MW: 45000, H: 4 },
    roads: 'motorway', rivers: false,
  },
  {
    id: 'madrid', city: 'Madrid', country: 'Spain', scope: 'Madrid region, 400 and 220 kV',
    bbox: [39.7, -4.8, 41.2, -2.7], minKV: 220, freq: 50, center: [40.417, -3.704],
    demandMW: 4200, ext: { name: 'Rest of the Iberian peninsula', MW: 24000, H: 3 },
    roads: 'motorway', rivers: false,
  },
  {
    id: 'delhi', city: 'Delhi', country: 'India', scope: 'National Capital Region, 400 and 220 kV',
    bbox: [28.0, 76.5, 29.3, 77.8], minKV: 220, freq: 50, center: [28.614, 77.209],
    demandMW: 5000, ext: { name: 'Northern Region grid', MW: 32000, H: 4 },
    roads: 'motorway|trunk', rivers: true,
  },
  {
    id: 'rome', city: 'Rome', country: 'Italy', scope: 'Lazio, 380 and 220 kV',
    bbox: [41.3, 11.8, 42.5, 13.3], minKV: 220, freq: 50, center: [41.903, 12.496],
    demandMW: 2400, ext: { name: 'Rest of Italy and European imports', MW: 24000, H: 4 },
    roads: 'motorway', rivers: true,
  },
  {
    id: 'adelaide', city: 'Adelaide', country: 'Australia', scope: 'South Australia, 275 and 132 kV',
    bbox: [-38.2, 134.8, -31.6, 141.0], minKV: 132, freq: 50, center: [-34.929, 138.601],
    demandMW: 1900, ext: { name: 'Victoria (Heywood interconnector)', MW: 650, H: 0, hvdc: true, at: [-37.6, 140.9] },
    roads: 'motorway|trunk', rivers: false,
  },
  {
    id: 'sapporo', city: 'Sapporo', country: 'Japan', scope: 'Hokkaido, 275 and 187 kV',
    bbox: [41.35, 139.3, 45.6, 146.0], minKV: 187, freq: 50, center: [43.062, 141.354],
    demandMW: 3100, // Tomari has been shut since 2012 and was not running in 2018
    offline: ['Tomari'],
    ext: { name: 'Honshu (Hokkaido–Honshu HVDC)', MW: 600, H: 0, hvdc: true, at: [41.85, 140.72] },
    roads: 'motorway', rivers: false,
  },
  {
    id: 'karachi', city: 'Karachi', country: 'Pakistan', scope: 'Karachi and lower Sindh, 500 and 220 kV',
    bbox: [24.5, 66.6, 26.0, 68.6], minKV: 220, freq: 50, center: [24.861, 67.01],
    demandMW: 2300, ext: { name: 'NTDC national grid', MW: 9000, H: 4 },
    roads: 'motorway|trunk', rivers: false,
  },
  {
    id: 'caracas', city: 'Caracas', country: 'Venezuela', scope: 'National grid of Venezuela, 765 and 400 kV',
    bbox: [0.6, -73.4, 12.3, -59.8], area: 'VE', minKV: 400, freq: 60, center: [10.48, -66.9],
    // Venezuela runs essentially as an island; the small Colombia ties were out of service in 2019
    // the Guri corridor is series compensated; some thermal plant near the load was running in 2019
    seriesComp: 0.5, mustRun: ['Planta Centro', 'El Sitio', 'TermoCarabobo', 'José María España'],
    demandMW: 12500, ext: { name: 'None (isolated grid)', MW: 1, H: 0, hvdc: true },
    roads: 'motorway|trunk', rivers: true,
  },
  {
    id: 'saopaulo', city: 'São Paulo', country: 'Brazil', scope: 'São Paulo and Paraná, Itaipu to the load, 765 to 440 kV',
    bbox: [-26.0, -55.0, -21.0, -45.0], minKV: 440, freq: 60, center: [-23.55, -46.63], seriesComp: 0.4,
    demandMW: 22000, ext: { name: 'Rest of the Brazilian grid', MW: 40000, H: 4 },
    roads: 'motorway', rivers: true,
  },
  {
    id: 'istanbul', city: 'Istanbul', country: 'Türkiye', scope: 'National grid of Türkiye, 400 kV',
    bbox: [35.8, 25.6, 42.2, 44.9], area: 'TR', minKV: 380, freq: 50, center: [41.01, 28.98],
    demandMW: 32200, ext: { name: 'Continental Europe (Bulgaria and Greece ties)', MW: 30000, H: 5, ties: [[41.75, 26.55], [41.3, 26.45]] },
    roads: 'motorway', rivers: false,
  },
  {
    id: 'colombo', city: 'Colombo', country: 'Sri Lanka', scope: 'National grid of Sri Lanka, 220 and 132 kV',
    bbox: [5.8, 79.5, 9.95, 82.0], area: 'LK', minKV: 132, freq: 50, center: [6.93, 79.85],
    demandMW: 1900, ext: { name: 'None (isolated grid)', MW: 1, H: 0, hvdc: true },
    roads: 'motorway|trunk', rivers: false,
  },
  {
    id: 'moscow', city: 'Moscow', country: 'Russia', scope: 'Moscow and the surrounding oblasts, 500 and 220 kV',
    bbox: [54.4, 36.0, 56.6, 39.6], minKV: 220, freq: 50, center: [55.756, 37.617],
    demandMW: 13000, ext: { name: 'Unified Energy System of Russia', MW: 40000, H: 5 },
    roads: 'motorway|trunk', rivers: true,
  },
  {
    id: 'tashkent', city: 'Tashkent', country: 'Uzbekistan', scope: 'Central Asian Power System: Uzbekistan, Kyrgyzstan, south Kazakhstan, Tajikistan, 500 kV',
    bbox: [37.5, 64.0, 44.5, 80.0], minKV: 500, freq: 50, center: [41.31, 69.28],
    demandMW: 15000, ext: { name: 'North Kazakhstan and Russia', MW: 20000, H: 4 },
    roads: 'motorway|trunk', rivers: true,
  },
];
