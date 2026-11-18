import type { LogEntry, Sample, Score, SimEvent } from '../grid/engine';

export interface RunRecord {
  scenarioId: string;
  title: string;
  startHour: number;
  endHour: number;
  history: Sample[];
  events: SimEvent[];
  log: LogEntry[];
  score: Score;
  finishedEarly: boolean;
  at: number;
}

const KEY = 'blackstart.bests.v1';
const LAST = 'blackstart.last.v1';
let last: RunRecord | null = null;

export function saveRun(r: RunRecord) {
  last = r;
  try {
    sessionStorage.setItem(LAST, JSON.stringify(r));
  } catch {
    /* storage unavailable or full: the in-memory copy still works */
  }
  const bests = getBests();
  const prev = bests[r.scenarioId];
  if (!r.finishedEarly && (!prev || r.score.points > prev.points)) {
    bests[r.scenarioId] = { points: r.score.points, grade: r.score.grade };
    try {
      localStorage.setItem(KEY, JSON.stringify(bests));
    } catch {
      /* ignore */
    }
  }
}

export function lastRun(): RunRecord | null {
  if (last) return last;
  try {
    const s = sessionStorage.getItem(LAST);
    if (s) last = JSON.parse(s);
  } catch {
    /* ignore */
  }
  return last;
}

export function getBests(): Record<string, { points: number; grade: string }> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}
