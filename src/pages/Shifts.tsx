import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SCENARIOS } from '../grid/scenarios';
import { getBests } from '../lib/runStore';
import { clock } from '../lib/format';
import NetworkMap from '../components/NetworkMap';

const FOCUS: Record<string, { lines: string[]; plants: string[]; note: string }> = {
  tuesday: { lines: [], plants: ['harbour', 'glen'], note: 'Watch the evening ramp at Harbour and Glen Dam.' },
  heatwave: { lines: ['hill-east', 'central-east', 'east-kes'], plants: ['ridgeway'], note: 'The eastern corridor runs hot, and Ridgeway is short of cooling water.' },
  infeed: { lines: [], plants: ['kestrel', 'saltmarsh'], note: 'Kestrel Point is the largest single loss on the system.' },
  stillwinter: { lines: ['west-old', 'west-air'], plants: ['westmark', 'airport'], note: 'Imports arrive over the ageing Westmark cable.' },
  storm: { lines: ['kes-salt', 'salt-east', 'ridge-north'], plants: ['saltmarsh'], note: 'Saltmarsh wind and the coastal lines take the weather.' },
  blackstart: { lines: ['glen-north', 'north-central'], plants: ['glen'], note: 'The restoration path starts at Glen Dam and runs south through Northgate.' },
  sandbox: { lines: [], plants: [], note: 'All of it is yours.' },
};

export default function Shifts() {
  const [pick, setPick] = useState(SCENARIOS[0].id);
  const bests = getBests();
  const sc = SCENARIOS.find((s) => s.id === pick)!;
  const f = FOCUS[sc.id];
  return (
    <main id="main" className="page shifts">
      <div className="page-head">
        <h1>Choose a shift</h1>
        <p>Each shift drops you into Halvern's control room at a different hour, season and kind of trouble. Start with an ordinary Tuesday.</p>
      </div>
      <div className="shift-grid">
        <ul className="shift-list" role="listbox" aria-label="Shifts">
          {SCENARIOS.map((s) => {
            const best = bests[s.id];
            return (
              <li key={s.id}>
                <button role="option" aria-selected={pick === s.id} className={pick === s.id ? 'on' : ''} onClick={() => setPick(s.id)}>
                  <span className="sh-title">{s.title}</span>
                  <span className="sh-hook">{s.hook}</span>
                  <span className="sh-span" aria-label={`${clock(s.startHour)} to ${clock(s.endHour)}`}>
                    <i style={{ left: `${(s.startHour / 26) * 100}%`, width: `${((s.endHour - s.startHour) / 26) * 100}%` }} />
                  </span>
                  <span className="sh-meta">
                    <span>{clock(s.startHour)} to {clock(s.endHour)}</span>
                    <span className="sh-diff" aria-label={`Difficulty ${s.difficulty} of 5`}>
                      {[1, 2, 3, 4, 5].map((k) => <b key={k} className={k <= s.difficulty ? 'on' : ''} />)}
                    </span>
                    {best && <span className={`grade g-${best.grade}`}>Best {best.grade}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <section className="shift-detail" aria-live="polite">
          <span className="brief-meta">{sc.season}, {clock(sc.startHour)} to {clock(sc.endHour)}</span>
          <h2>{sc.title}</h2>
          {sc.brief.map((p, i) => <p key={i}>{p}</p>)}
          <p className="brief-goal"><strong>Goal.</strong> {sc.goal}</p>
          <figure className="shift-map">
            <NetworkMap lines={f.lines} plants={f.plants} />
            <figcaption>{f.note}</figcaption>
          </figure>
          <Link to={`/control/${sc.id}`} className="btn primary">Enter the control room</Link>
        </section>
      </div>
    </main>
  );
}
