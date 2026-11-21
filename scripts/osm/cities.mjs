// Real cities modelled the City Day / metro traction way.
// bbox: [south, west, north, east]. population: the official count that the
// building floor area distribution is scaled to. Demand is bottom-up, then
// scaled so a summer weekday peaks at targetPeak.

export const CITIES = [
  {
    id: 'dhaka', name: 'Dhaka', country: 'Bangladesh',
    bbox: [23.69, 90.33, 23.905, 90.475], center: [23.79, 90.405],
    tiles: [4, 3],
    population: 10_280_000,
    populationSource: '2022 Population and Housing Census (BBS), Dhaka North and South City Corporations',
    peakSource: 'Demand is scaled so a summer weekday evening peaks near 2,900 MW, roughly the combined peaks reported by DPDC and DESCO, the two Dhaka distribution utilities (approximate).',
    blurb: 'Bangladesh’s capital: 470,000 mapped buildings, MRT Line 6 on 1500 V DC, and a long humid summer of air conditioners.',
    ground: '#76785a',
    climate: {
      summer: { tmax: 34.5, tmin: 26, dec: 18, label: 'Pre-monsoon summer (April–May)' },
      monsoon: { tmax: 32, tmin: 26.5, dec: 18, label: 'Monsoon (July–August)' },
      winter: { tmax: 25, tmin: 13.5, dec: -21, label: 'Winter (January)' },
    },
    // fewer AC units per home than Meridia; the scale factor does the calibration
    demand: { acShare: 0.28, resBase: 0.05, resAct: 0.13, scale: 1, targetPeak: 2900 },
    metro: {
      route: 'subway', name: 'MRT Line 6', voltage: 1500, E: 1650, capacity: 2308, vmax: 27.8,
      peakHeadway: 480, offpeak: 600, service: [7.1, 21.5], peaks: [[8, 11], [16, 20]], interchange: 'Karwan Bazar', tssRating: 5,
    },
  },
];
