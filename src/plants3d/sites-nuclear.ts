import * as THREE from 'three';
import { V } from './kit';
import { bwrMarkI, pwrBW, rbmk, vver1200 } from './interiors';
import { cutBox, hills, ss, townBlocks, trussBridge } from './common';
import { skyMural } from './textures';
import type { SiteDef } from './PlantScene';

// ===================================================================== TMI

const tmiY = (x: number, z: number) => {
  // a long thin island in the Susquehanna, banks rising to wooded hills
  const isl = 1 - ss(Math.hypot(x / 420, z / 1900), 0.85, 1.05);
  const bank = ss(Math.abs(x + 120), 900, 1250);
  const river = -6 + isl * 9;
  return Math.max(river, -6 + bank * (14 + hills(x, z, 30) + Math.abs(x) * 0.012)) + isl * hills(x, z, 0.6);
};

export const TMI: SiteDef = {
  id: 'tmi',
  name: 'Three Mile Island',
  place: 'Susquehanna River, Pennsylvania',
  lat: 40.15,
  kind: 'Two Babcock & Wilcox PWRs',
  blurb: 'Four 113 m towers on a river island. Unit 2 partly melted down on 28 March 1979 after a relief valve stuck open and nobody could see it.',
  facts: [['Units', '2 × B&W PWR'], ['Unit 2', '906 MWe, 1978–79'], ['Unit 1', '819 MWe, 1974–2019'], ['Towers', '4 × 113 m'], ['Containment', '58 m, 1.2 m wall']],
  eras: [{ id: 'today', label: 'Today' }, { id: '1979', label: '28 Mar 1979' }, { id: 'u1', label: '1985–2019' }],
  cutaway: 'Open Unit 2',
  lapse: { from: 1968, to: 1978.3, marks: [[0, '1968: ground broken on the island'], [0.15, 'Containment base mats poured'], [0.4, 'Tower shells climb, one lift a day'], [0.75, 'Unit 1 commercial operation, 1974'], [0.97, 'Unit 2 online, December 1978']] },
  grid: { name: 'PJM, 1979', f0: 60, loadMW: 32000, H: 5, unitMW: 906, units: 1, kind: 'pwr', era: '1979', largestOther: 1150 },
  focus: [0, 30, 0],
  cam: [620, 260, 700],
  spawn: [-20, 60],
  extent: 1600,
  wind: [3, 1.2],
  groundY: tmiY,
  build(k, labels) {
    k.terrain(9000, { grass: '#5a6b3c', dry: '#7c7a4e', earth: '#6b5a44' }, 220);
    k.water(0, 0, 9000, 9000, 0, '#26352f');
    const u2cut = new THREE.Plane(V(-1, 0, 0), -70);
    for (const [u, z] of [[1, -150], [2, 150]] as const) {
      const inside = u === 2 ? pwrBW(k, labels) : undefined;
      k.containment(-70, z, { r: 20, h: 47, dome: 12, buttresses: 3, color: '#c7c2b6', cut: u === 2 ? u2cut : undefined, inside });
      k.box(-70, z + (u === 1 ? 45 : -45), 60, 30, 28, k.win('#b9b3a6', { cols: 6, rows: 6, lit: 0.3, seed: u }), { tile: 30 });
      k.hall(-165, z, 52, 120, 34, { wall: k.clad('#a8aca8', u), roofKind: 'flat' });
      k.box(-110, z, 22, 60, 40, k.concrete('#bfb9ad', 30, 5));
      for (const [tz, tag] of [[z - 140 * Math.sign(z) + (u === 1 ? -70 : 70), `u${u}`], [z + (u === 1 ? -60 : 60), `u${u}`]] as const) {
        k.coolingTower(190, tz, { h: 113, rb: 57, rt: 33, ry: 0.8, tag, seed: u * 3 + tz });
      }
      k.transformer(-205, z + 30, 0, 1.1);
      k.transformer(-205, z - 30, 0, 1.1);
    }
    k.box(-60, 0, 70, 90, 22, k.win('#c4beb2', { cols: 8, rows: 4, lit: 0.6, seed: 9 }), { tile: 28 });
    k.switchyard(-300, 0, 120, 230, { kv: 500 });
    k.line(new THREE.Vector2(-360, -80), new THREE.Vector2(-2600, -900), 380, 52);
    k.line(new THREE.Vector2(-360, 80), new THREE.Vector2(-2600, 1100), 380, 52);
    k.apron(-30, 0, 330, 700);
    k.perimeter(-50, 0, 350, 760, 'w');
    k.road([[-250, -1500], [-250, -500], [-230, 0], [-250, 600], [-250, 1700]], 8);
    k.road([[-250, -560], [700, -620], [1300, -640]], 9);
    k.mesh(new THREE.BoxGeometry(1000, 2, 12), k.concrete('#9a958b', 20, 4), 430, 6, -600);
    for (let x = 0; x < 900; x += 90) k.mesh(new THREE.BoxGeometry(4, 10, 8), k.concrete('#8b867c', 8, 4), x - 20, 0, -600);
    k.parking(-280, -330, 30, 4, 0);
    k.barriers(-278, -500, -262, -500);
    k.barriers(-238, -500, -222, -500);
    k.parking(-280, 330, 24, 4, 0);
    for (let i = 0; i < 10; i++) k.mast(-260 + (i % 2) * 360, -380 + Math.floor(i / 2) * 190, 28);
    const avoid = (x: number, z: number) => tmiY(x, z) < 1.5 || (Math.abs(x) < 380 && Math.abs(z) < 720);
    k.trees(9000, [-3000, -3000, 3000, 3000], avoid, 'broad', 12);
    k.trees(500, [-400, -1800, 400, 1800], avoid, 'broad', 13);
    return {
      steam: (tag, era) => (era === '1979' ? tag === 'u2' : era === 'u1' ? tag === 'u1' : false),
      stops: [
        { title: 'An island in the Susquehanna', body: 'Two pressurised-water reactors share a 3 km island, 16 km south of Harrisburg. The towers are the landmark, but they hold nothing nuclear: they just cool the condenser water.', cam: [900, 420, 1100], look: [0, 30, 0] },
        { title: 'Natural-draught cooling towers', body: 'Each 113 m hyperbolic shell is only about 20 cm thick near the throat. Warm water rains down inside, air pours in through the X-shaped legs at the base, and buoyancy does the rest. No fans.', cam: [330, 40, 240], look: [190, 70, 80] },
        { title: 'Unit 2 containment', body: 'Open the cutaway. At 4:00 am on 28 March 1979 the pilot-operated relief valve on top of the pressurizer stuck open. The control-room light only showed that the valve had been told to close. Coolant drained for over two hours and about half the core melted.', cam: [60, 60, 230], look: [-70, 25, 150] },
        { title: 'Why the pressurizer lied', body: 'With water boiling out through the open valve, steam bubbles pushed the pressurizer level up. Operators read "too much water" and throttled the emergency injection. The once-through steam generators had little inventory to buy them time.', cam: [-20, 40, 175], look: [-70, 22, 155] },
        { title: 'Turbine building', body: 'The accident began here, with a feedwater pump trip in the condensate polishers. The turbine tripped, the reactor scrammed eight seconds later, and the relief valve opened as designed. It just never closed again.', cam: [-330, 60, 320], look: [-165, 20, 150] },
        { title: '500 kV switchyard', body: 'Both units fed the PJM grid here. Unit 1 ran until 2019. It is being restarted as the Crane Clean Energy Center to supply a data centre.', cam: [-480, 80, 260], look: [-300, 10, 0] },
      ],
    };
  },
};

// ===================================================================== Rooppur

const rpY = (x: number, z: number) => {
  const river = ss(x, -1250, -820); // Padma to the west
  return -9 + river * (9 + hills(x, z, 0.8)) + river * Math.max(0, hills(x * 0.3, z * 0.3, 2.5));
};

export const ROOPPUR: SiteDef = {
  id: 'rooppur',
  name: 'Rooppur',
  place: 'Ishwardi, Pabna, on the Padma',
  lat: 24.07,
  kind: 'Two VVER-1200 (AES-2006)',
  blurb: 'Bangladesh’s first nuclear plant: two Generation III+ Russian PWRs with double containments, core catchers and four 170 m cooling towers.',
  facts: [['Units', '2 × VVER-1200'], ['Output', '2 × 1,200 MWe'], ['Containment', 'Double wall, ~70 m'], ['Towers', '4 × ~170 m'], ['Grid', '400 kV and 230 kV']],
  eras: [{ id: 'now', label: 'Unit 1 online' }, { id: 'full', label: 'Both units' }],
  cutaway: 'Open Unit 1',
  lapse: { from: 2017, to: 2026, marks: [[0, 'November 2017: first concrete for Unit 1'], [0.15, 'Containment walls rise in jump-formed lifts'], [0.4, 'Dome lifted on by the 3,200 t crawler crane'], [0.65, 'Cooling tower shells topped out'], [0.8, 'October 2023: fuel delivered'], [0.97, 'Unit 1 at power']] },
  flood: {
    from: 'west', normal: -5, max: 3, start: -1400, finish: 900,
    marks: [[-5, 'Dry-season Padma'], [-2.5, 'Typical monsoon peak'], [-1, 'Severe flood year'], [0, 'Site grade']],
    equipment: [
      { name: 'River water intake pumphouse', elev: -2 },
      { name: 'Turbine hall ground floor', elev: 0.2 },
      { name: 'Safety-train diesel buildings', elev: 0.8 },
      { name: 'Reactor building (sealed doors)', elev: 1.8 },
    ],
    note: 'Illustrative levels relative to site grade. Nuclear sites are designed for floods with roughly a 1-in-10,000-year chance, plus margin.',
  },
  grid: { name: 'Bangladesh national grid', f0: 50, loadMW: 15500, H: 4, unitMW: 1200, units: 2, kind: 'pwr', era: 'full', largestOther: 660 },
  focus: [140, 40, 0],
  cam: [-760, 260, 260],
  spawn: [-20, -40],
  extent: 1900,
  wind: [-2.2, 1.6],
  groundY: rpY,
  build(k, labels) {
    k.terrain(10000, { grass: '#4f7a2e', dry: '#8a8a3a', earth: '#7a6347' }, 220);
    k.water(-3000, 0, 4400, 10000, -5, '#5b6a52');
    for (const [u, z] of [[1, -110], [2, 110]] as const) {
      const inside = u === 1 ? vver1200(k, labels) : undefined;
      k.containment(0, z, { r: 25, h: 52, dome: 19, color: '#dad6cd', ring: true, cut: u === 1 ? new THREE.Plane(V(0, 0, 1), -z + 0) : undefined, inside });
      // four safety-train buildings and the auxiliary building around the reactor
      for (const [dx, dz] of [[-42, -30], [-42, 30], [36, -34], [36, 34]]) k.box(dx, z + dz * 0.9, 26, 22, 30, k.concrete('#d2cdc2', 26, 7 + u));
      k.box(-75, z, 40, 70, 38, k.win('#d0cbbf', { cols: 8, rows: 8, lit: 0.4, seed: 3 + u }), { tile: 34 });
      k.hall(130, z, 130, 56, 44, { wall: k.clad('#d9dcdc', 3), roofKind: 'barrel', roofColor: '#3d6f8e' });
      k.box(130, z + (z < 0 ? -40 : 40), 110, 18, 30, k.win('#3d6f8e', { cols: 12, rows: 6, lit: 0.5, seed: 7 }), { tile: 30 });
      k.transformer(215, z - 14, Math.PI / 2, 1.3);
      k.transformer(215, z + 14, Math.PI / 2, 1.3);
      for (let i = 0; i < 2; i++) k.box(-60 - i * 26, z + (z < 0 ? -75 : 75), 20, 30, 12, k.concrete('#c9c4b9', 20, 11));
      for (const tz of z < 0 ? [-400, -240] : [240, 400]) k.coolingTower(470, tz, { h: 170, rb: 64, rt: 38, ry: 0.8, tag: `u${u}`, color: '#bdb9b0', seed: u * 5 + tz });
    }
    k.chimney(-130, 0, { h: 100, rb: 3.5, rt: 2.4, bands: 10 });
    k.switchyard(140, -540, 280, 140, { kv: 400 });
    k.line(new THREE.Vector2(10, -560), new THREE.Vector2(-300, -3500), 400, 55);
    k.line(new THREE.Vector2(280, -560), new THREE.Vector2(2200, -3200), 400, 55);
    k.towerCrane(40, 160, 110, 70, 2.2);
    k.towerCrane(-40, 60, 95, 60, 0.4);
    k.apron(80, 0, 520, 760);
    k.perimeter(110, 0, 560, 900, 'w');
    k.road([[-500, -700], [-300, -380], [-200, 0], [-300, 420], [-500, 900]], 9);
    k.road([[-200, 0], [700, 0], [1400, 260]], 9);
    k.parking(-280, -200, 26, 5, Math.PI / 2);
    k.barriers(-232, -34, -232, -10);
    k.barriers(-232, 10, -232, 34);
    for (let i = 0; i < 12; i++) k.mast(-180 + (i % 3) * 260, -360 + Math.floor(i / 3) * 240, 30);
    trussBridge(k, -2700, -900, 2600, 18, 15, 16);
    trussBridge(k, -2700, -900, 2800, 22, 17, 0.1);
    townBlocks(k, 1600, 1500, 26, 900, [3, 9]);
    townBlocks(k, -600, -1700, 18, 700, [5, 16]);
    const avoid = (x: number, z: number) => rpY(x, z) < -2 || (x > -280 && x < 620 && Math.abs(z) < 640) || (x > -40 && x < 320 && z < -460 && z > -620);
    k.trees(12000, [-1200, -3500, 3500, 3500], avoid, 'broad', 21);
    return {
      steam: (tag, era) => era === 'full' || tag === 'u1',
      stops: [
        { title: 'Rooppur, on the Padma', body: 'Two 1,200 MW reactors on the east bank of the Padma, 160 km north-west of Dhaka. When both run they add about 2,400 MW, around a tenth of Bangladesh’s peak demand, on just a few hectares.', cam: [1100, 520, 900], look: [100, 40, 0] },
        { title: 'Double containment', body: 'Open the cutaway. A VVER-1200 has two walls: a pre-stressed inner containment that holds pressure, and an outer reinforced shell that stops an aircraft or an explosion from outside. The gap between them is kept under negative pressure.', cam: [140, 70, -320], look: [0, 35, -110] },
        { title: 'The core catcher', body: 'Under the reactor vessel sits a crucible filled with sacrificial oxides. If a core ever melted through, the corium would land here, spread, be diluted and cooled by water. Chernobyl and Fukushima had nothing like it.', cam: [40, 18, -175], look: [0, 6, -110] },
        { title: 'Horizontal steam generators', body: 'The VVER signature: four steam generators lying on their sides instead of standing upright. They hold more water than vertical ones, which gives operators more time if feedwater is lost.', cam: [-30, 45, -165], look: [0, 18, -110] },
        { title: 'Cooling towers', body: 'The Padma floods and shrinks with the monsoon, so the plant cannot rely on once-through river cooling. Four natural-draught towers reject the heat, and the river only makes up evaporation.', cam: [700, 60, -60], look: [470, 90, -190] },
        { title: '400 kV switchyard', body: 'The plant needed a new 400 kV backbone, including river crossings, before it could export a single megawatt. The largest unit on a grid also sets how much spinning reserve everyone else must carry.', cam: [420, 120, -720], look: [140, 10, -540] },
        { title: 'The Hardinge Bridge', body: 'Downstream stands the 1915 Hardinge railway bridge, 15 steel spans across the Padma, with the Lalon Shah road bridge beside it. You can see them from the plant.', cam: [-1300, 120, 2200], look: [-1800, 20, 2700] },
      ],
    };
  },
};

// ===================================================================== Fukushima Daiichi

const fkY = (x: number, z: number) => {
  // site cut down from a 35 m bluff to 10 m; sea to the east; units 5-6 at 13 m
  const sea = ss(x, 260, 200); // 1 on land
  const north = ss(-z, 300, 450);
  const terrace = 10 + 3 * north;
  const bluff = ss(-x, 170, 280) * (25 + hills(x, z, 14));
  const intake = ss(x, 150, 175) * -6;
  return -12 + sea * (12 + terrace + bluff + intake);
};

export const FUKUSHIMA: SiteDef = {
  id: 'fukushima',
  name: 'Fukushima Daiichi',
  place: 'Ōkuma and Futaba, Fukushima Prefecture',
  lat: 37.42,
  kind: 'Six GE boiling-water reactors',
  blurb: 'Six BWRs on a terrace cut 10 m above the Pacific. On 11 March 2011 a 14 m tsunami flooded the diesels and switchgear, and units 1 to 3 melted down.',
  facts: [['Units', '6 × BWR (Mark I / II)'], ['Total', '4,696 MWe'], ['Site grade', '10 m (units 1–4)'], ['Tsunami', '~14–15 m'], ['Stacks', '3 × 120 m']],
  eras: [{ id: 'built', label: 'Before 2011' }, { id: 'today', label: 'Today' }],
  cutaway: 'Open Unit 2',
  lapse: { from: 1966, to: 1979.5, marks: [[0, '1966: the 35 m bluff is cut down to 10 m'], [0.12, 'Unit 1 reactor building rises'], [0.35, 'Unit 1 online, March 1971'], [0.7, 'Units 2 to 5 follow, 1974–78'], [0.97, 'Unit 6 online, October 1979']] },
  flood: {
    from: 'east', normal: 0, max: 16, start: 900, finish: -350,
    marks: [[5.7, 'Design tsunami, 1966'], [10, 'Site grade, units 1–4'], [13, 'Site grade, units 5–6'], [14.5, '11 March 2011 inundation']],
    equipment: [
      { name: 'Seawater pumps at the intake', elev: 4 },
      { name: 'Emergency diesels, units 1–4 (turbine basements)', elev: 10.3 },
      { name: 'DC batteries and switchgear, units 1, 2, 4', elev: 10.6 },
      { name: 'Unit 3 DC batteries (mezzanine)', elev: 20, note: 'survived ~30 hours' },
      { name: 'Unit 6 air-cooled diesel (own building)', elev: 16, note: 'kept units 5 and 6 cool' },
    ],
    note: 'Heights above Onahama Peil (local mean sea level). Inundation from TEPCO and NAIIC reports.',
    scenario: {
      label: '11 March 2011',
      clock0: 14 * 3600 + 46 * 60,
      quakeAt: 0,
      level: [[0, 0], [41, 0], [42.5, 4], [45, 2], [49, 2], [51.5, 14.5], [57, 14.5], [63, 6], [70, 2]],
      front: [[0, 900], [41, 900], [43, 170], [47.9, 170], [48, 900], [49, 900], [52.5, -350], [70, -350]],
      events: [
        [0, '14:46. Magnitude 9.0 earthquake. All offsite power lost; units 1, 2 and 3 scram.'],
        [1, '14:47. Emergency diesels start. Decay-heat cooling continues.'],
        [41, '15:27. First wave, about 4 m. The breakwater takes most of it; the intake floods.'],
        [49, '15:35. The main wave, 14 to 15 m, over the 5.7 m design basis and the 10 m site.'],
        [51, '15:37–15:41. Water pours into the turbine basements. Diesels and switchgear fail: station blackout on units 1–4.'],
        [57, 'Up at 13 m, unit 6’s air-cooled diesel keeps running. Units 5 and 6 will be saved.'],
        [63, 'The water drains back. No AC power, no DC on units 1 and 2, no seawater pumps: decay heat has nowhere to go.'],
      ],
    },
  },
  grid: { name: 'TEPCO (50 Hz east Japan)', f0: 50, loadMW: 48000, H: 5.5, unitMW: 784, units: 6, kind: 'bwr', era: 'built', largestOther: 1356 },
  focus: [20, 30, -100],
  cam: [900, 300, 380],
  spawn: [60, 40],
  extent: 1700,
  fog: 0.00013,
  wind: [-1.5, -2.5],
  groundY: fkY,
  build(k, labels) {
    k.terrain(9000, { grass: '#4d6438', dry: '#7d7a55', earth: '#6a5a46' }, 260);
    k.water(2500, 0, 4600, 9000, 0, '#1f3d4c');
    const mural = new THREE.MeshStandardMaterial({ map: skyMural(), roughness: 0.75 });
    const built = k.era('built'), today = k.era('today');
    const cut = new THREE.Plane(V(-1, 0, 0), 0);
    const units: [number, number, number][] = [[1, -150, 41.6], [2, -75, 46], [3, 0, 46], [4, 75, 46], [5, -560, 46], [6, -650, 58]];
    for (const [u, z, w] of units) {
      const y = fkY(0, z);
      const damaged = u === 1 || u === 3 || u === 4;
      // lower building common to both eras; the refuelling floor is era-specific for 1, 3, 4
      const lowH = damaged ? 33 : 47;
      const m = k.box(0, z, w, w, lowH, mural, { tile: 46, parapet: !damaged });
      if (u === 2) cutBox(k, m, cut, bwrMarkI(k, labels), y);
      if (damaged) {
        k.box(0, z, w, w, 14, mural, { y: y + lowH, tile: 46, parent: built, collide: false });
        // today: frames, covers and the fuel-handling structures
        const steel = k.steel('#8a8e8c');
        if (u === 1) {
          for (let i = 0; i <= 5; i++) for (const s of [-1, 1]) {
            k.strut(V(-w / 2 + (w * i) / 5, y + lowH, z + s * w / 2), V(-w / 2 + (w * i) / 5, y + lowH + 12, z + s * w / 2), 0.6, steel, 'f1');
            k.strut(V(s * w / 2, y + lowH, z - w / 2 + (w * i) / 5), V(s * w / 2, y + lowH + 12, z - w / 2 + (w * i) / 5), 0.6, steel, 'f1');
          }
          k.box(0, z, w + 8, w + 8, 4, k.clad('#e6e8e6', 2), { y: y + lowH + 20, parent: today, collide: false });
          for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) k.strut(V(sx * (w / 2 + 4), y, z + sz * (w / 2 + 4)), V(sx * (w / 2 + 4), y + lowH + 20, z + sz * (w / 2 + 4)), 1.2, steel, 'f1c');
        }
        if (u === 3) {
          const dome = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.55, w * 0.55, w * 1.6, 32, 1, true, 0, Math.PI), k.clad('#e9ebe8', 4));
          dome.rotation.z = Math.PI / 2;
          dome.rotation.y = Math.PI / 2;
          dome.position.set(0, y + lowH, z + 8);
          (dome.material as THREE.Material).side = THREE.DoubleSide;
          dome.castShadow = true;
          today.add(dome);
        }
        if (u === 4) k.box(0, z + w * 0.62, w * 0.9, w * 1.25, 52, k.clad('#c9ccc9', 6), { y, parent: today, collide: false });
      }
      k.hall(88, z, 52, w * 1.55, 30, { wall: k.clad('#c8cdcf', u), roofKind: 'flat', band: true });
      k.box(-44, z, 22, w * 0.8, 22, k.concrete('#c2bdb2', 24, u));
      k.transformer(130, z - 15, Math.PI / 2, 1.1);
      for (let p = 0; p < 4; p++) k.box(170, z - 30 + p * 18, 10, 10, 4, k.steel('#5a6a74'), { y: fkY(170, z), collide: false });
    }
    k.latticeStack(-40, -112, 120);
    k.latticeStack(-40, 37, 120);
    k.latticeStack(-40, -605, 120);
    // breakwaters enclosing the intake harbour
    const bw = k.concrete('#8f8a80', 30, 4, 3);
    const arm = (x: number, z: number, w: number, d: number) => k.mesh(new THREE.BoxGeometry(w, 16, d), bw, x, -4, z);
    arm(520, -360, 600, 26); arm(800, -230, 26, 280);
    arm(480, 260, 520, 26); arm(720, 160, 26, 220);
    // seawall along the intake: built for a 5.7 m tsunami
    k.mesh(new THREE.BoxGeometry(6, 10, 900), bw, 232, 0, -100);
    k.switchyard(-460, -260, 240, 140, { kv: 275 });
    k.line(new THREE.Vector2(-560, -300), new THREE.Vector2(-3200, -800), 400, 55);
    k.line(new THREE.Vector2(-560, -220), new THREE.Vector2(-3200, 400), 400, 55);
    k.apron(80, -100, 250, 380);
    k.perimeter(40, -100, 300, 420, 'w');
    k.apron(80, -600, 250, 210);
    k.road([[-1200, -260], [-560, -180], [-110, -150], [-110, 120], [-60, 300]], 9);
    k.road([[-110, -150], [-110, -700]], 8);
    k.parking(-200, 120, 30, 4, 0);
    k.barriers(-136, -210, -136, -180);
    // treated-water tanks: more than a thousand of them by 2023
    k.tankFarm(-520, 120, 24, 12, 6, 12, 2, '#d3d7d6', today);
    k.tankFarm(-380, 420, 20, 10, 6, 12, 2, '#c7ccca', today);
    k.tankFarm(-760, -120, 14, 18, 6, 12, 2, '#d3d7d6', today);
    for (let i = 0; i < 8; i++) k.mast(40 + (i % 2) * 120, -260 + Math.floor(i / 2) * 110, 30);
    townBlocks(k, -2600, 600, 30, 1400, [2, 5]);
    const avoid = (x: number, z: number) => fkY(x, z) < 1 || (x > -280 && x < 240 && z > -760 && z < 220) || (x > -1000 && x < -280 && z > -200 && z < 700);
    k.trees(14000, [-3000, -3000, 300, 3000], avoid, 'pine', 31);
    return {
      steam: () => false,
      stops: [
        { title: 'Six reactors on the Pacific', body: 'Units 1 to 4 sit at 10 m above sea level, units 5 and 6 at 13 m. The bluff was 35 m high, and it was cut down in the 1960s to make pumping seawater easier.', cam: [1000, 260, 420], look: [0, 20, -250] },
        { title: 'Painted sky', body: 'The reactor buildings were painted with a blue sky and white clouds, to soften them against the coast. Inside each one is a GE boiling-water reactor in a Mark I containment.', cam: [180, 40, -40], look: [0, 30, -75] },
        { title: 'Unit 2, opened', body: 'Open the cutaway. The steel drywell (the "inverted light bulb") holds the reactor. Below it sits the torus suppression pool, which condenses steam. The spent fuel pool is up on the refuelling floor, outside the containment.', cam: [90, 55, -50], look: [0, 25, -75] },
        { title: 'The seawall', body: 'The design tsunami was 5.7 m. The wave on 11 March 2011 was about 14 m and flooded the turbine-building basements, where most emergency diesels and DC switchgear were. That was station blackout, then loss of cooling.', cam: [420, 30, -60], look: [232, 8, -100] },
        { title: 'Exhaust stacks', body: 'The 120 m stacks are braced by steel lattice. During venting, hydrogen from unit 3 flowed back through shared ducts into unit 4, which exploded although its core had been unloaded.', cam: [120, 140, 110], look: [-40, 80, 37] },
        { title: 'Units 5 and 6', body: 'Built 3 m higher, with one air-cooled diesel that survived. Its power was shared, and units 5 and 6 reached cold shutdown without melting.', cam: [260, 90, -460], look: [0, 25, -605] },
        { title: 'Decommissioning', body: 'Switch to Today. Unit 1 stands in a steel frame, unit 3 has a curved fuel-removal cover, and unit 4 has a new fuel-handling building beside it. More than a thousand tanks hold treated water, released to sea since 2023.', cam: [200, 260, 600], look: [-300, 10, 100] },
      ],
    };
  },
};

// ===================================================================== Chernobyl

const chY = (x: number, z: number) => {
  const pond = ss(z, 450, 560) * ss(x, -500, -300) * (1 - ss(x, 5000, 5400));
  return 1 + hills(x, z, 1.2) - pond * 9;
};

export const CHERNOBYL: SiteDef = {
  id: 'chernobyl',
  name: 'Chernobyl',
  place: 'Pripyat, Ukraine',
  lat: 51.39,
  kind: 'Four RBMK-1000 reactors',
  blurb: 'Four graphite-moderated channel reactors in one 800 m building. Unit 4 exploded on 26 April 1986. Today a 108 m steel arch, the largest movable land structure ever built, covers it.',
  facts: [['Units', '4 × RBMK-1000'], ['Each', '1,000 MWe, 3,200 MWt'], ['Turbine hall', '~800 m long'], ['New Safe Confinement', '257 m span, 108 m high'], ['Cooling', '22 km² pond']],
  eras: [{ id: 'today', label: 'Today' }, { id: '1985', label: '1985' }],
  cutaway: 'Open units 3 and 4',
  lapse: { from: 1970, to: 2016.9, end: 0.3, marks: [[0, '1970: construction begins beside the Pripyat'], [0.08, 'Unit 1 online, 1977'], [0.29, 'Unit 4 online, December 1983'], [0.33, '26 April 1986: unit 4 explodes'], [0.86, '2010–16: the arch is assembled to the west'], [0.94, 'November 2016: 36,000 t slid 327 m into place']] },
  grid: { name: 'Soviet unified grid, Kyiv region', f0: 50, loadMW: 26000, H: 6, unitMW: 1000, units: 4, kind: 'rbmk', era: '1985', largestOther: 1000 },
  focus: [-100, 30, 0],
  cam: [700, 320, 900],
  spawn: [-150, 90],
  extent: 1900,
  fog: 0.00012,
  wind: [2.5, -1],
  groundY: chY,
  build(k, labels) {
    k.terrain(11000, { grass: '#5d6b3e', dry: '#8b8456', earth: '#6c5c47' }, 260);
    k.water(2400, 3000, 6400, 5000, -3, '#3a4a46');
    const today = k.era('today'), old = k.era('1985');
    const cut = new THREE.Plane(V(0, 0, -1), 0);
    const facade = k.win('#cfc9bb', { cols: 10, rows: 12, lit: 0.25, seed: 5 });
    // the continuous turbine hall on the north side and the deaerator gallery
    k.hall(-280, -82, 580, 51, 31, { wall: k.clad('#b9bdb8', 9), roofKind: 'flat' });
    k.box(-280, -48, 580, 14, 50, facade, { tile: 36 });
    const units: [number, number][] = [[1, -500], [2, -350], [3, -70], [4, 90]];
    for (const [u, x] of units) {
      if (u === 4) {
        k.box(x, 0, 62, 72, 72, k.concrete('#cbc6ba', 36, 12), { parent: old, collide: false });
        continue;
      }
      const m = k.box(x, 0, 62, 72, 72, k.concrete('#cbc6ba', 36, 12 + u), { parapet: u !== 3 });
      if (u === 3) cutBox(k, m, cut, rbmk(k, labels), chY(x, 0));
      k.box(x, 48, 50, 24, 30, facade, { tile: 30 });
    }
    k.box(-205, 0, 210, 60, 36, facade, { tile: 34 });
    k.latticeStack(-425, 30, 150, 16, 5);
    const stack34 = new THREE.Group();
    old.add(stack34);
    // the old 3-4 stack (VT-2) stood until 2013; drawn only in 1985
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 150, 24), new THREE.MeshStandardMaterial({ color: '#d6d2c9', roughness: 0.7 }));
    tube.position.set(10, chY(10, 0) + 75, 30);
    tube.castShadow = true;
    stack34.add(tube);

    // New Safe Confinement: a steel arch on rails, 257 m span, 108 m high, 162 m long
    const half = 128.5, H = 108, L = 162, depth = 12;
    const arch = new THREE.Shape();
    const curve = (r: number, h: number, n = 48) => Array.from({ length: n + 1 }, (_, i) => {
      const a = Math.PI - (i / n) * Math.PI;
      return new THREE.Vector2(Math.cos(a) * r, Math.pow(Math.sin(a), 0.82) * h);
    });
    const outer = curve(half, H), inner = curve(half - depth, H - depth).reverse();
    arch.setFromPoints([...outer, ...inner]);
    const ag = new THREE.ExtrudeGeometry(arch, { depth: L, bevelEnabled: false, curveSegments: 48 });
    ag.translate(0, 0, -L / 2);
    const auv = ag.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < auv.count; i++) auv.setXY(i, auv.getX(i) / 26, auv.getY(i) / 26);
    const steelPanel = k.clad('#c9ced1', 14).clone();
    steelPanel.metalness = 0.75;
    steelPanel.roughness = 0.32;
    const nsc = new THREE.Mesh(ag, steelPanel);
    nsc.rotation.y = Math.PI / 2;
    nsc.position.set(90, chY(90, 0), 0);
    nsc.castShadow = true;
    nsc.receiveShadow = true;
    const nscG = new THREE.Group();
    today.add(nscG);
    nscG.add(nsc);
    const endShape = new THREE.Shape(curve(half - depth / 2, H - depth / 2));
    const endMat = k.clad('#b3b8b9', 15).clone();
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.ShapeGeometry(endShape, 32), endMat);
      e.rotation.y = Math.PI / 2;
      e.position.set(90 + (s * L) / 2, chY(90, 0), 0);
      e.castShadow = true;
      nscG.add(e);
    }
    // the Shelter (1986 sarcophagus) inside: stepped cascade wall, buttresses, the ruin
    const shelter = new THREE.Group();
    const dark = k.concrete('#6f6b64', 20, 31);
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(70, 14, 10), dark);
      b.position.set(0, 7 + i * 13, -36 - (4 - i) * 6);
      shelter.add(b);
    }
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(8, 50 - i * 6, 10), dark);
      b.position.set(-38, 25 - i * 3, -30 + i * 20);
      shelter.add(b);
    }
    const ruinW = new THREE.Mesh(new THREE.BoxGeometry(62, 45, 4), k.concrete('#8a857c', 20, 33));
    ruinW.position.set(0, 22, 36);
    shelter.add(ruinW);
    for (let i = 0; i < 18; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 72, 8), k.steel('#5e5f5c'));
      p.rotation.x = Math.PI / 2;
      p.position.set(-30 + i * 3.6, 62, 0);
      shelter.add(p);
    }
    const ruin = rbmk(k, labels, true);
    shelter.add(ruin);
    const nscIn = new THREE.Group();
    nscIn.add(shelter);
    nscIn.position.set(90, chY(90, 0), 0);
    nscIn.visible = false;
    nscG.add(nscIn);
    k.cutaways.push({ plane: cut, mats: [steelPanel, endMat], inside: nscIn });
    labels.push({ text: 'The Shelter, 1986: cascade wall', obj: shelter, at: V(0, 60, -36) });
    labels.push({ text: 'New Safe Confinement, 2016', obj: nscIn, at: V(0, 112, -20) });

    // unfinished units 5 and 6: two cooling towers, one never completed
    k.coolingTower(1400, 120, { h: 150, rb: 60, rt: 36, steam: false, color: '#a9a69e', seed: 41 });
    k.coolingTower(1580, 250, { h: 150, rb: 60, rt: 36, built: 0.62, steam: false, color: '#a29f97', seed: 42 });
    k.towerCrane(1660, 250, 120, 70, 2.6);
    k.box(1250, -120, 90, 90, 48, k.concrete('#a8a399', 30, 44), { parapet: false });
    k.towerCrane(1290, -60, 90, 55, 0.3);
    k.switchyard(-300, -420, 380, 170, { kv: 750 });
    k.line(new THREE.Vector2(-450, -510), new THREE.Vector2(-1800, -3600), 420, 60);
    k.line(new THREE.Vector2(-150, -510), new THREE.Vector2(800, -3600), 420, 60);
    k.apron(-200, 0, 820, 280);
    k.perimeter(-160, -60, 900, 420, 'n');
    k.road([[-3000, -260], [-700, -200], [400, -200], [1500, -60], [1700, 400]], 9);
    k.road([[-700, -200], [-1400, -1200], [-2400, -2200]], 9);
    k.parking(-600, 80, 20, 3, 0, 0.3);
    k.barriers(-650, -236, -650, -210);
    k.barriers(-650, -190, -650, -164);
    for (let i = 0; i < 14; i++) k.prop('covered_car', -560 + i * 3.4, 150, (k.R() - 0.5) * 0.3);
    // Pripyat on the horizon
    townBlocks(k, -2400, -2300, 34, 1000, [9, 16]);
    for (let i = 0; i < 10; i++) k.mast(-560 + i * 80, 120, 26);
    const avoid = (x: number, z: number) => chY(x, z) < -1 || (x > -720 && x < 330 && z > -540 && z < 200) || (x > 1100 && x < 1800 && z > -220 && z < 400) || (x > -3200 && x < -1700 && z > -2900 && z < -1700);
    k.trees(22000, [-3200, -3200, 3200, 2400], avoid, 'pine', 41);
    return {
      steam: () => false,
      onBuild: (p) => {
        // before 2010 there is no arch; it is built 327 m west, then slid east
        nscG.visible = p === null || p > 0.86;
        nscG.position.x = p === null ? 0 : -327 * (1 - THREE.MathUtils.smoothstep(p, 0.92, 0.99));
        stack34.visible = p !== null && p < 0.9;
      },
      stops: [
        { title: 'Chernobyl Nuclear Power Plant', body: 'Four RBMK-1000 reactors in a single building nearly a kilometre long, cooled by a 22 km² artificial pond. Units 5 and 6 were half-built when unit 4 exploded.', cam: [900, 380, 1100], look: [-150, 30, 0] },
        { title: 'The New Safe Confinement', body: 'Assembled away from the reactor and slid 327 m into place on rails in November 2016. It is 257 m across, 108 m high and weighs 36,000 tonnes, designed to last a century and to let the ruin beneath be taken apart.', cam: [360, 70, 260], look: [90, 50, 0] },
        { title: 'Inside the arch', body: 'Open the cutaway. Under the arch is the Shelter, the concrete sarcophagus built in 206 days in 1986, with its stepped cascade wall. In the ruin, the 2,000-tonne upper shield "Elena" still sits nearly on edge, where the explosion dropped it.', cam: [150, 60, 170], look: [90, 30, 0] },
        { title: 'Unit 3 reactor hall', body: 'The same design, intact. The floor of the central hall is the top of the reactor: 1,661 fuel and control channels under removable caps. The refuelling machine could change fuel at full power, which suited plutonium production as well as electricity.', cam: [-70, 50, 110], look: [-70, 20, 0] },
        { title: 'The turbine hall', body: 'One continuous hall for all eight turbines. The 1986 test was about whether a coasting-down turbine could power the pumps for the 40 s before the diesels took load. The fire on its roof was fought on the night of the explosion.', cam: [-300, 60, -230], look: [-280, 20, -80] },
        { title: 'Units 5 and 6', body: 'Construction stopped in 1989. One cooling tower is complete and has never held water. The other stops at 62 % of its height with the cranes still on site.', cam: [1150, 80, 540], look: [1480, 70, 180] },
        { title: 'Pripyat', body: 'The town of 49,000 built for the plant’s workers, 3 km away. It was evacuated 36 hours after the explosion and is still empty.', cam: [-1400, 140, -1200], look: [-2400, 30, -2300] },
      ],
    };
  },
};
