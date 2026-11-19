import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

const GROUPS: { label: string; items: { to: string; label: string; note: string }[] }[] = [
  {
    label: 'Play',
    items: [
      { to: '/shifts', label: 'Halvern shifts', note: 'Run a fictional city through seven shifts' },
      { to: '/black-start', label: 'Black start', note: 'Rebuild a real grid from total darkness' },
      { to: '/what-if', label: 'What if', note: 'Stack disasters on a real grid' },
      { to: '/reactor-startup', label: 'Reactor startup', note: 'Take Rooppur from cold to full power' },
    ],
  },
  {
    label: 'Real grids',
    items: [
      { to: '/atlas', label: 'Atlas', note: 'Ten grids rebuilt from OpenStreetMap' },
      { to: '/blackouts', label: 'Blackouts', note: 'Replay eighteen historical failures' },
      { to: '/documentary', label: 'Documentaries', note: 'The last minutes, told as a story' },
      { to: '/academy', label: 'Case files', note: 'Why each one happened' },
      { to: '/predictor', label: 'Predictor', note: 'Would an AI have seen it coming?' },
    ],
  },
];

export default function TopBar() {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(null), [pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);
  return (
    <header className="topbar" ref={ref}>
      <Link to="/" className="wordmark" aria-label="Blackstart home">
        <svg viewBox="0 0 40 20" aria-hidden="true">
          <path d="M1 14 C 8 14, 10 4, 20 4 S 32 14, 39 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="20" cy="4" r="2.6" fill="var(--sodium)" />
        </svg>
        Blackstart
      </Link>
      <nav aria-label="Main">
        {GROUPS.map((g) => {
          const active = g.items.some((it) => pathname.startsWith(it.to));
          return (
            <div key={g.label} className={`nav-group ${open === g.label ? 'open' : ''}`}>
              <button className={`nav-trigger ${active ? 'active' : ''}`} aria-expanded={open === g.label} onClick={() => setOpen(open === g.label ? null : g.label)}>
                {g.label}
                <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
              </button>
              {open === g.label && (
                <ul className="nav-menu">
                  {g.items.map((it) => (
                    <li key={it.to}>
                      <NavLink to={it.to}>
                        <b>{it.label}</b>
                        <span>{it.note}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        <NavLink to="/nuclear">Nuclear</NavLink>
        <NavLink to="/course">Course</NavLink>
        <NavLink to="/about">About</NavLink>
      </nav>
    </header>
  );
}
