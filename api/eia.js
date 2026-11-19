// Server-side proxy for the U.S. Energy Information Administration (EIA) API v2.
// The key lives only in the Vercel environment and never reaches the browser.
const KEY = () => process.env.EIA_API_KEY || process.env.EIA_KEY || process.env.EIA || '';
const RESPONDENTS = new Set(['ERCO', 'CISO', 'PJM', 'MISO', 'NYIS', 'ISNE', 'SWPP', 'BPAT', 'FPL', 'SOCO']);
const BASE = 'https://api.eia.gov/v2/electricity/rto';

export default async function handler(req, res) {
  const key = KEY();
  if (!key) return res.status(503).json({ error: 'EIA key not configured on the server' });
  const url = new URL(req.url, 'http://localhost');
  const respondent = (url.searchParams.get('respondent') || 'ERCO').toUpperCase();
  const kind = url.searchParams.get('kind') === 'fuel' ? 'fuel' : 'region';
  if (!RESPONDENTS.has(respondent)) return res.status(400).json({ error: 'unknown balancing authority' });
  const q = new URLSearchParams({ api_key: key, frequency: 'hourly', 'data[0]': 'value', 'facets[respondent][]': respondent, 'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: kind === 'fuel' ? '400' : '300' });
  const path = kind === 'fuel' ? 'fuel-type-data' : 'region-data';
  try {
    const r = await fetch(`${BASE}/${path}/data/?${q}`);
    if (!r.ok) return res.status(502).json({ error: `EIA answered ${r.status}` });
    const j = await r.json();
    // pass through only what the page needs: no key, no request echo
    const rows = (j.response?.data ?? []).map((d) => ({ period: d.period, type: d.type ?? d.fueltype, name: d['type-name'] ?? d['fueltype-name'] ?? d.fueltype, value: d.value === null ? null : Number(d.value) }));
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json({ respondent, kind, rows });
  } catch (e) {
    return res.status(502).json({ error: 'EIA unreachable' });
  }
}
