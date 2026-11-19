import { useState } from 'react';
import { Link } from 'react-router-dom';
import { careerState, currentRank, missionDone, rankDone, resetCareer, RANKS } from '../lib/career';
import '../career.css';

export default function Career() {
  const [s, setS] = useState(careerState);
  const k = currentRank(s);
  const next = RANKS[k + 1];
  const nextDone = next ? next.missions.filter((m) => missionDone(m, s)).length : 0;
  return (
    <main id="main" className="page career">
      <div className="page-head cr-head">
        <span className="cr-kicker">Your career</span>
        <h1>{k >= 0 ? RANKS[k].title : 'Visitor'}</h1>
        <p>{k >= 0 ? RANKS[k].blurb : 'Nobody starts in the control room. Earn each rank by doing the work across the project: learn, watch, operate, restore.'}</p>
        {next && (
          <div className="cr-next">
            <span>Next: {next.title}</span>
            <div className="cr-bar"><i style={{ width: `${(nextDone / next.missions.length) * 100}%` }} /></div>
            <em>{nextDone} of {next.missions.length} missions</em>
          </div>
        )}
      </div>

      <ol className="cr-ranks">
        {RANKS.map((r, i) => {
          const earned = rankDone(r, s) && i <= k;
          const open = i <= k + 1;
          return (
            <li key={r.title} className={`${earned ? 'earned' : ''} ${open ? '' : 'locked'} ${i === k + 1 ? 'current' : ''}`}>
              <div className="cr-rank-head">
                <span className="cr-n">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h2>{r.title}</h2>
                  <p>{r.blurb}</p>
                </div>
                {earned && <span className="cr-badge">Earned</span>}
              </div>
              {open && (
                <ul className="cr-missions">
                  {r.missions.map((m) => {
                    const ok = missionDone(m, s);
                    const have = Math.min(m.need, m.have(s));
                    return (
                      <li key={m.title} className={ok ? 'ok' : ''}>
                        <i aria-hidden="true">{ok ? '✓' : ''}</i>
                        <Link to={m.to}>{m.title}</Link>
                        {m.need > 1 && <span className="cr-count">{have} / {m.need}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      <p className="hint cr-foot">
        Progress is kept in this browser only.{' '}
        <button className="cr-reset" onClick={() => { if (confirm('Clear your career progress? Course chapters and Halvern grades are kept.')) { resetCareer(); setS(careerState()); } }}>Clear career progress</button>
      </p>
    </main>
  );
}
