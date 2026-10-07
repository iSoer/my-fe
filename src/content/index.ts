export * from './balance';
export * from './archetypes';
export * from './classes';
export * from './weapons';
export * from './skills/specials';
export * from './skills/assists';
export * from './skills/passives';
export * from './traits';
export * from './names';
export * from './breeds';
export * from './personalities';
export * from './epitaphs';
export * from './biomes';
export * from './factions';
export * from './appearance';

import { ASSISTS } from './skills/assists';
import { PASSIVES } from './skills/passives';
import { SPECIALS } from './skills/specials';
import { WEAPONS } from './weapons';
import type { SkillSlot } from '@core/types';

export interface AnySkillInfo {
  id: string;
  name: string;
  desc: string;
  slot: SkillSlot;
  spCost: number;
}

export function skillInfo(id: string): AnySkillInfo | undefined {
  const w = WEAPONS.find((x) => x.id === id);
  if (w) return { id, name: w.name, desc: w.desc, slot: 'weapon', spCost: w.spCost };
  const a = ASSISTS.find((x) => x.id === id);
  if (a) return { id, name: a.name, desc: a.desc, slot: 'assist', spCost: a.spCost };
  const s = SPECIALS.find((x) => x.id === id);
  if (s) return { id, name: s.name, desc: s.desc, slot: 'special', spCost: s.spCost };
  const p = PASSIVES.find((x) => x.id === id);
  if (p) return { id, name: p.name, desc: p.desc, slot: p.slot, spCost: p.spCost };
  return undefined;
}
