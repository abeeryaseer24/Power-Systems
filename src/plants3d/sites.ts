import { CHERNOBYL, FUKUSHIMA, ROOPPUR, TMI } from './sites-nuclear';
import { DRAX, THREE_GORGES } from './sites-other';
import type { SiteDef } from './PlantScene';

export const SITES: SiteDef[] = [ROOPPUR, CHERNOBYL, FUKUSHIMA, TMI, DRAX, THREE_GORGES];
export const siteById = (id: string) => SITES.find((s) => s.id === id);

/**
 * Elevation drawings for the index: each plant as a line elevation at a common
 * scale (1 px = 2 m), the way an architecture portfolio sets them side by side.
 */
export type El =
  | { t: 'tower'; x: number; h: number; rb: number; rt: number; built?: number }
  | { t: 'dome'; x: number; r: number; h: number; d: number }
  | { t: 'box'; x: number; w: number; h: number }
  | { t: 'stack'; x: number; h: number; w: number }
  | { t: 'arch'; x: number; span: number; h: number }
  | { t: 'dam'; x: number; w: number; h: number }
  | { t: 'bulb'; x: number; r: number; h: number };

export const ELEVATIONS: Record<string, El[]> = {
  rooppur: [
    { t: 'box', x: -90, w: 70, h: 38 }, { t: 'dome', x: -20, r: 25, h: 52, d: 19 }, { t: 'box', x: 70, w: 130, h: 44 },
    { t: 'dome', x: 170, r: 25, h: 52, d: 19 }, { t: 'tower', x: 330, h: 170, rb: 64, rt: 38 }, { t: 'tower', x: 480, h: 170, rb: 64, rt: 38 },
  ],
  chernobyl: [
    { t: 'box', x: -300, w: 230, h: 31 }, { t: 'box', x: -330, w: 62, h: 72 }, { t: 'box', x: -230, w: 62, h: 72 }, { t: 'stack', x: -280, h: 150, w: 10 },
    { t: 'box', x: -60, w: 62, h: 72 }, { t: 'arch', x: 110, span: 162, h: 108 }, { t: 'tower', x: 330, h: 150, rb: 60, rt: 36 }, { t: 'tower', x: 470, h: 150, rb: 60, rt: 36, built: 0.62 },
  ],
  fukushima: [
    { t: 'box', x: -270, w: 46, h: 47 }, { t: 'box', x: -210, w: 46, h: 47 }, { t: 'stack', x: -150, h: 120, w: 8 }, { t: 'box', x: -90, w: 42, h: 47 },
    { t: 'box', x: -30, w: 46, h: 47 }, { t: 'stack', x: 30, h: 120, w: 8 }, { t: 'box', x: 90, w: 46, h: 47 }, { t: 'box', x: 150, w: 46, h: 47 },
    { t: 'box', x: 280, w: 200, h: 30 },
  ],
  tmi: [
    { t: 'box', x: -250, w: 120, h: 34 }, { t: 'dome', x: -150, r: 20, h: 47, d: 12 }, { t: 'dome', x: -60, r: 20, h: 47, d: 12 },
    { t: 'tower', x: 60, h: 113, rb: 57, rt: 33 }, { t: 'tower', x: 190, h: 113, rb: 57, rt: 33 }, { t: 'tower', x: 320, h: 113, rb: 57, rt: 33 }, { t: 'tower', x: 450, h: 113, rb: 57, rt: 33 },
  ],
  drax: [
    { t: 'tower', x: -420, h: 114, rb: 49, rt: 29 }, { t: 'tower', x: -320, h: 114, rb: 49, rt: 29 }, { t: 'box', x: -110, w: 240, h: 76 }, { t: 'stack', x: 30, h: 259, w: 22 },
    { t: 'box', x: 120, w: 140, h: 76 }, { t: 'bulb', x: 260, r: 31, h: 50 }, { t: 'tower', x: 380, h: 114, rb: 49, rt: 29 }, { t: 'tower', x: 480, h: 114, rb: 49, rt: 29 },
  ],
  'three-gorges': [{ t: 'dam', x: 0, w: 1200, h: 181 }],
};
