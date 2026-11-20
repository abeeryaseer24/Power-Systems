// Accident sequences for the control-room replays.
// TMI-2: Kemeny Commission (1979) and Rogovin report (1980) sequence of events.
// Chernobyl-4: INSAG-7 (1992) and the recovered DREG/SKALA printouts.
// Values are representative of the recorded trends, not the raw logs.

export type Curve = [number, number][];
export type Ev = { t: number; text: string; look?: number; alarms?: number; big?: boolean };
export type Gauge = { id: string; label: string; unit: string; min: number; max: number; curve: Curve; warn?: number; fmt?: (v: number) => string };

export type Replay = {
  id: string;
  title: string;
  plant: string;
  date: string;
  start: number; // clock seconds since midnight at t = 0
  end: number; // t at which the replay stops
  speed: (t: number) => number; // default playback speed at time t
  gauges: Gauge[];
  events: Ev[];
  alarms: string[];
  style: 'us70s' | 'rbmk';
  extra: Record<string, Curve>;
};

export function at(c: Curve, t: number) {
  if (t <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (t <= c[i][0]) {
      const [t0, v0] = c[i - 1], [t1, v1] = c[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0 || 1);
    }
  }
  return c[c.length - 1][1];
}

export const TMI2: Replay = {
  id: 'tmi',
  title: 'The valve that stayed open',
  plant: 'Three Mile Island Unit 2',
  date: '28 March 1979',
  start: 4 * 3600,
  end: 10600,
  speed: (t) => (t < 70 ? 1.5 : t < 330 ? 6 : 45),
  style: 'us70s',
  gauges: [
    { id: 'rcs', label: 'RCS PRESSURE', unit: 'PSIG', min: 0, max: 2500, warn: 1600, curve: [[0, 2155], [37, 2155], [40, 2255], [45, 2355], [50, 2205], [60, 2010], [120, 1720], [158, 1600], [300, 1340], [600, 1210], [1800, 1100], [3600, 1050], [5460, 1000], [8520, 1010], [9000, 1600], [10600, 1650]] },
    { id: 'pzr', label: 'PRESSURIZER LEVEL', unit: 'IN', min: 0, max: 400, warn: 380, curve: [[0, 220], [37, 220], [45, 255], [60, 196], [158, 160], [300, 300], [480, 375], [660, 400], [10600, 400]] },
    { id: 'pwr', label: 'NI POWER', unit: '%', min: 0, max: 120, curve: [[0, 97], [45, 97], [46, 6], [60, 5], [300, 3], [3600, 1.6], [10600, 1]] },
    { id: 'hpi', label: 'HPI FLOW', unit: 'GPM', min: 0, max: 1200, curve: [[0, 0], [158, 0], [162, 1000], [270, 1000], [290, 180], [10600, 180]] },
    { id: 'rcdt', label: 'DRAIN TANK PRESS', unit: 'PSIG', min: 0, max: 200, warn: 150, curve: [[0, 3], [60, 12], [600, 180], [898, 192], [905, 12], [10600, 12]] },
    { id: 'cet', label: 'CORE EXIT TEMP', unit: '°F', min: 500, max: 800, warn: 700, curve: [[0, 604], [3600, 620], [5460, 690], [6000, 800], [8520, 800], [9600, 760], [10600, 720]] },
  ],
  extra: {
    porvLight: [[0, 0], [39.9, 0], [40, 1], [50, 1], [50.1, 0], [10600, 0]],
    porvActual: [[0, 0], [39.9, 0], [40, 1], [8520, 1], [8521, 0], [10600, 0]],
    pumpsB: [[0, 1], [4440, 1], [4441, 0], [10600, 0]],
    pumpsA: [[0, 1], [5460, 1], [5461, 0], [10600, 0]],
  },
  alarms: ['FW PUMP 1A TRIP', 'FW PUMP 1B TRIP', 'TURBINE TRIP', 'CONDENSATE PUMP', 'RX TRIP', 'RC PRESS HI', 'PZR LEVEL HI', 'PZR LEVEL LO', 'PORV OPEN', 'RCDT PRESS HI', 'RCDT TEMP HI', 'RCDT LEVEL HI', 'EFW START', 'EF-V12 SHUT', 'HPI ACTUATED', 'ES ACTUATED', 'RB SUMP HI', 'RB PRESS HI', 'RC PUMP 1A VIB', 'RC PUMP 1B VIB', 'RC PUMP 2A VIB', 'RC PUMP 2B VIB', 'SG A LEVEL LO', 'SG B LEVEL LO', 'MAKEUP TK LO', 'LETDOWN ISOL', 'RB ISOLATION', 'RAD MON HI', 'AUX BLDG RAD', 'INCORE TEMP HI', 'NI MISMATCH', 'GEN BKR OPEN', 'DIESEL START', 'QUENCH TK HI', 'RC FLOW LO', 'HOT LEG TEMP', 'COLD LEG TEMP', 'SG TUBE LEAK', 'COMPUTER ALARM', 'PRINTER BEHIND'],
  events: [
    { t: 0, text: '04:00. Unit 2 at 97 % power. Most of the night shift is in the control room. Unit 1 is down for refuelling.', look: 3 },
    { t: 37, text: 'Main feedwater pumps trip. The turbine trips a second later.', look: 2, alarms: 12, big: true },
    { t: 40, text: 'Pressure reaches 2,255 psig. The pilot-operated relief valve on the pressurizer opens, as designed.', look: 4, alarms: 4 },
    { t: 45, text: 'Reactor scram on high pressure. Control rods drop in.', look: 3, alarms: 14 },
    { t: 50, text: 'The PORV is signalled to close. Its indicator light goes out. The valve itself is stuck open.', look: 4, big: true },
    { t: 158, text: 'Pressure falls to 1,600 psig. High-pressure injection starts automatically.', look: 3, alarms: 6 },
    { t: 270, text: 'Pressurizer level is rising fast. The operators fear the system is "going solid" with water.', look: 4 },
    { t: 290, text: 'They throttle HPI back. The core is now losing more water through the open valve than it gets.', look: 3, big: true },
    { t: 521, text: '04:08. Auxiliary feedwater was flowing nowhere: two block valves were shut. They are opened.', look: 1, alarms: 3 },
    { t: 900, text: '04:15. The drain tank rupture disc bursts. Radioactive water spills onto the containment floor.', look: 5, alarms: 5 },
    { t: 1500, text: 'Over 100 alarms have sounded. The alarm printer is running more than an hour behind.', look: 2, alarms: 10 },
    { t: 4440, text: '05:14. Loop B coolant pumps stopped: they are shaking violently, pumping steam instead of water.', look: 1, alarms: 2 },
    { t: 5460, text: '05:41. Loop A pumps stopped. Natural circulation never establishes. The top of the core uncovers.', look: 1, big: true },
    { t: 6000, text: '06:00. Core exit thermocouples run off scale. About half the core will melt.', look: 5 },
    { t: 8520, text: '06:22. A shift supervisor coming on duty closes the block valve behind the PORV. The leak stops, 142 minutes late.', look: 4, big: true },
    { t: 10440, text: '07:24. General emergency declared.', look: 3 },
  ],
};

export const CHERNOBYL4: Replay = {
  id: 'chernobyl',
  title: 'The last 84 minutes',
  plant: 'Chernobyl Unit 4',
  date: '26 April 1986',
  start: 0,
  end: 5034,
  speed: (t) => (t < 4900 ? 40 : t < 4980 ? 6 : 1),
  style: 'rbmk',
  gauges: [
    { id: 'pwr', label: 'ТЕПЛОВАЯ МОЩНОСТЬ · THERMAL POWER', unit: 'MW', min: 0, max: 3200, warn: 1600, curve: [[0, 760], [1600, 720], [1690, 500], [1700, 30], [1900, 40], [2700, 120], [3600, 200], [4984, 200], [5012, 215], [5020, 205], [5022, 530], [5023, 1500], [5024, 3200], [5025, 12000], [5027, 320000], [5034, 320000]] },
    { id: 'orm', label: 'ОЗР · REACTIVITY MARGIN', unit: 'RODS', min: 0, max: 40, warn: 15, curve: [[0, 31], [1700, 26], [2700, 20], [3600, 14], [4920, 7], [5020, 6], [5034, 6]] },
    { id: 'flow', label: 'РАСХОД · COOLANT FLOW', unit: 'M³/H', min: 0, max: 70000, curve: [[0, 45000], [3780, 52000], [4020, 57000], [4984, 56000], [5020, 44000], [5025, 28000], [5034, 20000]] },
    { id: 'drum', label: 'ДАВЛЕНИЕ · DRUM PRESSURE', unit: 'KGF/CM²', min: 0, max: 100, warn: 75, curve: [[0, 65], [4920, 64], [4984, 65], [5020, 68], [5024, 76], [5027, 100], [5034, 100]] },
  ],
  extra: {
    rods: [[0, 0.75], [1700, 0.6], [3600, 0.25], [4920, 0.12], [5020, 0.12], [5027, 0.4], [5034, 0.4]],
    az5: [[0, 0], [5019.9, 0], [5020, 1], [5034, 1]],
    blast: [[0, 0], [5027.5, 0], [5028, 1], [5034, 1]],
  },
  alarms: ['АЗ-5', 'АЗМ', 'АЗС', 'ПРЕВ. МОЩН.', 'УРОВ. БС', 'ДАВЛ. БС', 'РАСХ. ГЦН', 'ГЦН 1', 'ГЦН 2', 'ГЦН 3', 'ГЦН 4', 'ГЦН 5', 'ГЦН 6', 'ГЦН 7', 'ГЦН 8', 'ТГ-8 СТОП', 'ПИТ. ВОДА', 'СУЗ', 'ЛАР', 'ГАР', 'ОЗР МАЛ', 'САОР ОТКЛ', 'ДРЕГ', 'СКАЛА', 'КЭТ', 'РК-1', 'ДКЭ', 'ПЕРИОД', 'МГВ', 'ТЕМП. ГРАФ'],
  events: [
    { t: 0, text: '00:00. Unit 4 at 760 MW thermal, about a quarter of full power, for a test: can the coasting turbine power the pumps for the 40 s before the diesels pick up?', look: 3 },
    { t: 1690, text: '00:28. Control is switched from the local to the global automatic system. Power collapses to about 30 MW. The core starts filling with xenon.', look: 3, alarms: 4, big: true },
    { t: 1900, text: 'To fight the xenon the operators withdraw rod after rod, far below the safe reactivity margin.', look: 1 },
    { t: 3600, text: '01:00. Power steadies at 200 MW, 6 % of nominal. The test plan required 700 MW. It goes ahead anyway.', look: 3 },
    { t: 3780, text: '01:03 and 01:07. Two more main circulation pumps start. Eight pumps push coolant to just below boiling.', look: 5, alarms: 3 },
    { t: 4920, text: '01:22:30. The SKALA printout shows a margin of 6 to 8 rods. The minimum is 15: the reactor should be shut down.', look: 2, alarms: 3, big: true },
    { t: 4984, text: '01:23:04. Turbine stop valves closed. The test begins. Four pumps coast down with the turbine.', look: 5, alarms: 4 },
    { t: 5005, text: 'Flow falls and coolant boils. In an RBMK, more steam means more reactivity: the positive void coefficient.', look: 3 },
    { t: 5020, text: '01:23:40. AZ-5 pressed. Every control rod starts to drive in at 0.4 m/s.', look: 0, big: true },
    { t: 5021, text: 'The graphite displacers on the rod tips push water out of the bottom of the core first. Reactivity rises instead of falling.', look: 3 },
    { t: 5023, text: '01:23:43. Excess power alarms: 530 MW and climbing.', look: 3, alarms: 12 },
    { t: 5025, text: 'Power passes ten times nominal. Fuel shatters, channels burst, the rods jam a third of the way down.', look: 1, alarms: 10 },
    { t: 5028, text: '01:23:44 to 47. Two explosions. The 2,000-tonne upper shield is thrown off the reactor.', look: 3, big: true },
  ],
};

export const REPLAYS: Record<string, Replay> = { tmi: TMI2, chernobyl: CHERNOBYL4 };
