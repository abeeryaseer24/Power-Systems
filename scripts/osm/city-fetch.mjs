// Fetch the raw OpenStreetMap layers for a real city into scripts/osm/.cache.
//   node scripts/osm/city-fetch.mjs dhaka
// Buildings are fetched tile by tile (a city centre can hold half a million).
// Data © OpenStreetMap contributors, ODbL.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITIES } from './cities.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, 'scripts/osm/.cache');
fs.mkdirSync(CACHE, { recursive: true });
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
let ep = Number(process.env.OVERPASS_START ?? 0) % ENDPOINTS.length;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function overpass(key, query) {
  const file = path.join(CACHE, `${key}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 12; attempt++) {
    const url = ENDPOINTS[ep];
    let status = 'network error';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'blackstart-grid-model/0.1', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(330_000),
      });
      status = `HTTP ${res.status}`;
      if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
        const txt = await res.text();
        const j = JSON.parse(txt);
        if (j.remark && /runtime error|timed out|out of memory/i.test(j.remark)) throw new Error(j.remark);
        fs.writeFileSync(file, txt);
        console.log(`  ${key}: ${j.elements.length} elements, ${(txt.length / 1e6).toFixed(1)} MB`);
        await sleep(4000);
        return j;
      }
    } catch (e) {
      status = e.message;
    }
    console.warn(`  ${key}: ${status} from ${new URL(url).host}, trying the next server`);
    ep = (ep + 1) % ENDPOINTS.length;
    await sleep(6000 * (1 + Math.floor(attempt / ENDPOINTS.length)));
  }
  throw new Error(`overpass failed for ${key}`);
}

export function tilesOf(c) {
  const [s, w, n, e] = c.bbox, [nx, ny] = c.tiles;
  const out = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const ts = s + ((n - s) * j) / ny, tn = s + ((n - s) * (j + 1)) / ny;
    const tw = w + ((e - w) * i) / nx, te = w + ((e - w) * (i + 1)) / nx;
    out.push({ key: `${i}-${j}`, bb: `${ts.toFixed(4)},${tw.toFixed(4)},${tn.toFixed(4)},${te.toFixed(4)}` });
  }
  return out;
}

export async function fetchCity(c) {
  const bb = c.bbox.join(',');
  const T = '[out:json][timeout:240];';
  if (c.metro) await overpass(`city-${c.id}-metro`, `${T}(relation[route=${c.metro.route}](${bb}););out geom;node(r:"stop");out;node(r:"stop_entry_only");out;node(r:"stop_exit_only");out;`);
  await overpass(`city-${c.id}-subs`, `${T}(node[power=substation](${bb});way[power=substation](${bb}););out center tags;`);
  await overpass(`city-${c.id}-water`, `${T}(way[natural=water](${bb});relation[natural=water](${bb});way[waterway=riverbank](${bb});relation[waterway=riverbank](${bb}););out geom qt;`);
  await overpass(`city-${c.id}-landuse`, `${T}(way[landuse~"^(commercial|retail|industrial|railway|military)$"](${bb});way[amenity~"^(hospital|university|college)$"](${bb});way[leisure~"^(park|golf_course|stadium)$"](${bb});way[landuse~"^(grass|recreation_ground|cemetery|farmland|meadow)$"](${bb}););out geom qt;`);
  await overpass(`city-${c.id}-roads`, `${T}way[highway~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|motorway_link|trunk_link|primary_link)$"](${bb});out geom qt;`);
  // very large cities: bounding boxes instead of full outlines, about four times lighter
  const out = c.light ? 'out tags bb qt;' : 'out tags geom qt;';
  for (const t of tilesOf(c)) await overpass(`city-${c.id}-bld-${t.key}`, `${T}way[building](${t.bb});${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ids = process.argv.slice(2);
  for (const c of CITIES.filter((x) => !ids.length || ids.includes(x.id))) {
    console.log(`fetching ${c.name}`);
    await fetchCity(c);
  }
  console.log('done');
}
