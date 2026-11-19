import { Link, NavLink } from 'react-router-dom';

export default function TopBar() {
  return (
    <header className="topbar">
      <Link to="/" className="wordmark" aria-label="Blackstart home">
        <svg viewBox="0 0 40 20" aria-hidden="true">
          <path d="M1 14 C 8 14, 10 4, 20 4 S 32 14, 39 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="20" cy="4" r="2.6" fill="var(--sodium)" />
        </svg>
        Blackstart
      </Link>
      <nav aria-label="Main">
        <NavLink to="/shifts">Shifts</NavLink>
        <NavLink to="/atlas">Atlas</NavLink>
        <NavLink to="/blackouts">Blackouts</NavLink>
        <NavLink to="/academy">Case files</NavLink>
        <NavLink to="/nuclear">Nuclear</NavLink>
        <NavLink to="/learn">Learn</NavLink>
        <NavLink to="/about">About</NavLink>
      </nav>
    </header>
  );
}
