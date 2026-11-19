import { useEffect, useState } from 'react';
import { sfx } from '../lib/sfx';

/** One mute switch for every page's sound. */
export default function SoundToggle({ className = 'icon-btn' }: { className?: string }) {
  const [muted, setMuted] = useState(sfx.muted);
  useEffect(() => {
    const off = sfx.onMute(setMuted);
    return () => {
      off();
    };
  }, []);
  return (
    <button
      className={className}
      onClick={() => {
        sfx.unlock();
        sfx.setMuted(!muted);
      }}
      aria-label={muted ? 'Turn sound on' : 'Mute sound'}
      aria-pressed={!muted}
    >
      {muted ? (
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor" /><path d="m13 7 5 6m0-6-5 6" stroke="currentColor" strokeWidth="1.6" /></svg>
      ) : (
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor" /><path d="M13 7c1.5 1.6 1.5 4.4 0 6M15.5 5c2.8 2.8 2.8 7.2 0 10" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
      )}
    </button>
  );
}
