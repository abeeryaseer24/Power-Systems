// Build reduced transmission models from OpenStreetMap.
//   node scripts/osm/build.mjs [regionId ...]
// Raw Overpass responses are cached in scripts/osm/.cache (not committed).
// Output: public/data/regions/<id>.json and public/data/regions/index.json
//
// Data © OpenStreetMap contributors, available under the Open Database Licence.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS, KV_LADDER } from './regions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, 'scripts/osm/.cache');
const OUT = path.join(ROOT, 'public/data/regions');
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// public Overpass instances; a request that fails moves on to the next one
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
let ep = Number(process.env.OVERPASS_START ?? 0) % ENDPOINTS.length;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Map layers are decoration: if Overpass cannot serve them, build without. LAYERS=cached skips any not in the cache. */
let layerOnly = false;
async function optional(fn) {
  layerOnly = process.env.LAYERS === 'cached';
  try {
    return await fn();
  } catch (e) {
    console.warn('  layer skipped:', e.message);
    return { elements: [] };
  }
}

async function overpass(key, query) {
  const cachedOnly = layerOnly;
  layerOnly = false;
  const file = path.join(CACHE, `${key}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (cachedOnly) throw new Error(`${key} not cached`);
  for (let attempt = 0; attempt < 9; attempt++) {
    const url = ENDPOINTS[ep];
    let status = 'network error';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'blackstart-grid-model/0.1', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      status = `HTTP ${res.status}`;
      if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
        const j = await res.json();
        fs.writeFileSync(file, JSON.stringify(j));
        await sleep(3000);
        return j;
      }
    } catch (e) {
      status = e.message;
    }
    console.warn(`  ${key}: ${status} from ${new URL(url).host}, trying the next server`);
    ep = (ep + 1) % ENDPOINTS.length;
    await sleep(5000 * (1 + Math.floor(attempt / ENDPOINTS.length)));
  }
  throw new Error(`overpass failed for ${key}`);
}

// ------------------------------------------------------------ geometry helpers

function projector(lat0, lon0) {
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  const kz = 110.57;
  return (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * kz];
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const dx = bx - ax;
    const dz = bz - az;
    const L = Math.hypot(dx, dz) || 1e-9;
    let mx = -1;
    let mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L;
      if (d > mx) {
        mx = d;
        mi = i;
      }
    }
    if (mx > tol) {
      keep[mi] = 1;
      stack.push([a, mi], [mi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const r2 = (v) => Math.round(v * 100) / 100;
const len = (pts) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

function parseKV(tag) {
  if (!tag) return 0;
  return Math.max(0, ...String(tag).split(/[;,]/).map((v) => Number(v) / 1000).filter((v) => Number.isFinite(v)));
}

function parseMW(tag) {
  if (!tag) return 0;
  const m = String(tag).match(/([\d.]+)\s*(gw|mw|kw|w)?/i);
  if (!m) return 0;
  const v = Number(m[1]);
  const u = (m[2] || 'mw').toLowerCase();
  return u === 'gw' ? v * 1000 : u === 'kw' ? v / 1000 : u === 'w' ? v / 1e6 : v;
}

const SOURCE = (s = '') => {
  s = s.toLowerCase();
  if (s.includes('nuclear')) return 'nuclear';
  if (s.includes('coal') || s.includes('lignite')) return 'coal';
  if (s.includes('gas')) return 'gas';
  if (s.includes('oil') || s.includes('diesel')) return 'oil';
  if (s.includes('hydro') || s.includes('water')) return 'hydro';
  if (s.includes('wind')) return 'wind';
  if (s.includes('solar')) return 'solar';
  if (s.includes('biomass') || s.includes('waste') || s.includes('biogas')) return 'bio';
  return 'gas';
};
const DEFAULT_MW = { nuclear: 1000, coal: 500, gas: 250, oil: 80, hydro: 80, wind: 0, solar: 0, bio: 30 };

// typical overhead line constants per circuit: ohm/km reactance, MVA thermal rating, uS/km charging
function lineConst(kv) {
  if (kv >= 700) return { x: 0.27, r: 0.012, b: 4.2, mva: 3000 };
  if (kv >= 480) return { x: 0.28, r: 0.018, b: 4.0, mva: 2000 };
  if (kv >= 370) return { x: 0.3, r: 0.025, b: 3.8, mva: 1500 };
  if (kv >= 320) return { x: 0.32, r: 0.03, b: 3.6, mva: 1000 };
  if (kv >= 270) return { x: 0.33, r: 0.035, b: 3.5, mva: 750 };
  if (kv >= 200) return { x: 0.4, r: 0.06, b: 2.9, mva: 400 };
  if (kv >= 180) return { x: 0.4, r: 0.07, b: 2.8, mva: 300 };
  if (kv >= 125) return { x: 0.4, r: 0.1, b: 2.8, mva: 150 };
  return { x: 0.4, r: 0.12, b: 2.7, mva: 110 };
}

// ------------------------------------------------------------ build

async function build(reg) {
  console.log(`\n== ${reg.id}`);
  const [s, w, n, e] = reg.bbox;
  const bb = `(${s},${w},${n},${e})`;
  const kvs = KV_LADDER.filter((k) => k >= reg.minKV).map((k) => `${k}000`).join('|');
  // national studies are clipped to the country border, city studies to their box
  const A = reg.area ? `area["ISO3166-1"="${reg.area}"]["admin_level"="2"]->.a;` : '';
  const F = reg.area ? '(area.a)' : bb;
  const tag = reg.area ? '-a' : '';
  const lines = await overpass(`${reg.id}-lines${tag}`, `[out:json][timeout:240];${A}way["power"~"^(line|cable)$"]["voltage"~"(^|;)(${kvs})($|;)"]${F};out tags geom qt;`);
  const subs = await overpass(`${reg.id}-subs${tag}`, `[out:json][timeout:240];${A}(node["power"="substation"]${F};way["power"="substation"]${F};relation["power"="substation"]${F};);out tags center qt;`);
  const plants = await overpass(`${reg.id}-plants${tag}`, `[out:json][timeout:240];${A}(node["power"="plant"]${F};way["power"="plant"]${F};relation["power"="plant"]${F};);out tags center qt;`);
  const places = await overpass(`${reg.id}-places2${tag}`, `[out:json][timeout:240];${A}node["place"~"^(city|town|suburb|village|quarter)$"]${F};out body qt;`);
  const roads = await optional(() => overpass(`${reg.id}-roads`, `[out:json][timeout:300];way["highway"~"^(${reg.roads})$"]${bb};out geom qt;`));
  const coast = await optional(() => overpass(`${reg.id}-coast`, `[out:json][timeout:300];way["natural"="coastline"]${bb};out geom qt;`));
  const rivers = reg.rivers ? await overpass(`${reg.id}-rivers`, `[out:json][timeout:300];way["waterway"="river"]["name"]${bb};out geom qt;`) : { elements: [] };

  const P = projector(reg.center[0], reg.center[1]);
  const inBox = (lat, lon) => lat >= s && lat <= n && lon >= w && lon <= e;
  // areas inside the box that belong to another synchronous system (e.g. France beside London)
  const excluded = (lat, lon) => (reg.exclude ?? []).some(([a, b, c, d]) => lat >= a && lat <= c && lon >= b && lon <= d);
  const [x0, z1] = P(s, w);
  const [x1, z0] = P(n, e);
  const extent = Math.max(x1 - x0, z1 - z0);
  const tol = extent / 1500;

  // substations
  const S = [];
  for (const el of subs.elements) {
    const c = el.center ?? el;
    if (c.lat === undefined || excluded(c.lat, c.lon)) continue;
    const [x, z] = P(c.lat, c.lon);
    S.push({ x, z, name: el.tags?.['name:en'] ?? el.tags?.name ?? '', kv: parseKV(el.tags?.voltage) });
  }

  // lines
  const L = [];
  for (const el of lines.elements) {
    if (!el.geometry || el.geometry.length < 2) continue;
    if (el.geometry.some((g) => excluded(g.lat, g.lon))) continue;
    const kv = parseKV(el.tags.voltage);
    if (kv < reg.minKV) continue;
    // HVDC links are not part of the AC network (they are modelled as the external link)
    if (el.tags.frequency === '0' || /hvdc|dc link/i.test(el.tags.name ?? '')) continue;
    const circuits = Number(el.tags.circuits) || (Number(el.tags.cables) ? Math.max(1, Math.round(Number(el.tags.cables) / 3)) : 1);
    const pts = el.geometry.map((g) => P(g.lat, g.lon));
    const a = el.geometry[0];
    const b = el.geometry[el.geometry.length - 1];
    L.push({ pts, kv, circuits: Math.min(4, circuits), outA: !inBox(a.lat, a.lon), outB: !inBox(b.lat, b.lon), name: el.tags.name ?? '' });
  }
  console.log(`  ${S.length} substations, ${L.length} line ways`);

  // nodes: snap endpoints to substations, else cluster junctions
  const nodes = [];
  const nodeAt = (x, z, out) => {
    let best = -1;
    let bd = 1.6;
    S.forEach((sub, i) => {
      const d = Math.hypot(sub.x - x, sub.z - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0) {
      let k = nodes.findIndex((nd) => nd.sub === best);
      if (k < 0) {
        k = nodes.length;
        nodes.push({ x: S[best].x, z: S[best].z, sub: best, name: S[best].name, out: false });
      }
      return k;
    }
    let k = nodes.findIndex((nd) => nd.sub === undefined && Math.hypot(nd.x - x, nd.z - z) < 0.5);
    if (k < 0) {
      k = nodes.length;
      nodes.push({ x, z, sub: undefined, name: '', out });
    } else if (out) nodes[k].out = true;
    return k;
  };
  let E = [];
  for (const l of L) {
    const a = nodeAt(l.pts[0][0], l.pts[0][1], l.outA);
    const b = nodeAt(l.pts[l.pts.length - 1][0], l.pts[l.pts.length - 1][1], l.outB);
    if (a === b) continue;
    E.push({ a, b, kv: l.kv, circuits: l.circuits, km: len(l.pts), pts: l.pts, name: l.name });
  }

  // merge chains through unnamed degree-2 junctions (line ways split mid-route)
  for (let pass = 0; pass < 6; pass++) {
    const deg = new Map();
    E.forEach((ed, i) => {
      for (const v of [ed.a, ed.b]) deg.set(v, [...(deg.get(v) ?? []), i]);
    });
    let merged = 0;
    const dead = new Set();
    for (const [v, list] of deg) {
      if (list.length !== 2 || nodes[v].sub !== undefined || nodes[v].out) continue;
      const [i, j] = list;
      if (dead.has(i) || dead.has(j)) continue;
      const A = E[i];
      const B = E[j];
      if (A.kv !== B.kv) continue;
      const ptsA = A.b === v ? A.pts : [...A.pts].reverse();
      const ptsB = B.a === v ? B.pts : [...B.pts].reverse();
      const from = A.b === v ? A.a : A.b;
      const to = B.a === v ? B.b : B.a;
      if (from === to) continue;
      E[i] = { a: from, b: to, kv: A.kv, circuits: Math.min(A.circuits, B.circuits), km: A.km + B.km, pts: [...ptsA, ...ptsB.slice(1)], name: A.name || B.name };
      dead.add(j);
      merged++;
    }
    E = E.filter((_, i) => !dead.has(i));
    if (!merged) break;
  }

  // parallel routes between the same pair become one branch with more circuits
  const byPair = new Map();
  for (const ed of E) {
    const k = ed.a < ed.b ? `${ed.a}-${ed.b}` : `${ed.b}-${ed.a}`;
    const p = byPair.get(k);
    if (!p) byPair.set(k, { ...ed });
    else if (p.kv === ed.kv) p.circuits = Math.min(8, p.circuits + ed.circuits);
    else if (ed.kv > p.kv) byPair.set(k, { ...ed, circuits: ed.circuits });
  }
  E = [...byPair.values()];

  // keep meaningful connected components
  const parent = nodes.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const ed of E) parent[find(ed.a)] = find(ed.b);
  const size = new Map();
  for (const ed of E) size.set(find(ed.a), (size.get(find(ed.a)) ?? 0) + 1);
  const big = Math.max(...size.values());
  const keepRoot = new Set([...size.entries()].filter(([, c]) => c >= Math.min(4, big)).map(([r]) => r));
  E = E.filter((ed) => keepRoot.has(find(ed.a)));
  const used = [...new Set(E.flatMap((ed) => [ed.a, ed.b]))];
  const remap = new Map(used.map((v, i) => [v, i]));
  const buses = used.map((v) => {
    const nd = nodes[v];
    const kv = Math.max(...E.filter((ed) => ed.a === v || ed.b === v).map((ed) => ed.kv));
    return { x: r2(nd.x), z: r2(nd.z), name: nd.name, kv, boundary: nd.out || undefined };
  });
  // name unnamed buses after the nearest named substation
  buses.forEach((b) => {
    if (b.name) return;
    let best = '';
    let bd = 6;
    for (const sub of S) {
      if (!sub.name) continue;
      const d = Math.hypot(sub.x - b.x, sub.z - b.z);
      if (d < bd) {
        bd = d;
        best = sub.name;
      }
    }
    b.name = best ? `${best} tee` : b.boundary ? 'Boundary' : 'Junction';
  });

  const branches = E.map((ed) => {
    const c = lineConst(ed.kv);
    const zb = (ed.kv * ed.kv) / 100;
    const km = Math.max(0.5, ed.km);
    const nc = ed.circuits;
    return {
      a: remap.get(ed.a), b: remap.get(ed.b), kv: ed.kv, circuits: nc, km: r2(km),
      x: +((c.x * km) / zb / nc).toFixed(5), r: +((c.r * km) / zb / nc).toFixed(5), bc: +((c.b * 1e-6 * km * zb) * nc).toFixed(5),
      mva: Math.round(c.mva * nc * (reg.ratingScale ?? 1)), name: ed.name || undefined,
      pts: simplify(ed.pts, tol).map(([x, z]) => [r2(x), r2(z)]),
    };
  });

  // known lines missing from OpenStreetMap, declared per region with their end points
  for (const L of reg.extraLines ?? []) {
    const near = ([la, lo]) => {
      const [x, z] = P(la, lo);
      return buses.reduce((bi, bb, i) => (Math.hypot(bb.x - x, bb.z - z) < Math.hypot(buses[bi].x - x, buses[bi].z - z) ? i : bi), 0);
    };
    const a = near(L.from);
    const b = near(L.to);
    const c = lineConst(L.kv);
    const zb = (L.kv * L.kv) / 100;
    const nc = L.circuits ?? 2;
    const km = Math.hypot(buses[a].x - buses[b].x, buses[a].z - buses[b].z) * 1.15;
    branches.push({
      a, b, kv: L.kv, circuits: nc, km: r2(km),
      x: +((c.x * km) / zb / nc).toFixed(5), r: +((c.r * km) / zb / nc).toFixed(5), bc: +((c.b * 1e-6 * km * zb) * nc).toFixed(5),
      mva: Math.round(c.mva * nc * (reg.ratingScale ?? 1)), name: L.name,
      pts: [[buses[a].x, buses[a].z], [buses[b].x, buses[b].z]],
    });
    console.log(`  added missing line ${L.name}: ${buses[a].name} - ${buses[b].name}, ${Math.round(km)} km`);
  }

  // plants
  const PL = [];
  for (const el of plants.elements) {
    const c = el.center ?? el;
    if (c.lat === undefined || !el.tags || excluded(c.lat, c.lon)) continue;
    const kind = SOURCE(el.tags['plant:source'] ?? el.tags['generator:source'] ?? el.tags.source);
    let mw = parseMW(el.tags['plant:output:electricity']);
    if (!mw) mw = DEFAULT_MW[kind];
    if (mw < 30) continue;
    const [x, z] = P(c.lat, c.lon);
    let best = -1;
    let bd = 30;
    buses.forEach((b, i) => {
      const d = Math.hypot(b.x - x, b.z - z) - b.kv / 400;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best < 0) continue;
    const pname = el.tags['name:en'] ?? el.tags.name ?? `${kind} plant`;
    const off = (reg.offline ?? []).some((o) => pname.toLowerCase().includes(o.toLowerCase())) || undefined;
    PL.push({ offline: off, name: pname, kind, mw: Math.round(mw), bus: best, x: r2(x), z: r2(z), est: !parseMW(el.tags['plant:output:electricity']) || undefined });
  }

  // estimated-capacity plants only fill in until installed capacity is plausible
  PL.sort((a, b) => (a.est ? 1 : 0) - (b.est ? 1 : 0) || b.mw - a.mw);
  let cap = 0;
  const PLk = [];
  for (const p of PL) {
    if (p.est && (cap > reg.demandMW * 1.45 || p.name.endsWith(' plant'))) continue;
    cap += p.mw;
    PLk.push(p);
  }
  PL.length = 0;
  PL.push(...PLk);

  // places → demand weights and city lights
  const DEF_POP = { city: 400000, town: 30000, suburb: 30000, quarter: 15000, village: 2500 };
  const PLC = [];
  for (const el of places.elements) {
    if (!el.tags || excluded(el.lat, el.lon)) continue;
    const pop = Number(String(el.tags.population ?? '').replace(/[^\d]/g, '')) || DEF_POP[el.tags.place] || 2000;
    const [x, z] = P(el.lat, el.lon);
    PLC.push({ x: r2(x), z: r2(z), pop, name: el.tags.place === 'city' || el.tags.place === 'town' ? el.tags['name:en'] ?? el.tags.name : undefined, t: el.tags.place[0] });
  }
  PLC.sort((a, b) => b.pop - a.pop);
  const placesKept = PLC.slice(0, 2500);
  const load = new Array(buses.length).fill(0);
  // each settlement draws from its three nearest substations (inverse-square weights)
  for (const p of PLC) {
    const near = buses.map((b, i) => ({ i, d: Math.hypot(b.x - p.x, b.z - p.z) })).filter((x) => x.d < 60).sort((x, y) => x.d - y.d).slice(0, 3);
    const w = near.map((x) => 1 / Math.max(1, x.d) ** 2);
    const tw = w.reduce((a, v) => a + v, 0);
    near.forEach((x, k) => (load[x.i] += (p.pop * w[k]) / tw));
  }
  let totW = load.reduce((a, v) => a + v, 0) || 1;
  // no substation may carry more than its lines can deliver: spill the excess to neighbours
  // regions where settlement counts overstate demand get a correction: [south, west, north, east, factor]
  for (const [s0, w0, n0, e0, f] of reg.loadAreas ?? []) {
    const [xa, za] = P(s0, w0);
    const [xb, zb] = P(n0, e0);
    buses.forEach((bb, i) => {
      if (bb.x >= Math.min(xa, xb) && bb.x <= Math.max(xa, xb) && bb.z >= Math.min(za, zb) && bb.z <= Math.max(za, zb)) load[i] *= f;
    });
  }
  const busCap = buses.map((_, i) => (0.45 / (reg.ratingScale ?? 1)) * branches.filter((br) => br.a === i || br.b === i).reduce((a, br) => a + br.mva, 0));
  for (let pass = 0; pass < 8; pass++) {
    let moved = 0;
    for (let i = 0; i < buses.length; i++) {
      const mw = (reg.demandMW * load[i]) / totW;
      if (mw <= busCap[i]) continue;
      const excess = ((mw - busCap[i]) * totW) / reg.demandMW;
      const nb = branches.filter((br) => br.a === i || br.b === i).map((br) => (br.a === i ? br.b : br.a));
      if (!nb.length) continue;
      load[i] -= excess;
      nb.forEach((j) => (load[j] += excess / nb.length));
      moved++;
    }
    if (!moved) break;
  }
  totW = load.reduce((a, v) => a + v, 0) || 1;
  buses.forEach((b, i) => (b.load = Math.round((reg.demandMW * load[i]) / totW)));

  // map layers
  const poly = (els, t) => els.filter((x) => x.geometry).map((x) => simplify(x.geometry.map((g) => P(g.lat, g.lon)), t).map(([a, b]) => [r2(a), r2(b)])).filter((p) => p.length > 1);
  const roadsOut = poly(roads.elements, tol * 2);
  const coastOut = poly(coast.elements, tol * 1.5);
  const riversOut = poly(rivers.elements, tol * 2).filter((p) => len(p) > extent / 40);

  let extBus;
  if (reg.ext.at) {
    const [ex, ez] = P(reg.ext.at[0], reg.ext.at[1]);
    let bd = Infinity;
    buses.forEach((b, i) => {
      const d = Math.hypot(b.x - ex, b.z - ez);
      if (d < bd) {
        bd = d;
        extBus = i;
      }
    });
  }
  // explicit interconnection points: nearest boundary bus to each
  let tieBuses;
  if (reg.ext.ties) {
    tieBuses = reg.ext.ties.map(([la, lo]) => {
      const [tx, tz] = P(la, lo);
      let best = -1;
      let bd = Infinity;
      buses.forEach((b, i) => {
        if (!b.boundary) return;
        const d = Math.hypot(b.x - tx, b.z - tz);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    }).filter((i) => i >= 0);
  }
  const out = {
    id: reg.id, city: reg.city, country: reg.country, scope: reg.scope, freq: reg.freq,
    center: reg.center, bbox: reg.bbox, extent: r2(extent), bounds: [r2(x0), r2(z0), r2(x1), r2(z1)],
    seriesComp: reg.seriesComp, mustRun: reg.mustRun, acShare: reg.acShare,
    demandMW: reg.demandMW, ext: { ...reg.ext, at: undefined, ties: undefined, bus: extBus, tieBuses },
    buses, branches, plants: PL, places: placesKept, roads: roadsOut, coast: coastOut, rivers: riversOut,
    source: 'OpenStreetMap contributors, ODbL',
    built: new Date().toISOString().slice(0, 10),
  };
  const file = path.join(OUT, `${reg.id}.json`);
  fs.writeFileSync(file, JSON.stringify(out));
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`  -> ${buses.length} buses, ${branches.length} branches, ${PL.length} plants (${Math.round(PL.reduce((a, p) => a + p.mw, 0))} MW), ${placesKept.length} places, ${roadsOut.length} roads, ${coastOut.length} coast, ${riversOut.length} rivers, ${kb} KB`);
  return { id: reg.id, city: reg.city, country: reg.country, scope: reg.scope, freq: reg.freq, center: reg.center, buses: buses.length, branches: branches.length, plants: PL.length, genMW: Math.round(PL.reduce((a, p) => a + p.mw, 0)), demandMW: reg.demandMW };
}

const want = process.argv.slice(2);
const list = want.length ? REGIONS.filter((r) => want.includes(r.id)) : REGIONS;
const summary = [];
for (const r of list) {
  try {
    summary.push(await build(r));
  } catch (err) {
    console.error(`  ${r.id} failed:`, err.message);
  }
}
const idxFile = path.join(OUT, 'index.json');
const prev = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, 'utf8')) : [];
const merged = REGIONS.map((r) => summary.find((s) => s.id === r.id) ?? prev.find((p) => p.id === r.id)).filter(Boolean);
fs.writeFileSync(idxFile, JSON.stringify(merged, null, 1));
