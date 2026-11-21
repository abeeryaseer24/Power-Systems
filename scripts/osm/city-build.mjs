// Build a real city's model data from the cached OpenStreetMap layers.
//   node scripts/osm/city-build.mjs dhaka
// Output: public/data/cities/<id>.json + <id>.bin, and public/data/cities/index.json
//
// What comes from where:
//   buildings, heights, land use, streets, water, metro line + stations, substations: OpenStreetMap
//   population: the official count in cities.mjs, spread over residential floor area
//   substation service areas: nearest 132/33 kV substation (a Voronoi split, not real feeder maps)
// Data © OpenStreetMap contributors, ODbL.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITIES } from './cities.mjs';
import { tilesOf } from './city-fetch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, 'scripts/osm/.cache');
const OUT = path.join(ROOT, 'public/data/cities');
fs.mkdirSync(OUT, { recursive: true });
// DRY=1 builds from whatever is cached so far (missing building tiles are skipped) to test the pipeline
const DRY = !!process.env.DRY;
const read = (k) => {
  const f = path.join(CACHE, `${k}.json`);
  if (DRY && !fs.existsSync(f) && k.includes('-bld-')) return { elements: [] };
  return JSON.parse(fs.readFileSync(f, 'utf8'));
};

const MAX_BUILDINGS = 140_000;

function projector(lat0, lon0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), kz = 110570;
  return (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * kz];
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    const [ax, az] = pts[a], [bx, bz] = pts[b];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const area = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length]; s += x0 * z1 - x1 * z0; } return Math.abs(s) / 2; };

function inPoly(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** Join way members of a route relation into one continuous polyline. */
function chain(ways) {
  const segs = ways.map((w) => w.slice());
  if (!segs.length) return [];
  let line = segs.shift();
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 30;
  let guard = 0;
  while (segs.length && guard++ < 5000) {
    const head = line[0], tail = line[line.length - 1];
    let k = segs.findIndex((s) => close(s[0], tail) || close(s[s.length - 1], tail) || close(s[0], head) || close(s[s.length - 1], head));
    if (k < 0) {
      // jump to the nearest remaining piece (gaps at stations in the data)
      let bd = Infinity;
      segs.forEach((s, i) => { const d = Math.min(Math.hypot(s[0][0] - tail[0], s[0][1] - tail[1]), Math.hypot(s[s.length - 1][0] - tail[0], s[s.length - 1][1] - tail[1])); if (d < bd) { bd = d; k = i; } });
      if (bd > 600) break;
    }
    const s = segs.splice(k, 1)[0];
    if (close(s[0], tail) || Math.hypot(s[0][0] - tail[0], s[0][1] - tail[1]) < 600 && !close(s[s.length - 1], tail) && !close(s[0], head) && !close(s[s.length - 1], head)) line = line.concat(s.slice(1));
    else if (close(s[s.length - 1], tail)) line = line.concat(s.reverse().slice(1));
    else if (close(s[s.length - 1], head)) line = s.concat(line.slice(1));
    else if (close(s[0], head)) line = s.reverse().concat(line.slice(1));
    else line = line.concat(s);
  }
  return line;
}

function chainageOf(path, x, z) {
  let best = Infinity, bs = 0, acc = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L2 || 1)));
    const d = Math.hypot(x - ax - t * dx, z - az - t * dz);
    if (d < best) { best = d; bs = acc + t * L; }
    acc += L;
  }
  return { s: bs, d: best };
}

const KIND = { res: 0, com: 1, ind: 2, inst: 3 };
const COM = /^(commercial|retail|office|hotel|supermarket|kiosk|shop|mall|bank)$/;
const IND = /^(industrial|warehouse|factory|manufacture|garage|garages|hangar|storage_tank|service)$/;
const INST = /^(hospital|university|college|school|public|government|civic|train_station|transportation|mosque|temple|church|religious|stadium|clinic|kindergarten)$/;

function build(c) {
  const P = projector(c.center[0], c.center[1]);
  const [s, w, n, e] = c.bbox;
  const [x0, z1] = P(s, w), [x1, z0] = P(n, e);
  const bounds = [Math.round(x0), Math.round(z0), Math.round(x1), Math.round(z1)];
  const geo = (g) => g.map((p) => P(p.lat, p.lon));

  // ---------------- substations: 132 kV and above with a name become service areas
  const subsRaw = read(`city-${c.id}-subs`).elements;
  const subs = [];
  for (const el of subsRaw) {
    const t = el.tags ?? {};
    const v = (t.voltage ?? '').split(/[;,]/).map(Number).filter(Boolean);
    const name = t['name:en'] ?? t.name;
    const hv = v.some((x) => x >= 132000) || /132|230|grid/i.test(name ?? '');
    if (!hv || !name) continue;
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null) continue;
    const [x, z] = P(lat, lon);
    if (subs.some((q) => Math.hypot(q.x - x, q.z - z) < 400)) continue; // the same yard mapped twice
    const clean = name.replace(/\s*(132|230)\s*\/\s*33\s*kV?/i, '').replace(/\s*(grid\s*)?(sub\s*-?station|grid station|s\/s)\s*$/i, '').trim();
    subs.push({ id: `s${subs.length}`, name: `${clean} ${v.some((x) => x >= 230000) ? '230/132/33' : '132/33'} kV`, short: clean, x: Math.round(x), z: Math.round(z) });
  }
  console.log(`  substations: ${subs.length}`);
  if (subs.length > 64) subs.length = 64;
  const nearestSub = (x, z) => { let b = 0, bd = Infinity; subs.forEach((q, i) => { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };

  // ---------------- land use raster (25 m) for classifying untagged buildings
  const LU = 25, lnx = Math.ceil((x1 - x0) / LU), lnz = Math.ceil((z1 - z0) / LU);
  const lu = new Uint8Array(lnx * lnz); // 0 none, 1 com, 2 ind, 3 inst, 4 green
  const areas = [];
  for (const el of read(`city-${c.id}-landuse`).elements) {
    if (!el.geometry) continue;
    const t = el.tags ?? {};
    const code = /commercial|retail/.test(t.landuse) ? 1 : /industrial|railway/.test(t.landuse) ? 2 : t.amenity || t.landuse === 'military' ? 3 : 4;
    const pts = geo(el.geometry);
    if (pts.length < 4) continue;
    const a = area(pts);
    if (a < 2500) continue;
    const kind = ['', 'commercial', 'industrial', 'institution', 'park'][code];
    areas.push({ kind, pts: simplify(pts, 6).map(([x, z]) => [Math.round(x), Math.round(z)]) });
    let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (const [x, z] of pts) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mnz = Math.min(mnz, z); mxz = Math.max(mxz, z); }
    for (let j = Math.max(0, Math.floor((mnz - z0) / LU)); j <= Math.min(lnz - 1, Math.floor((mxz - z0) / LU)); j++)
      for (let i = Math.max(0, Math.floor((mnx - x0) / LU)); i <= Math.min(lnx - 1, Math.floor((mxx - x0) / LU)); i++)
        if (inPoly(x0 + (i + 0.5) * LU, z0 + (j + 0.5) * LU, pts)) lu[j * lnx + i] = code;
  }

  // ---------------- water
  const water = [];
  for (const el of read(`city-${c.id}-water`).elements) {
    const rings = el.type === 'way' ? (el.geometry ? [el.geometry] : []) : (el.members ?? []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry);
    if (el.type === 'relation') {
      // multipolygon outers come in pieces: join them into rings
      const pieces = rings.map(geo);
      const joined = chain(pieces);
      if (joined.length > 3) water.push(joined);
    } else for (const r of rings) water.push(geo(r));
  }
  for (const p of water) {
    if (p.length < 4 || area(p) < 1500) continue;
    areas.push({ kind: 'water', pts: simplify(p, 5).map(([x, z]) => [Math.round(x), Math.round(z)]) });
  }

  // ---------------- buildings
  const raw = [];
  for (const t of tilesOf(c)) {
    for (const el of read(`city-${c.id}-bld-${t.key}`).elements) {
      let pts, a;
      if (el.geometry && el.geometry.length >= 4) { pts = geo(el.geometry); a = area(pts); }
      else if (el.bounds) {
        // bounding boxes only (the light download for very large cities): footprint ~ 75 % of the box
        const [bx0, bz1] = P(el.bounds.minlat, el.bounds.minlon), [bx1, bz0] = P(el.bounds.maxlat, el.bounds.maxlon);
        pts = [[bx0, bz0], [bx1, bz0], [bx1, bz1], [bx0, bz1]];
        a = Math.abs((bx1 - bx0) * (bz1 - bz0)) * 0.75;
      } else continue;
      if (a < 20 || a > 200000) continue;
      let cx = 0, cz = 0;
      for (const [x, z] of pts) { cx += x; cz += z; }
      cx /= pts.length; cz /= pts.length;
      if (cx < x0 || cx > x1 || cz < z0 || cz > z1) continue;
      // principal axis for an oriented box with the same area
      let sxx = 0, szz = 0, sxz = 0;
      for (const [x, z] of pts) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
      const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      let mu = Infinity, Mu = -Infinity, mv = Infinity, Mv = -Infinity;
      for (const [x, z] of pts) { const u = (x - cx) * ca + (z - cz) * sa, v = -(x - cx) * sa + (z - cz) * ca; mu = Math.min(mu, u); Mu = Math.max(Mu, u); mv = Math.min(mv, v); Mv = Math.max(Mv, v); }
      const k = el.bounds && !el.geometry ? Math.sqrt(0.75) : Math.sqrt(a / Math.max(1, (Mu - mu) * (Mv - mv)));
      const tg = el.tags ?? {};
      let levels = parseFloat(tg['building:levels']);
      const hgt = parseFloat(tg.height);
      const b = tg.building ?? 'yes';
      let kind = COM.test(b) ? 'com' : IND.test(b) ? 'ind' : INST.test(b) || tg.amenity === 'hospital' ? 'inst' : /^(apartments|residential|house|detached|terrace|dormitory|semidetached_house|hut|bungalow)$/.test(b) ? 'res' : null;
      if (!kind) {
        const li = Math.floor((cx - x0) / LU), lj = Math.floor((cz - z0) / LU);
        const code = lu[lj * lnx + li] ?? 0;
        kind = code === 1 ? 'com' : code === 2 ? 'ind' : code === 3 ? 'inst' : 'res';
      }
      raw.push({ x: cx, z: cz, w: (Mu - mu) * k, d: (Mv - mv) * k, rot: -ang, a, kind, levels: Number.isFinite(levels) ? Math.min(60, Math.max(1, levels)) : Number.isFinite(hgt) ? Math.max(1, hgt / 3.2) : null });
    }
  }
  console.log(`  buildings in OSM: ${raw.length}, with storeys: ${raw.filter((b) => b.levels != null).length}`);

  // storeys for untagged buildings: the mean of tagged neighbours in a 300 m cell (or the next ring out)
  const HC = 300, hnx = Math.ceil((x1 - x0) / HC), hnz = Math.ceil((z1 - z0) / HC);
  const hs = new Float64Array(hnx * hnz), hn = new Float64Array(hnx * hnz);
  for (const b of raw) if (b.levels != null && b.a > 60) { const i = Math.floor((b.x - x0) / HC) + hnx * Math.floor((b.z - z0) / HC); hs[i] += b.levels; hn[i]++; }
  const meanAt = (x, z) => {
    const ci = Math.floor((x - x0) / HC), cj = Math.floor((z - z0) / HC);
    for (let r = 0; r <= 2; r++) {
      let s2 = 0, n2 = 0;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) { if (i < 0 || j < 0 || i >= hnx || j >= hnz) continue; s2 += hs[j * hnx + i]; n2 += hn[j * hnx + i]; }
      if (n2 >= 4) return s2 / n2;
    }
    return null;
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const b of raw) {
    if (b.levels == null) {
      const m = meanAt(b.x, b.z);
      // small footprints are mostly one- or two-storey (tin-roofed or semi-pucca)
      b.levels = b.a < 60 ? 1 + Math.round(rnd()) : b.kind === 'ind' ? 2 : Math.max(1, Math.round((m ?? (b.a < 150 ? 3 : 6)) + (rnd() - 0.5) * 2));
      b.imputed = true;
    }
    b.h = b.kind === 'ind' && b.imputed ? 8 + rnd() * 6 : b.levels * 3.2 + 0.8;
    b.floor = b.a * b.levels;
    b.district = nearestSub(b.x, b.z);
  }

  // ---------------- district totals (before trimming the small buildings from the 3D)
  const D = subs.map(() => ({ resF: 0, comF: 0, indF: 0, instF: 0, km: 0, n: 0, sx: 0, sz: 0 }));
  for (const b of raw) {
    const d = D[b.district];
    d[b.kind + 'F'] += b.floor;
    d.n++; d.sx += b.x; d.sz += b.z;
  }
  // mixed use: shops and offices on the lower floors of residential blocks (assumption)
  const MIXED = 0.12;
  const resTotal = D.reduce((a, d) => a + d.resF * (1 - MIXED), 0);

  // ---------------- streets
  const streets = [];
  for (const el of read(`city-${c.id}-roads`).elements) {
    if (!el.geometry) continue;
    const major = /^(motorway|trunk|primary|secondary)/.test(el.tags?.highway ?? '');
    const pts = simplify(geo(el.geometry), major ? 4 : 6);
    if (pts.length < 2) continue;
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const mid = pts[Math.floor(pts.length / 2)];
    if (subs.length) D[nearestSub(mid[0], mid[1])].km += L / 1000;
    for (let i = 0; i < pts.length; i += 32000) streets.push({ pts: pts.slice(i, i + 32001), major });
  }

  // ---------------- metro: the longest few lines, one route relation per line (both directions share it)
  const lines = [];
  if (c.metro) {
    const metroEls = read(`city-${c.id}-metro`).elements;
    const stopsById = new Map(metroEls.filter((x) => x.type === 'node').map((x) => [x.id, x]));
    const groups = new Map();
    for (const r of metroEls.filter((x) => x.type === 'relation')) {
      const t = r.tags ?? {};
      const key = (t.ref ?? t['name:en'] ?? t.name ?? String(r.id)).replace(/\s*[:(].*$/, '').trim();
      const ways = (r.members ?? []).filter((m) => m.type === 'way' && m.geometry && (m.role === '' || m.role === 'route'));
      let len = 0;
      for (const w of ways) for (let i = 1; i < w.geometry.length; i++) { const [ax, az] = P(w.geometry[i - 1].lat, w.geometry[i - 1].lon), [bx, bz] = P(w.geometry[i].lat, w.geometry[i].lon); len += Math.hypot(bx - ax, bz - az); }
      if (!groups.has(key) || groups.get(key).len < len) groups.set(key, { r, len, key });
    }
    const chosen = [...groups.values()].sort((p, q) => q.len - p.len).slice(0, c.metro.maxLines ?? 1);
    chosen.forEach(({ r, key }, li) => {
      const ways = (r.members ?? []).filter((m) => m.type === 'way' && m.geometry && (m.role === '' || m.role === 'route')).map((m) => geo(m.geometry));
      let pathLine = simplify(chain(ways), 8);
      const stops = [];
      for (const m of r.members ?? []) {
        if (m.type !== 'node' || !/stop/.test(m.role)) continue;
        const nd = stopsById.get(m.ref);
        const lat = nd?.lat ?? m.lat, lon = nd?.lon ?? m.lon;
        if (lat == null) continue;
        const [x, z] = P(lat, lon);
        const nm = (nd?.tags?.['name:en'] ?? nd?.tags?.name ?? `Stop ${stops.length + 1}`).replace(/\s*(metro|mrt|underground|subway)?\s*station\s*$/i, '').trim();
        const { s: ch, d } = chainageOf(pathLine, x, z);
        if (d < 300 && !stops.some((q) => q.name === nm || Math.abs(q.s - ch) < 250)) stops.push({ name: nm, s: Math.round(ch) });
      }
      stops.sort((p, q) => p.s - q.s);
      if (stops.length < 3) return;
      // trim the line to its first and last station (depot spurs and tails beyond)
      const s0 = stops[0].s, s1 = stops[stops.length - 1].s;
      const at = (sv) => { let a2 = 0; for (let i = 1; i < pathLine.length; i++) { const [ax, az] = pathLine[i - 1], [bx, bz] = pathLine[i]; const l = Math.hypot(bx - ax, bz - az); if (a2 + l >= sv) { const t = (sv - a2) / l; return [ax + (bx - ax) * t, az + (bz - az) * t]; } a2 += l; } return pathLine[pathLine.length - 1]; };
      const cut = [at(s0)];
      let acc = 0;
      for (let i = 1; i < pathLine.length; i++) { acc += Math.hypot(pathLine[i][0] - pathLine[i - 1][0], pathLine[i][1] - pathLine[i - 1][1]); if (acc > s0 && acc < s1) cut.push(pathLine[i]); }
      cut.push(at(s1));
      pathLine = cut;
      stops.forEach((q) => { q.s -= s0; });
      console.log(`  metro ${key}: ${((s1 - s0) / 1000).toFixed(1)} km, ${stops.length} stations`);
      // traction substations: every second station, positions modelled (not mapped in OSM)
      const tss = stops.filter((_, i) => i % 2 === 0 || i === stops.length - 1).map((q) => ({ name: `${q.name} TSS`, s: q.s, sub: '', modelled: true }));
      const line = { id: `l${li + 1}`, name: c.metro.lineName ? c.metro.lineName(key) : (r.tags?.['name:en'] ?? r.tags?.name ?? key).replace(/\s*[:(].*$/, ''), colour: r.tags?.colour ?? ['#ffb04d', '#86c5da', '#c9b8ff'][li % 3], path: pathLine.map(([x, z]) => [Math.round(x), Math.round(z)]), stations: stops, tss };
      for (const t of line.tss) {
        const pt = at(t.s + s0);
        t.sub = subs[nearestSub(pt[0], pt[1])].id;
      }
      lines.push(line);
    });
  }

  // ---------------- the city's biggest mapped hospital (for the hospital and blackout models)
  let hospital = null;
  {
    const cands = read(`city-${c.id}-landuse`).elements.filter((el) => el.tags?.amenity === 'hospital' && el.geometry && (el.tags['name:en'] || el.tags.name));
    let best = null;
    for (const el of cands) {
      const pts = geo(el.geometry);
      if (pts.length < 4) continue;
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (const [x, z] of pts) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mnz = Math.min(mnz, z); mxz = Math.max(mxz, z); }
      // floor area of the buildings inside the hospital grounds
      let floor = 0;
      for (const b of raw) if (b.x > mnx && b.x < mxx && b.z > mnz && b.z < mxz && inPoly(b.x, b.z, pts)) floor += b.floor;
      const nm = el.tags['name:en'] ?? el.tags.name;
      // a config override names the city's main hospital and its sourced bed count
      if (c.hospital && nm.toLowerCase().includes(c.hospital.name.toLowerCase())) { best = { el, pts, beds: c.hospital.beds, floor, tagged: true, override: true, cx: (mnx + mxx) / 2, cz: (mnz + mxz) / 2 }; break; }
      const tagged = parseInt(el.tags.beds, 10);
      const beds = Number.isFinite(tagged) && tagged > 20 ? tagged : Math.round(floor / 160);
      if (beds < 80) continue;
      if (best?.override) continue;
      if (!best || beds > best.beds) best = { el, pts, beds, floor, tagged: Number.isFinite(tagged) && tagged > 20, cx: (mnx + mxx) / 2, cz: (mnz + mxz) / 2 };
    }
    if (best) {
      const hot = c.climate.summer.tmax > 30;
      const kwBed = hot ? 5 : 4; // peak kW per bed, cooling-heavy in hot climates
      const name = best.el.tags['name:en'] ?? best.el.tags.name;
      hospital = {
        name, beds: Math.min(4000, best.beds), peakMW: +((Math.min(4000, best.beds) * kwBed) / 1000).toFixed(1),
        district: subs[nearestSub(best.cx, best.cz)].id, x: Math.round(best.cx), z: Math.round(best.cz),
        source: best.override
          ? `${name}: ${best.beds} beds (${c.hospital.source}); location from OpenStreetMap; peak load estimated at ${kwBed} kW per bed.`
          : best.tagged
          ? `${name}: ${best.beds} beds as tagged in OpenStreetMap; peak load estimated at ${kwBed} kW per bed.`
          : `${name}: the largest hospital mapped in OpenStreetMap here. About ${Math.round(best.beds)} beds estimated from ${Math.round(best.floor / 1000)}k m² of floor space (160 m² per bed); peak load estimated at ${kwBed} kW per bed.`,
      };
      console.log(`  hospital: ${name}, ${hospital.beds} beds, ${hospital.peakMW} MW`);
    }
  }

  // ---------------- districts
  const districts = subs.map((q, i) => {
    const d = D[i];
    const pop = Math.round((c.population * (d.resF * (1 - MIXED))) / Math.max(1, resTotal));
    return {
      id: q.id, name: q.short, pop,
      comM2: Math.round(d.comF + d.resF * MIXED),
      indMW: +((d.indF * 45) / 1e6).toFixed(1), // 45 W/m² of industrial floor
      instMW: +((d.instF * 30) / 1e6).toFixed(1), // 30 W/m² hospitals, campuses, offices of state
      streetKm: +(d.km * 0.75).toFixed(1),
      sub: q.id,
      cx: Math.round(d.n ? d.sx / d.n : q.x), cz: Math.round(d.n ? d.sz / d.n : q.z),
    };
  });

  // ---------------- 3D buildings: the largest floor areas, capped for the browser
  raw.sort((a, b) => b.floor - a.floor);
  const keep = raw.slice(0, MAX_BUILDINGS);
  console.log(`  buildings drawn: ${keep.length} (${((100 * keep.reduce((a, b) => a + b.floor, 0)) / raw.reduce((a, b) => a + b.floor, 0)).toFixed(0)} % of floor area)`);

  // ---------------- district raster: built-up cells, coloured by service area
  const CELL = 50, nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL);
  const built = new Uint8Array(nx * nz);
  for (const b of raw) { const i = Math.floor((b.x - x0) / CELL), j = Math.floor((b.z - z0) / CELL); if (i >= 0 && j >= 0 && i < nx && j < nz) built[j * nx + i] = 1; }
  const cells = new Uint8Array(nx * nz).fill(255);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    let any = 0;
    for (let dj = -1; dj <= 1 && !any; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && built[jj * nx + ii]) { any = 1; break; } }
    if (any) cells[j * nx + i] = nearestSub(x0 + (i + 0.5) * CELL, z0 + (j + 0.5) * CELL);
  }

  // ---------------- binary
  let size = keep.length * 14 + nx * nz;
  for (const st of streets) size += 2 + st.pts.length * 4;
  const buf = Buffer.alloc(size);
  let o = 0;
  const q16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));
  for (const b of keep) {
    buf.writeInt16LE(q16(b.x / 2), o); buf.writeInt16LE(q16(b.z / 2), o + 2);
    buf.writeUInt16LE(Math.min(65535, Math.round(b.w * 4)), o + 4); buf.writeUInt16LE(Math.min(65535, Math.round(b.d * 4)), o + 6); buf.writeUInt16LE(Math.min(65535, Math.round(b.h * 4)), o + 8);
    let r = b.rot % Math.PI; if (r > Math.PI / 2) r -= Math.PI; if (r < -Math.PI / 2) r += Math.PI;
    buf.writeInt8(Math.round((r * 127) / Math.PI), o + 10); buf.writeUInt8(b.district, o + 11); buf.writeUInt8(KIND[b.kind], o + 12);
    o += 14;
  }
  for (const st of streets) {
    buf.writeUInt16LE(st.pts.length | (st.major ? 0x8000 : 0), o); o += 2;
    for (const [x, z] of st.pts) { buf.writeInt16LE(q16(x / 2), o); buf.writeInt16LE(q16(z / 2), o + 2); o += 4; }
  }
  Buffer.from(cells).copy(buf, o);

  // camera: whole city from the south-east; metro close-up over the middle of the line
  const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2, span = Math.max(x1 - x0, z1 - z0);
  let metroView = [cxm + 900, 420, czm + 900, cxm, 0, czm];
  if (lines[0]) {
    const st = lines[0].stations[Math.floor(lines[0].stations.length / 2)];
    let acc3 = 0, pt = lines[0].path[0];
    for (let i = 1; i < lines[0].path.length; i++) { const l = Math.hypot(lines[0].path[i][0] - lines[0].path[i - 1][0], lines[0].path[i][1] - lines[0].path[i - 1][1]); if (acc3 + l >= st.s) { pt = lines[0].path[i]; break; } acc3 += l; }
    metroView = [pt[0] + 700, 380, pt[1] + 700, pt[0], 0, pt[1]];
  }
  const meta = {
    id: c.id, name: c.name, country: c.country, kind: 'real', lat: c.center[0], bounds,
    population: c.population,
    notes: [
      `Buildings, storeys, land use, streets, water, ${c.metro ? 'metro lines and stations, ' : ''}and the substations come from OpenStreetMap (© OpenStreetMap contributors, ODbL).`,
      `Population: ${c.populationSource}, spread over residential floor area.`,
      `${Math.round((100 * raw.filter((b) => b.imputed).length) / raw.length)} % of buildings have no storey count in OpenStreetMap; theirs is estimated from tagged neighbours.`,
      `Service areas are split by nearest grid substation, not from real feeder maps. Only ${subs.length} grid substations inside the city are mapped in OpenStreetMap (the real network has many more), so each area is large.`,
      ...(c.metro ? ['Traction substation positions on the metro are modelled; they are not mapped in OpenStreetMap.'] : []),
      ...(c.extraNotes ?? []),
      c.peakSource,
    ],
    climate: c.climate,
    demand: c.demand,
    metro: c.metro ? { voltage: c.metro.voltage, E: c.metro.E ?? Math.round(c.metro.voltage * 1.1), capacity: c.metro.capacity, vmax: c.metro.vmax, peakHeadway: c.metro.peakHeadway, tssRating: c.metro.tssRating ?? 5, service: c.metro.service, peaks: c.metro.peaks, offpeak: c.metro.offpeak, interchange: c.metro.interchange } : { voltage: 1500, E: 1650, capacity: 1000, vmax: 20, peakHeadway: 300, tssRating: 5 },
    districts,
    hospital,
    subs: subs.map(({ short, ...q }) => q),
    lines,
    areas,
    ground: c.ground ?? '#7a7a5c',
    view: { city: [cxm + span * 0.28, span * 0.24, czm + span * 0.52, cxm, 0, czm], metro: metroView },
    counts: { buildings: keep.length, streets: streets.length },
    cells: { nx, nz },
  };
  fs.writeFileSync(path.join(OUT, `${c.id}.json`), JSON.stringify(meta));
  fs.writeFileSync(path.join(OUT, `${c.id}.bin`), buf);
  console.log(`  wrote ${c.id}.json (${(JSON.stringify(meta).length / 1e6).toFixed(2)} MB) and ${c.id}.bin (${(buf.length / 1e6).toFixed(2)} MB)`);
  return { id: c.id, name: c.name, country: c.country, kind: 'real', population: c.population, lines: lines.length, districts: districts.length, blurb: c.blurb };
}

const ids = process.argv.slice(2);
const idxFile = path.join(OUT, 'index.json');
const index = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, 'utf8')) : [];
for (const c of CITIES.filter((x) => !ids.length || ids.includes(x.id))) {
  console.log(`building ${c.name}`);
  const entry = build(c);
  const k = index.findIndex((x) => x.id === c.id);
  if (k >= 0) index[k] = entry; else index.push(entry);
}
fs.writeFileSync(idxFile, JSON.stringify(index, null, 1));
