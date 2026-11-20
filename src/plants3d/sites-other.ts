import * as THREE from 'three';
import { V, type Kit } from './kit';
import { hills, ss, townBlocks } from './common';
import type { SiteDef } from './PlantScene';

function cyl(k: Kit, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, parent?: THREE.Object3D) {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 20), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  m.castShadow = m.receiveShadow = true;
  (parent ?? k.root).add(m);
  return m;
}

// ===================================================================== Drax

const dxY = (x: number, z: number) => {
  const river = Math.abs(z + 1600 - 220 * Math.sin(x / 640));
  return 2 + hills(x, z, 0.8) - (1 - ss(river, 50, 90)) * 7;
};

export const DRAX: SiteDef = {
  id: 'drax',
  name: 'Drax',
  place: 'Selby, North Yorkshire',
  lat: 53.74,
  kind: 'Biomass, formerly coal',
  blurb: 'Once the largest coal plant in western Europe. Twelve cooling towers, a 259 m chimney and four white domes that hold wood pellets shipped across the Atlantic.',
  facts: [['Capacity', '~2,600 MW (biomass)'], ['Peak', '3,960 MW, 6 units'], ['Towers', '12 × 114 m'], ['Chimney', '259 m'], ['Domes', '4 × 50 m, 75,000 t each']],
  eras: [{ id: 'today', label: 'Biomass, today' }, { id: 'coal', label: 'Coal, 2010' }],
  grid: { name: 'GB transmission system', f0: 50, loadMW: 29000, H: 3, unitMW: 645, units: 4, kind: 'thermal', era: 'today', largestOther: 1320 },
  focus: [0, 40, -40],
  cam: [900, 360, 900],
  spawn: [0, 160],
  extent: 1900,
  wind: [3.5, 0.8],
  groundY: dxY,
  build(k) {
    k.terrain(10000, { grass: '#5f7a3a', dry: '#9a9157', earth: '#7b6a4e' }, 220);
    for (let x = -5000; x < 5000; x += 320) k.water(x + 160, -1600 + 220 * Math.sin((x + 160) / 640), 340, 110, -1.5, '#4a5a52');
    const wall = k.win('#6c7378', { cols: 12, rows: 10, lit: 0.3, seed: 11, glass: '#2a3138' });
    k.box(0, 0, 440, 62, 76, wall, { tile: 40 });
    k.hall(0, -68, 440, 46, 38, { wall: k.clad('#8e979c', 2), roofKind: 'flat' });
    k.box(0, 50, 440, 30, 46, k.clad('#7f888d', 6), { tile: 30 });
    k.chimney(0, 140, { h: 259, rb: 14, rt: 8.5, smoke: true, tag: 'coal' });
    let n = 0;
    for (const gx of [-1, 1]) for (const row of [-250, -138]) for (const col of [310, 420, 530]) {
      k.coolingTower(gx * col, row, { h: 114, rb: 49, rt: 29, ry: 0.79, tag: `t${n++}`, color: '#b9b4a7', seed: n });
    }
    // flue-gas desulphurisation, added 1988-95
    for (let i = 0; i < 6; i++) k.tank(-200 + i * 80, 220, 12, 48, '#d4d2cc');
    k.box(0, 280, 520, 40, 22, k.clad('#a9b0b2', 8));
    // biomass domes and the conveyors that feed the mills
    const white = k.plain('#eceae4', 0.55, 0.1);
    for (let i = 0; i < 4; i++) {
      const x = -240 + i * 160;
      const d = new THREE.Mesh(new THREE.SphereGeometry(31.5, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2), white);
      d.scale.y = 50 / 31.5;
      d.position.set(x, dxY(x, 520), 520);
      d.castShadow = d.receiveShadow = true;
      k.root.add(d);
      k.colliders.push({ x, z: 520, r: 32 });
      k.strut(V(x, 48, 500), V(x * 0.4, 60, 300), 4, k.clad('#c7cbcc', 3), 'conv');
      k.strut(V(x, 52, 520), V(x, 52, 560), 3, k.clad('#c7cbcc', 3), 'conv');
    }
    k.strut(V(-260, 60, 300), V(260, 60, 300), 4, k.clad('#c7cbcc', 3), 'conv');
    k.strut(V(0, 60, 300), V(0, 70, 65), 4, k.clad('#c7cbcc', 3), 'conv');
    // rail loop with a biomass train standing on it
    const loop: [number, number][] = [];
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; loop.push([Math.cos(a) * 420, 560 + Math.sin(a) * 150]); }
    k.road(loop, 6, false);
    const wagon = new THREE.BoxGeometry(16, 4.2, 3.2);
    wagon.translate(0, 2.6, 0);
    for (let i = 0; i < 30; i++) {
      const a = 0.4 + i * 0.045;
      const x = Math.cos(a) * 420, z = 560 + Math.sin(a) * 150;
      const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -Math.atan2(150 * Math.cos(a), -420 * Math.sin(a)));
      k.instance('wagon', wagon, k.plain(i === 0 ? '#2e4a3a' : '#5d7a4a', 0.6, 0.3), new THREE.Matrix4().compose(V(x, dxY(x, z), z), q, V(1, 1, 1)));
    }
    k.switchyard(0, -380, 420, 150, { kv: 400 });
    k.line(new THREE.Vector2(-180, -460), new THREE.Vector2(-2200, -3800), 380, 52);
    k.line(new THREE.Vector2(180, -460), new THREE.Vector2(2600, -3800), 380, 52);
    for (let i = 0; i < 6; i++) for (const tx of [-1, 1]) k.transformer(tx * (60 + i * 30), -110, 0, 1.2);
    k.apron(0, 60, 1260, 620);
    k.road([[-3000, 760], [-500, 760], [600, 760], [3000, 700]], 9);
    k.road([[-500, 760], [-500, 300]], 8);
    k.parking(-560, 380, 30, 5, Math.PI / 2);
    k.barriers(-532, 700, -512, 700);
    k.barriers(-488, 700, -468, 700);
    for (let i = 0; i < 14; i++) k.mast(-560 + (i % 7) * 186, -150 + Math.floor(i / 7) * 400, 32);
    townBlocks(k, -2400, 1800, 30, 900, [1, 3]);
    // English field boundaries: hedgerows with trees
    const avoid = (x: number, z: number) => (Math.abs(x) < 720 && z > -480 && z < 760) || dxY(x, z) < 0;
    const R = k.R;
    for (let x = -4000; x < 4000; x += 330) for (let z = -4000; z < 4000; z += 260) {
      if (R() < 0.35) continue;
      k.trees(10, [x, z - 3, x + 330, z + 3], avoid, 'broad', Math.floor(x * 7 + z));
      k.trees(8, [x - 3, z, x + 3, z + 260], avoid, 'broad', Math.floor(x + z * 3));
    }
    return {
      steam: (tag, era) => (era === 'coal' ? true : tag !== 'coal' && Number(tag?.slice(1)) % 3 !== 2),
      stops: [
        { title: 'Drax Power Station', body: 'Built 1967–86 on the Yorkshire coalfield, at its peak it made about 7 % of Britain’s electricity. Since 2013 four of its six units have been converted to burn wood pellets, and the last coal was burned in 2021.', cam: [1200, 450, 1000], look: [0, 40, 0] },
        { title: 'The 259 m chimney', body: 'Three flues inside one concrete windshield, tall enough to carry flue gas over the inversion layer. When coal burned the plume was visible from the North Sea coast.', cam: [180, 60, 380], look: [0, 150, 140] },
        { title: 'Twelve cooling towers', body: 'Two banks of six, each 114 m tall, rejecting about 4 GW of heat at full load. Switch to Coal, 2010 to see all twelve steaming with the chimney plume.', cam: [-900, 120, -40], look: [-420, 60, -200] },
        { title: 'The boiler house', body: 'Six 660 MW units in one 76 m hall. Each boiler burns pulverised fuel from five mills. Wood pellets go through the same mills, retuned, and the electrical side was never touched.', cam: [260, 50, 180], look: [0, 40, 0] },
        { title: 'Biomass domes', body: 'Each dome stores about 75,000 tonnes of pellets in a nitrogen-blanketed atmosphere, because wood dust can self-heat and explode. Trains arrive from the ports at Hull, Immingham and Tyne.', cam: [-120, 60, 760], look: [0, 30, 520] },
        { title: 'The rail loop', body: 'Trains run round the loop without uncoupling and drop pellets through bottom doors into hoppers underground. Up to 17 trains a day.', cam: [500, 40, 820], look: [300, 0, 600] },
      ],
    };
  },
};

// ===================================================================== Three Gorges

const DAM_Z0 = -1150, DAM_Z1 = 1180, CREST = 185;
const lockLevel = (x: number) => (x < -500 ? 175 : x > 900 ? 66 : 175 - Math.floor((x + 500) / 280) * 22);
const tgTerrain = (x: number, z: number) => {
  const az = Math.abs(z - 40);
  let y = 30 + ss(az, 700, 1500) * (420 + hills(x, z, 160)) + ss(az, 1300, 3000) * 250;
  if (z < -1400 && z > -1700 && x > -900 && x < 1200) y = Math.min(y, lockLevel(x) - 9);
  return y;
};
const tgY = (x: number, z: number) => {
  if (z > DAM_Z0 && z < DAM_Z1) {
    if (x >= -10 && x <= 10) return CREST;
    if (x > 10 && x < 115) return Math.max(tgTerrain(x, z), CREST - 10 - ((x - 10) / 105) * 135);
  }
  return tgTerrain(x, z);
};

export const THREE_GORGES: SiteDef = {
  id: 'three-gorges',
  name: 'Three Gorges Dam',
  place: 'Sandouping, Yichang, Hubei',
  lat: 30.82,
  kind: 'Hydroelectric gravity dam',
  blurb: 'The largest power station on Earth: 22.5 GW from 32 Francis turbines, behind a concrete wall 2.3 km long and 181 m high on the Yangtze.',
  facts: [['Capacity', '22,500 MW'], ['Units', '32 × 700 MW + 2 × 50 MW'], ['Dam', '2,335 m long, 181 m high'], ['Reservoir', '175 m normal pool'], ['Ship lock', '5 steps, 113 m lift']],
  eras: [{ id: 'normal', label: 'Normal flow' }, { id: 'flood', label: 'Flood release' }],
  grid: { name: 'Central China grid', f0: 50, loadMW: 190000, H: 5, unitMW: 700, units: 26, kind: 'hydro', era: 'normal', largestOther: 6400 },
  focus: [60, 120, 0],
  cam: [2600, 700, 1500],
  spawn: [0, -60],
  extent: 4200,
  shadow: 1600,
  fog: 0.000055,
  wind: [4, 0.5],
  groundY: tgY,
  build(k) {
    k.terrain(14000, { grass: '#56693a', dry: '#7d7a4f', earth: '#7b6650' }, 300, 0, 0, tgTerrain);
    k.water(-4000, 0, 8000, 14000, 175, '#3b5552');
    k.water(4000, 0, 8000, 14000, 66, '#56624f');
    // the gravity section: near-vertical upstream face, 0.7 slope downstream
    const prof = new THREE.Shape([
      new THREE.Vector2(-10, 30), new THREE.Vector2(-10, CREST), new THREE.Vector2(10, CREST),
      new THREE.Vector2(10, CREST - 10), new THREE.Vector2(115, 30),
    ]);
    const L = DAM_Z1 - DAM_Z0;
    const dg = new THREE.ExtrudeGeometry(prof, { depth: L, bevelEnabled: false });
    dg.translate(0, 0, DAM_Z0);
    const uv = dg.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 40, uv.getY(i) / 40);
    k.mesh(dg, k.concrete('#c3beb2', 1, 61, 20));
    k.colliders.push({ x: -11, z: (DAM_Z0 + DAM_Z1) / 2, hw: 1, hd: L / 2, rot: 0 });
    // crest parapets and lamps
    const para = k.concrete('#d2cdc2', 10, 62);
    for (const s of [-1, 1]) k.mesh(new THREE.BoxGeometry(0.6, 1.2, L), para, s * 9.7, CREST + 0.6, (DAM_Z0 + DAM_Z1) / 2);
    for (let z = DAM_Z0 + 20; z < DAM_Z1; z += 40) k.lampPost(8.5, z, CREST, 8);
    k.barriers(-8, 1130, 8, 1130);
    for (let i = 0; i < 6; i++) k.prop('utility_box_02', 7.5, -400 + i * 160, -Math.PI / 2);
    // spillway: piers on the crest, outlets in the face
    const dark = k.plain('#151515', 1);
    for (let i = 0; i <= 22; i++) {
      const z = -240 + i * 21.9;
      k.box(0, z, 26, 7, 16, k.concrete('#cbc6ba', 12, 63), { y: CREST, parapet: false, collide: false });
      if (i < 22) {
        const zc = z + 11;
        for (const [y, x] of [[95, 10 + (CREST - 10 - 95) / 135 * 105], [140, 10 + (CREST - 10 - 140) / 135 * 105]] as const) {
          const o = k.mesh(new THREE.BoxGeometry(2, 9, 7), dark, x + 0.5, y, zc, undefined, false);
          o.rotation.z = Math.atan(105 / 135);
        }
        k.emitters.push({ pos: V(10 + (CREST - 10 - 95) / 135 * 105 + 3, 95, zc), radius: 3.5, rate: 1, kind: 'spray', tag: 'flood', dir: V(26, 9, 0) });
      }
    }
    for (let i = 0; i < 6; i++) k.emitters.push({ pos: V(190 + i * 30, 70, -200 + i * 80), radius: 70, rate: 1, kind: 'steam', tag: 'flood' });
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(500, 520), new THREE.MeshStandardMaterial({ color: '#d8dcd6', roughness: 0.9, transparent: true, opacity: 0.85 }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(330, 66.4, 0);
    k.era('flood').add(foam);
    k.era('normal');
    // powerhouses at the toe, penstocks down the face
    const steelPipe = k.plain('#59605c', 0.5, 0.6);
    for (const [z0, n] of [[-950, 14], [330, 12]] as const) {
      const len = n * 38;
      k.box(170, z0 + len / 2, 70, len, 80, k.win('#d8d4ca', { cols: 14, rows: 4, lit: 0.35, seed: 61 }), { y: 30, tile: 38 });
      k.box(230, z0 + len / 2, 40, len, 6, k.concrete('#b7b2a6', 20, 64), { y: 72 });
      for (let u = 0; u < n; u++) {
        const z = z0 + 19 + u * 38;
        // follow the downstream face, half buried in the backfill concrete
        cyl(k, V(21.7 + 3.2, 160 + 2.4, z), V(94.6 + 3.2, 66 + 2.4, z), 6.2, steelPipe);
        k.transformer(240, z, Math.PI / 2, 0.9);
      }
      k.line(new THREE.Vector2(240, z0 + len / 2), new THREE.Vector2(1400, z0 < 0 ? -2400 : 2400), 420, 60);
    }
    // gantry cranes riding the crest
    const red = k.plain('#b5372c', 0.6, 0.3);
    for (const z of [-760, -330, 360, 720]) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.strut(V(sx * 8, CREST, z + sz * 6), V(sx * 8, CREST + 34, z + sz * 6), 1.4, red, 'gantry');
      k.strut(V(-12, CREST + 34, z - 6), V(12, CREST + 34, z - 6), 2.2, red, 'gantry');
      k.strut(V(-12, CREST + 34, z + 6), V(12, CREST + 34, z + 6), 2.2, red, 'gantry');
      k.box(0, z, 10, 10, 5, red, { y: CREST + 36, parapet: false, collide: false });
      k.beacons.push(V(0, CREST + 42, z));
    }
    // five-step double ship lock on the north bank
    const lockC = k.concrete('#bdb8ac', 24, 66);
    for (let c = 0; c < 5; c++) {
      const x0 = -500 + c * 280 + 140;
      const lv = 175 - c * 22;
      for (const lane of [-1520, -1600]) k.water(x0, lane, 270, 34, lv, '#3f5652');
      for (const wz of [-1478, -1560, -1642]) k.box(x0, wz, 280, 10, lv + 12 - (lockLevel(x0) - 9), lockC, { y: lockLevel(x0) - 9, parapet: false });
      for (const lane of [-1520, -1600]) k.box(x0 - 140, lane, 6, 34, 30, k.steel('#6b5a40'), { y: lv - 12, parapet: false, collide: false });
      const hull = new THREE.BoxGeometry(90, 6, 14);
      hull.translate(0, 3, 0);
      k.instance('ship', hull, k.plain('#e7e4dc', 0.6, 0.2), new THREE.Matrix4().makeTranslation(x0 + 30, lv - 2, -1520));
      k.instance('cabin', new THREE.BoxGeometry(14, 8, 12), k.plain('#2d5a7a', 0.5, 0.3), new THREE.Matrix4().makeTranslation(x0 + 65, lv + 6, -1520));
    }
    // ship lift: a 3,000 t tank of water carried between four towers
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(sx * 70, -1290 + sz * 30, 30, 22, 160, k.concrete('#cbc6bb', 30, 67), { y: 50 });
    k.box(0, -1290, 120, 26, 10, k.steel('#7c8487'), { y: 120, collide: false, parapet: false });
    for (let i = 0; i < 8; i++) {
      const x = 600 + i * 340, z = -300 + ((i * 197) % 600);
      const hull = new THREE.BoxGeometry(70, 5, 13);
      hull.translate(0, 2.5, 0);
      k.instance('ship', hull, k.plain('#e7e4dc', 0.6, 0.2), new THREE.Matrix4().compose(V(x, 64.5, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 0.1), V(1, 1, 1)));
    }
    townBlocks(k, 2600, 2000, 36, 900, [6, 22]);
    const avoid = (x: number, z: number) => tgTerrain(x, z) < 190 && x < 0 || tgTerrain(x, z) < 72 || (z < -1350 && z > -1750 && x > -950 && x < 1250);
    k.trees(7000, [-6000, -6000, 6000, 6000], avoid, 'mixed', 71);
    return {
      steam: (tag, era) => (tag === 'flood' ? era === 'flood' : true),
      stops: [
        { title: 'Three Gorges', body: 'A concrete gravity dam across the Yangtze, finished in 2006, with the last unit commissioned in 2012. It holds back a reservoir 600 km long and generates more electricity than any other power station on Earth.', cam: [2800, 800, 1800], look: [60, 100, 0] },
        { title: 'On the crest', body: 'Walk mode starts you here, 185 m above sea level. The upstream face drops 110 m to the reservoir floor. Red gantry cranes travel the crest to lift intake gates and trash racks.', cam: [60, 205, -420], look: [0, 190, 200] },
        { title: 'Flood release', body: 'Switch to Flood release. The 483 m spillway has 23 deep outlets and 22 surface gates and can pass 100,000 m³/s. The jets land in a plunge pool far enough downstream that they cannot scour the dam’s foundation.', cam: [700, 160, 380], look: [100, 100, 0] },
        { title: 'Penstocks and powerhouses', body: 'Each 12.4 m steel penstock drops water to a 700 MW Francis turbine in a powerhouse at the toe of the dam: 14 on the left bank, 12 on the right, and 6 more underground.', cam: [520, 150, -1100], look: [140, 90, -700] },
        { title: 'Five-step ship lock', body: 'Two lanes of five chambers carry ships up 113 m in about four hours. The lock was blasted out of granite on the north bank, and the walls stand alone between the lanes.', cam: [400, 320, -2100], look: [200, 120, -1560] },
        { title: 'The ship lift', body: 'For smaller vessels, a 3,000 t tank of water rides up and down between four concrete towers. It was the largest ship lift in the world when it opened in 2016.', cam: [-320, 230, -1050], look: [0, 120, -1290] },
      ],
    };
  },
};
