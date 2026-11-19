import type { Episode, Fx } from '../grid/documentaries';

/** A one-line diagram of what failed, built up scene by scene. */
export default function Anatomy({ ep, upto }: { ep: Episode; upto: number }) {
  const past: Fx[] = ep.scenes.slice(0, upto).flatMap((s) => s.fx ?? []);
  const now: Fx[] = ep.scenes[upto]?.fx ?? [];
  const all = [...past, ...now];
  const tripped = new Set(all.flatMap((f) => ('trip' in f ? [f.trip] : [])));
  const surging = new Set(all.flatMap((f) => ('surge' in f ? [f.surge] : [])));
  const lost = new Set(all.flatMap((f) => ('lose' in f ? [f.lose] : [])));
  const dark = new Set<string>();
  for (const f of all) {
    if ('dark' in f) f.dark.forEach((d) => dark.add(d));
    if ('restore' in f) f.restore.forEach((d) => dark.delete(d));
  }
  const splits = all.flatMap((f) => ('split' in f ? [f.split] : []));
  const freshTrip = new Set(now.flatMap((f) => ('trip' in f ? [f.trip] : [])));
  const freshLose = new Set(now.flatMap((f) => ('lose' in f ? [f.lose] : [])));
  const freshSplit = now.some((f) => 'split' in f);
  const node = (id: string) => ep.diagram.nodes.find((n) => n.id === id)!;

  return (
    <figure className="anatomy" aria-label="Diagram of what failed">
      <figcaption>What failed</figcaption>
      <svg viewBox="0 0 400 260">
        <defs>
          <filter id="an-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {ep.diagram.links.map((l) => {
          const a = node(l.a);
          const b = node(l.b);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const deadEnd = lost.has(l.a) || lost.has(l.b) || (dark.has(l.a) && dark.has(l.b));
          if (tripped.has(l.id)) {
            // broken line: two stubs with a gap and sparks
            const gx = (b.x - a.x) * 0.08;
            const gy = (b.y - a.y) * 0.08;
            return (
              <g key={l.id} className={`an-link tripped ${freshTrip.has(l.id) ? 'fresh' : ''}`}>
                <line x1={a.x} y1={a.y} x2={mx - gx} y2={my - gy} />
                <line x1={mx + gx} y1={my + gy} x2={b.x} y2={b.y} />
                {freshTrip.has(l.id) && (
                  <>
                    <circle cx={mx} cy={my} r="6" className="an-shock" />
                    <circle cx={mx} cy={my} r="6" className="an-shock s2" />
                    <path d={`M${mx - 7},${my - 9} L${mx + 2},${my - 1} L${mx - 3},${my + 1} L${mx + 6},${my + 10}`} className="an-bolt" filter="url(#an-glow)" />
                  </>
                )}
                {l.label && <text x={mx} y={my - 10} className="an-ll">{l.label}</text>}
              </g>
            );
          }
          return (
            <g key={l.id} className={`an-link ${surging.has(l.id) ? 'surge' : ''} ${deadEnd ? 'dead' : ''}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="an-base" />
              {!deadEnd && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="an-flow" filter={surging.has(l.id) ? 'url(#an-glow)' : undefined} />}
              {l.label && <text x={mx} y={my - 10} className="an-ll">{l.label}</text>}
            </g>
          );
        })}
        {splits.map((s, i) => {
          const [x0, y0, x1, y1] = s;
          const n = 9;
          let d = `M${x0},${y0}`;
          for (let k = 1; k <= n; k++) {
            const t = k / n;
            const jx = (k % 2 ? 7 : -7) * (k < n ? 1 : 0);
            d += ` L${x0 + (x1 - x0) * t + jx},${y0 + (y1 - y0) * t}`;
          }
          return <path key={i} d={d} className={`an-split ${freshSplit && i === splits.length - 1 ? 'fresh' : ''}`} filter="url(#an-glow)" />;
        })}
        {ep.diagram.nodes.map((n) => {
          const isLost = lost.has(n.id);
          const isDark = dark.has(n.id);
          return (
            <g key={n.id} transform={`translate(${n.x} ${n.y})`} className={`an-node k-${n.kind} ${isLost ? 'lost' : ''} ${isDark ? 'dark' : ''} ${freshLose.has(n.id) ? 'fresh' : ''}`}>
              {n.kind === 'city' && (
                <g className="an-city">
                  {[-9, -3, 3, 9].map((x, k) => <rect key={k} x={x - 2.5} y={-[10, 16, 12, 8][k]} width="5" height={[10, 16, 12, 8][k]} />)}
                  <circle r="16" className="an-halo" />
                </g>
              )}
              {n.kind === 'gen' && (<><circle r="9" className="an-gen" /><path d="M-5 0 Q -2.5 -5 0 0 T 5 0" className="an-sine" /></>)}
              {n.kind === 'sub' && <rect x="-5" y="-5" width="10" height="10" className="an-sub" />}
              {n.kind === 'ext' && <path d="M0 -9 L9 0 L0 9 L-9 0 Z" className="an-ext" />}
              {isLost && <path d="M-11 -11 L11 11 M11 -11 L-11 11" className="an-x" />}
              <text y={n.kind === 'city' ? 14 : 22} className="an-nl">{n.label}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
