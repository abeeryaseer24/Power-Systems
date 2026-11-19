import type { Reactor } from '../nuclear/reactor';

function fuelColor(T: number) {
  const x = Math.max(0, Math.min(1, (T - 600) / 2200));
  const r = Math.round(140 + 115 * Math.min(1, x * 2));
  const g = Math.round(40 + 200 * Math.max(0, x - 0.25));
  const b = Math.round(20 + 220 * Math.max(0, x - 0.75));
  return `rgb(${r},${g},${b})`;
}

// vessel geometry (viewBox 1600 x 900; the picture is anchored right so story text sits on the left)
const VX = 700;
const VW = 480;
const VY = 150;
const VH = 460;
const CX = VX + VW / 2;

/** Full-screen cinematic cross-section of the reactor, driven by the live model. */
export default function CoreView({ r, t }: { r: Reactor; t: number }) {
  const s = r.s;
  const level = r.level;
  const cherenkov = s.destroyed ? 0 : Math.min(1, Math.sqrt(Math.max(0, Math.min(3, s.n))) * 0.9 + 0.08);
  const heat = Math.max(0, Math.min(1, (s.Tf - 900) / 1400));
  const waterTop = VY + VH - 40 - (VH - 80) * level;
  const rodTip = VY + 20 + 300 * s.rods;
  const melt = s.damage;
  const bubbles = Math.round(Math.min(48, s.void * 70 + (s.Tc > 280 && level < 1 ? 14 : 0) + (s.Tc > 250 && !s.offsite && !s.diesels ? 10 : 0)));
  const flash = s.destroyed ? Math.max(0, 1 - (t % 4) * 1.5) : 0;
  const steaming = s.porvOpen || (s.Tc > 290 && level < 0.97);
  const read = (k: string, v: string, hot = false) => ({ k, v, hot });
  const readouts = [
    read('Fission power', s.destroyed ? 'Core destroyed' : s.n >= 0.01 ? `${Math.round(s.n * 100)} %` : '< 1 %', s.destroyed || s.n > 1.1),
    read('Fuel', `${Math.round(s.Tf)} °C`, s.Tf > 1200),
    read('Core covered', `${Math.round(level * 100)} %`, level < 0.9),
    read('Decay heat', `${Math.round(r.decay)} MW`),
    read('Grid', s.offsite ? 'Connected' : 'Lost', !s.offsite),
    read('Diesels', s.offsite ? 'Standby' : s.diesels ? 'Running' : 'Dead', !s.offsite && !s.diesels),
    read('Batteries', s.dcPower ? 'OK' : 'Lost', !s.dcPower),
    read('Hydrogen', `${Math.round(s.h2)} kg`, s.h2 > 5),
  ];
  return (
    <>
    <svg className="core-view" viewBox="0 0 1600 900" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="cv-cher" cx="50%" cy="55%" r="55%">
          <stop offset="0" stopColor="#8fdcff" stopOpacity={0.9 * cherenkov} />
          <stop offset="0.45" stopColor="#2f6bff" stopOpacity={0.35 * cherenkov} />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cv-heat" cx="50%" cy="70%" r="55%">
          <stop offset="0" stopColor={fuelColor(s.Tf)} stopOpacity={0.85 * Math.max(heat, melt)} />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cv-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a6c9c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#06182b" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="cv-clad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1c232c" />
          <stop offset="0.5" stopColor="#5d6b7c" />
          <stop offset="1" stopColor="#1c232c" />
        </linearGradient>
        <clipPath id="cv-vessel"><rect x={VX} y={VY} width={VW} height={VH} rx="130" /></clipPath>
        <filter id="cv-blur"><feGaussianBlur stdDeviation="22" /></filter>
        <filter id="cv-glow"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <rect width="1600" height="900" fill="#020407" />
      <ellipse cx={CX} cy="430" rx="520" ry="380" fill="url(#cv-cher)" filter="url(#cv-blur)" />
      <ellipse cx={CX} cy="470" rx="440" ry="320" fill="url(#cv-heat)" filter="url(#cv-blur)" />
      {/* containment shell and floor */}
      <path d={`M ${CX - 380} 800 L ${CX - 380} 240 Q ${CX - 380} 60 ${CX} 60 Q ${CX + 380} 60 ${CX + 380} 240 L ${CX + 380} 800`} fill="none" stroke="#18222f" strokeWidth="10" />
      <line x1={CX - 460} y1="800" x2={CX + 460} y2="800" stroke="#18222f" strokeWidth="4" />
      {/* pipes to the loop */}
      <path d={`M ${VX} 300 H ${VX - 150} V 700`} fill="none" stroke="#24303f" strokeWidth="18" />
      <path d={`M ${VX + VW} 300 H ${VX + VW + 120}`} fill="none" stroke="#24303f" strokeWidth="18" />
      {/* vessel */}
      <rect x={VX} y={VY} width={VW} height={VH} rx="130" fill="#03070c" stroke="#61748b" strokeWidth="6" />
      <g clipPath="url(#cv-vessel)">
        <rect x={VX} y={waterTop} width={VW} height={VY + VH - waterTop} fill="url(#cv-water)" />
        <line x1={VX} y1={waterTop} x2={VX + VW} y2={waterTop} stroke="rgba(170,220,255,0.35)" strokeWidth="2" />
        {Array.from({ length: bubbles }).map((_, i) => {
          const span = Math.max(30, VY + VH - waterTop);
          const y = VY + VH - ((i * 97 + t * 110 * (1 + (i % 3))) % span);
          return <circle key={i} cx={VX + 40 + ((i * 53) % (VW - 80))} cy={y} r={2 + (i % 4)} fill="rgba(210,235,255,0.45)" />;
        })}
        {/* fuel assemblies */}
        {Array.from({ length: 12 }).map((_, i) => {
          const x = VX + 52 + i * 33;
          const slump = melt * (i % 2 ? 70 : 40);
          const y = 340 + slump;
          const hgt = 220 - melt * 90;
          return (
            <g key={i} opacity={s.destroyed ? 0.2 : 1}>
              <rect x={x} y={y} width="18" height={hgt} rx="2" fill="url(#cv-clad)" />
              <rect x={x} y={y} width="18" height={hgt} rx="2" fill={fuelColor(s.Tf)} opacity={Math.max(heat, melt * 0.8)} />
              <rect x={x - 4} y={y - 4} width="26" height={hgt + 8} rx="4" fill={fuelColor(s.Tf)} opacity={0.6 * Math.max(heat, melt)} filter="url(#cv-glow)" />
            </g>
          );
        })}
        {melt > 0.15 && <ellipse cx={CX} cy={VY + VH - 30} rx={60 + melt * 160} ry={14 + melt * 14} fill="#ff7a2e" filter="url(#cv-glow)" />}
        {/* control rods between the assemblies */}
        {Array.from({ length: 11 }).map((_, i) => (
          <rect key={i} x={VX + 72 + i * 33} y={VY - 10} width="6" height={Math.max(6, rodTip - VY + 10)} fill="#c3ccd8" opacity="0.85" />
        ))}
      </g>
      {/* steam venting from the top when boiling off or relieving */}
      {steaming && Array.from({ length: 16 }).map((_, i) => (
        <circle key={i} cx={CX + Math.sin(t * 0.7 + i) * 50 + (i - 8) * 8} cy={VY - 10 - ((t * 45 + i * 28) % 150)} r={16 + (i % 5) * 4} fill="rgba(200,210,220,0.06)" />
      ))}
      {s.destroyed && (
        <>
          <rect width="1600" height="900" fill="#fff6e8" opacity={flash * 0.8} />
          {Array.from({ length: 48 }).map((_, i) => (
            <circle key={i} cx={CX + Math.sin(i * 7.1) * (150 + ((t * 30 + i * 13) % 520))} cy={VY + 120 - ((t * 55 + i * 21) % 420)} r={2 + (i % 3)} fill={i % 4 ? '#ff9a3c' : '#ffd27a'} opacity="0.8" />
          ))}
        </>
      )}
    </svg>
    <dl className="cv-panel">
      {readouts.map((x) => (
        <div key={x.k}><dt>{x.k}</dt><dd className={x.hot ? 'hot' : ''}>{x.v}</dd></div>
      ))}
    </dl>
    </>
  );
}
