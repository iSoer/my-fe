import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { generateRoster, generateUnit, levelGains, statsAtLevel, visibleStats, learnableNow, allowedSkillIds } from '@core/units';
import { STATS } from '@core/types';
import { CLASSES, classDef } from '@content/classes';

describe('generateUnit', () => {
  it('детерминирован по seed', () => {
    const a = generateUnit({ seed: 777, level: 10 });
    const b = generateUnit({ seed: 777, level: 10 });
    expect(a).toEqual(b);
  });
  it('статы и рост в допустимых пределах (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), fc.integer({ min: 1, max: 40 }), (seed, level) => {
        const u = generateUnit({ seed, level });
        for (const s of STATS) {
          expect(u.baseStats[s]).toBeGreaterThanOrEqual(1);
          expect(u.growths[s]).toBeGreaterThanOrEqual(15);
          expect(u.growths[s]).toBeLessThanOrEqual(90);
        }
        const vs = visibleStats(u);
        expect(vs.hp).toBeGreaterThan(0);
        expect(u.learnable.length).toBeGreaterThan(0);
        expect(u.skills.weapon).toBe(`${classDef(u.classId).weaponKind}_basic`);
        if (classDef(u.classId).weaponKind === 'bandage') expect(u.skills.assist).toBe('as_heal');
        if (classDef(u.classId).weaponKind === 'purr') expect(u.skills.assist).toBe('as_purr');
      }),
      { numRuns: 400 },
    );
  });
  it('рост детерминирован и суммарно равен round(growth*39/100)', () => {
    const u = generateUnit({ seed: 31337, level: 1 });
    const s1 = statsAtLevel(u, 1);
    const s40 = statsAtLevel(u, 40);
    for (const s of STATS) expect(s40[s] - s1[s]).toBe(Math.round((u.growths[s] * 39) / 100));
    const gains = levelGains(u, 1, 40);
    expect(Object.values(gains).reduce((a, b) => a + (b ?? 0), 0)).toBe(STATS.reduce((a, s) => a + (s40[s] - s1[s]), 0));
  });
  it('у каждого класса есть изучаемые навыки', () => {
    for (const c of CLASSES) {
      expect(allowedSkillIds(c, 'cat').length).toBeGreaterThan(3);
      expect(allowedSkillIds(c, 'dog').length).toBeGreaterThan(3);
    }
    const u = generateUnit({ seed: 1, level: 1 });
    expect(learnableNow(u).length).toBeGreaterThan(0);
  });
});

describe('generateRoster', () => {
  it('гарантии состава выполняются для многих seed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), fc.integer({ min: 0, max: 700 }), (seed, glory) => {
        const r = generateRoster({ seed, glory });
        expect(r.length).toBe(glory >= 150 ? 10 : 8);
        const kinds = r.map((u) => classDef(u.classId).weaponKind);
        expect(kinds).toContain('bandage');
        expect(kinds.filter((k) => ['claw', 'fang', 'stick'].includes(k)).length).toBeGreaterThanOrEqual(2);
        expect(kinds.some((k) => ['hiss', 'howl', 'growl', 'slingshot', 'burr'].includes(k))).toBe(true);
        expect(kinds.filter((k) => k === 'purr').length).toBeLessThanOrEqual(1);
        expect(r.some((u) => u.species === 'cat')).toBe(true);
        expect(r.some((u) => u.species === 'dog')).toBe(true);
        if (glory >= 300) expect(r.some((u) => u.rarity === 5)).toBe(true);
        if (glory >= 75) expect(r.every((u) => u.level === 3)).toBe(true);
        expect(new Set(r.map((u) => u.id)).size).toBe(r.length);
      }),
      { numRuns: 150 },
    );
  });
  it('детерминирован', () => {
    expect(generateRoster({ seed: 5, glory: 0 })).toEqual(generateRoster({ seed: 5, glory: 0 }));
  });
});
