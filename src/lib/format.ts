export const mw = (x: number) => `${Math.round(x).toLocaleString('en-GB')} MW`;
export const num = (x: number, d = 0) => x.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });

export function clock(hour: number, seconds = false) {
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = Math.floor(((h - hh) * 60 - mm) * 60);
  const base = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  return seconds ? `${base}:${String(ss).padStart(2, '0')}` : base;
}

export function duration(sec: number) {
  if (sec < 90) return `${Math.round(sec)} s`;
  if (sec < 5400) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
}

export const euro = (x: number) =>
  x >= 1e6 ? `€${(x / 1e6).toFixed(2)} m` : x >= 1e4 ? `€${Math.round(x / 1000)}k` : `€${Math.round(x)}`;
