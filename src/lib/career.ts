// Career progress: small achievements recorded by the pages where they happen,
// kept in this browser only. Ranks are earned by completing their missions.
import { getBests } from './runStore';

const KEY = 'blackstart.career.v1';
const COURSE = 'blackstart.course.v1';

function read(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

/** Record an achievement, e.g. 'save:texas-2021', 'doc:chernobyl-1986', 'blackstart'. */
export function markDone(id: string) {
  const d = read(KEY);
  if (d.includes(id)) return;
  d.push(id);
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: progress is simply not kept */
  }
}

export function resetCareer() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export interface CareerState { done: Set<string>; chapters: number; shifts: number; goodShifts: number }

export function careerState(): CareerState {
  const bests = getBests();
  const grades = Object.values(bests).map((b) => b.grade);
  return {
    done: new Set(read(KEY)),
    chapters: read(COURSE).length,
    shifts: grades.length,
    goodShifts: grades.filter((g) => g === 'S' || g === 'A' || g === 'B').length,
  };
}

const count = (s: CareerState, prefix: string) => [...s.done].filter((d) => d.startsWith(prefix)).length;

export interface Mission { title: string; to: string; need: number; have: (s: CareerState) => number }
export interface Rank { title: string; blurb: string; missions: Mission[] }

export const RANKS: Rank[] = [
  {
    title: 'Trainee',
    blurb: 'Learn what the grid is before you are trusted near it.',
    missions: [
      { title: 'Finish three chapters of Power Systems 101', to: '/course', need: 3, have: (s) => s.chapters },
      { title: 'Watch a historical blackout replay to the end', to: '/blackouts', need: 1, have: (s) => count(s, 'watch:') },
      { title: 'Read a case file', to: '/academy', need: 1, have: (s) => count(s, 'case:') },
    ],
  },
  {
    title: 'Control-room assistant',
    blurb: 'Sit beside the operators and learn the tools.',
    missions: [
      { title: 'Complete a shift in Halvern', to: '/shifts', need: 1, have: (s) => s.shifts },
      { title: 'Watch a documentary episode to the end', to: '/documentary', need: 1, have: (s) => count(s, 'doc:') },
      { title: 'Look through a distance relay’s eyes', to: '/protection', need: 1, have: (s) => +s.done.has('visit:protection') },
      { title: 'Check the real British grid', to: '/live', need: 1, have: (s) => +s.done.has('visit:live') },
    ],
  },
  {
    title: 'Shift operator',
    blurb: 'Your own desk, your own shift.',
    missions: [
      { title: 'Earn grade B or better on a Halvern shift', to: '/shifts', need: 1, have: (s) => s.goodShifts },
      { title: 'Stop a historical blackout in Take control mode', to: '/blackouts', need: 1, have: (s) => count(s, 'save:') },
      { title: 'Take Rooppur from cold to full power', to: '/reactor-startup', need: 1, have: (s) => +s.done.has('reactor-startup') },
      { title: 'Finish six course chapters', to: '/course', need: 6, have: (s) => s.chapters },
    ],
  },
  {
    title: 'Senior operator',
    blurb: 'The one they call when it goes wrong.',
    missions: [
      { title: 'Bring a real grid back from total darkness', to: '/black-start', need: 1, have: (s) => +s.done.has('blackstart') },
      { title: 'Stop three historical blackouts', to: '/blackouts', need: 3, have: (s) => count(s, 'save:') },
      { title: 'Earn grade B or better on three Halvern shifts', to: '/shifts', need: 3, have: (s) => s.goodShifts },
      { title: 'Watch five documentary episodes', to: '/documentary', need: 5, have: (s) => count(s, 'doc:') },
    ],
  },
  {
    title: 'System operator',
    blurb: 'Responsible for the whole interconnection.',
    missions: [
      { title: 'Black start a real grid under par', to: '/black-start', need: 1, have: (s) => +s.done.has('blackstart-par') },
      { title: 'Stop eight historical blackouts', to: '/blackouts', need: 8, have: (s) => count(s, 'save:') },
      { title: 'Finish every course chapter', to: '/course', need: 15, have: (s) => s.chapters },
      { title: 'Read twelve case files', to: '/academy', need: 12, have: (s) => count(s, 'case:') },
    ],
  },
  {
    title: 'Chief of the grid',
    blurb: 'You have seen every way a grid can fail, and stopped most of them.',
    missions: [
      { title: 'Stop fifteen historical blackouts', to: '/blackouts', need: 15, have: (s) => count(s, 'save:') },
      { title: 'Earn grade B or better on all seven Halvern shifts', to: '/shifts', need: 7, have: (s) => s.goodShifts },
      { title: 'Watch every documentary episode', to: '/documentary', need: 30, have: (s) => count(s, 'doc:') },
    ],
  },
];

export const missionDone = (m: Mission, s: CareerState) => m.have(s) >= m.need;
export const rankDone = (r: Rank, s: CareerState) => r.missions.every((m) => missionDone(m, s));
/** Index of the highest rank fully earned, or -1. Ranks must be earned in order. */
export function currentRank(s: CareerState) {
  let k = -1;
  for (let i = 0; i < RANKS.length; i++) {
    if (!rankDone(RANKS[i], s)) break;
    k = i;
  }
  return k;
}
