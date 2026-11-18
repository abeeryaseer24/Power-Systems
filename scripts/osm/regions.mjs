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
    id: 'london', city: 'London', country: 'United Kingdom', scope: 'South and east England, 400 and 275 kV',
    bbox: [50.75, -1.7, 54.2, 2.3], minKV: 275, freq: 50, center: [51.507, -0.128],
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
    bbox: [28.8, -96.5, 30.7, -94.3], minKV: 345, freq: 60, center: [29.76, -95.37],
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
    demandMW: 1900, ext: { name: 'Victoria (Heywood interconnector)', MW: 9000, H: 4 },
    roads: 'motorway|trunk', rivers: false,
  },
  {
    id: 'sapporo', city: 'Sapporo', country: 'Japan', scope: 'Hokkaido, 275 and 187 kV',
    bbox: [41.35, 139.3, 45.6, 146.0], minKV: 187, freq: 50, center: [43.062, 141.354],
    demandMW: 3100, ext: { name: 'Honshu (Hokkaido–Honshu HVDC)', MW: 600, H: 0, hvdc: true, at: [41.85, 140.72] },
    roads: 'motorway', rivers: false,
  },
  {
    id: 'karachi', city: 'Karachi', country: 'Pakistan', scope: 'Karachi and lower Sindh, 500 and 220 kV',
    bbox: [24.5, 66.6, 26.0, 68.6], minKV: 220, freq: 50, center: [24.861, 67.01],
    demandMW: 2300, ext: { name: 'NTDC national grid', MW: 9000, H: 4 },
    roads: 'motorway|trunk', rivers: false,
  },
];
