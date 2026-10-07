import type { StatTemplateId } from '@core/skills/types';
import type { Stats } from '@core/types';

export interface StatTemplate {
  base: Stats;
  growth: Stats;
}

/** Базовые статы уровня 1 (★3, без таланта) и рост в % — SPEC 8.3. */
export const STAT_TEMPLATES: Record<StatTemplateId, StatTemplate> = {
  inf_melee: { base: { hp: 18, atk: 8, spd: 8, def: 6, res: 4 }, growth: { hp: 60, atk: 55, spd: 55, def: 45, res: 35 } },
  inf_magic: { base: { hp: 16, atk: 8, spd: 7, def: 3, res: 7 }, growth: { hp: 50, atk: 55, spd: 50, def: 30, res: 55 } },
  inf_ranged: { base: { hp: 17, atk: 7, spd: 9, def: 4, res: 4 }, growth: { hp: 55, atk: 50, spd: 60, def: 35, res: 35 } },
  inf_staff: { base: { hp: 17, atk: 6, spd: 7, def: 4, res: 7 }, growth: { hp: 55, atk: 45, spd: 50, def: 35, res: 55 } },
  inf_purr: { base: { hp: 16, atk: 5, spd: 9, def: 4, res: 5 }, growth: { hp: 55, atk: 35, spd: 60, def: 35, res: 45 } },
  armor_melee: { base: { hp: 22, atk: 9, spd: 4, def: 10, res: 4 }, growth: { hp: 70, atk: 60, spd: 30, def: 65, res: 35 } },
  cav_melee: { base: { hp: 17, atk: 8, spd: 7, def: 5, res: 5 }, growth: { hp: 55, atk: 55, spd: 50, def: 40, res: 40 } },
  cav_magic: { base: { hp: 15, atk: 8, spd: 6, def: 3, res: 7 }, growth: { hp: 45, atk: 55, spd: 45, def: 30, res: 55 } },
  cav_staff: { base: { hp: 16, atk: 6, spd: 6, def: 4, res: 7 }, growth: { hp: 50, atk: 45, spd: 45, def: 35, res: 55 } },
  flier_melee: { base: { hp: 17, atk: 8, spd: 8, def: 5, res: 6 }, growth: { hp: 55, atk: 55, spd: 55, def: 40, res: 45 } },
  flier_ranged: { base: { hp: 16, atk: 7, spd: 9, def: 4, res: 5 }, growth: { hp: 50, atk: 50, spd: 60, def: 35, res: 45 } },
};
