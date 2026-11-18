import { BUSES, LINES, PLANTS } from '../grid/network';
import { coastZ, PLANT_SITE } from '../scene/world';

/** Schematic of Halvern's 275 kV network, with the given assets highlighted. */
export default function NetworkMap({ lines = [], plants = [], className = '' }: { lines?: string[]; plants?: string[]; className?: string }) {
  const X = (x: number) => x + 40;
  const Y = (z: number) => z + 32;
  const coast: string[] = [];
  for (let x = -40; x <= 42; x += 2) coast.push(`${X(x)},${Y(coastZ(x))}`);
  return (
    <svg viewBox="0 0 82 66" className={`netmap ${className}`} role="img" aria-label="Schematic map of the Halvern transmission network">
      <polygon points={`${coast.join(' ')} 82,66 0,66`} className="nm-sea" />
      {LINES.map((l) => {
        const a = BUSES[l.from];
        const b = BUSES[l.to];
        return <line key={l.id} x1={X(a.x)} y1={Y(a.z)} x2={X(b.x)} y2={Y(b.z)} className={lines.includes(l.id) ? 'nm-line hot' : 'nm-line'} />;
      })}
      {BUSES.map((b) => (
        <rect key={b.id} x={X(b.x) - 0.9} y={Y(b.z) - 0.9} width={1.8} height={1.8} className="nm-bus" />
      ))}
      {PLANTS.map((p) => {
        const s = PLANT_SITE[p.id];
        return <circle key={p.id} cx={X(s.x)} cy={Y(s.z)} r={plants.includes(p.id) ? 1.7 : 1} className={`nm-plant k-${p.kind} ${plants.includes(p.id) ? 'hot' : ''}`} />;
      })}
    </svg>
  );
}
