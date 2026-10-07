import { describe, expect, it } from 'vitest';
import { CLASSES } from '@content/classes';
import { WEAPONS } from '@content/weapons';
import { SPECIALS } from '@content/skills/specials';
import { ASSISTS } from '@content/skills/assists';
import { PASSIVES } from '@content/skills/passives';
import { TRAITS } from '@content/traits';
import { BIOMES } from '@content/biomes';
import { FACTIONS } from '@content/factions';
import { BREEDS } from '@content/breeds';
import { NAMES, EPITHETS } from '@content/names';
import { STAT_TEMPLATES } from '@content/archetypes';
import { COMMON_SKILLS, skillCost, slotOf } from '@core/units';

function uniqueIds(items: readonly { id: string }[]): void {
  const ids = items.map((i) => i.id);
  expect(new Set(ids).size).toBe(ids.length);
}

describe('контент', () => {
  it('id уникальны', () => {
    uniqueIds(CLASSES);
    uniqueIds(WEAPONS);
    uniqueIds(SPECIALS);
    uniqueIds(ASSISTS);
    uniqueIds(PASSIVES);
    uniqueIds(TRAITS);
    uniqueIds(BIOMES);
    uniqueIds(FACTIONS);
    uniqueIds(BREEDS);
    const all = [...WEAPONS, ...SPECIALS, ...ASSISTS, ...PASSIVES].map((x) => x.id);
    expect(new Set(all).size).toBe(all.length);
  });
  it('ссылки целостны', () => {
    for (const c of CLASSES) {
      expect(STAT_TEMPLATES[c.template]).toBeDefined();
      expect(WEAPONS.some((w) => w.id === `${c.weaponKind}_basic`)).toBe(true);
    }
    for (const b of BIOMES) expect(FACTIONS.some((f) => f.id === b.factionId)).toBe(true);
    for (const id of COMMON_SKILLS) {
      expect(skillCost(id)).toBeGreaterThanOrEqual(0);
      expect(['a', 'b', 'c', 'assist', 'special', 'weapon']).toContain(slotOf(id));
    }
  });
  it('объёмы контента соответствуют ТЗ (минимум для MVP)', () => {
    expect(NAMES.cat.length).toBeGreaterThanOrEqual(60);
    expect(NAMES.dog.length).toBeGreaterThanOrEqual(60);
    expect(EPITHETS.length).toBeGreaterThanOrEqual(40);
    expect(SPECIALS.length).toBeGreaterThanOrEqual(12);
    expect(ASSISTS.length).toBeGreaterThanOrEqual(12);
    expect(PASSIVES.filter((p) => p.slot === 'a').length).toBeGreaterThanOrEqual(8);
    expect(PASSIVES.filter((p) => p.slot === 'b').length).toBeGreaterThanOrEqual(8);
    expect(PASSIVES.filter((p) => p.slot === 'c').length).toBeGreaterThanOrEqual(8);
    expect(TRAITS.length).toBeGreaterThanOrEqual(16);
    expect(BIOMES.length).toBe(5);
  });
});
