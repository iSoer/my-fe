import { describe, expect, it } from 'vitest';
import { compressSave, createEmptySave, decompressSave, parseSave, serializeSave, chunkString } from '@core/save';
import { generateRoster } from '@core/units';
import { generateMap } from '@core/map/generate';
import { createBattle } from '@core/battle/reducer';

describe('save', () => {
  it('пустой сейв проходит валидацию и round-trip', () => {
    const s = createEmptySave(1);
    const r = parseSave(serializeSave(s));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.save).toEqual(s);
  });
  it('сейв с армией и боем сжимается, чанкуется и восстанавливается', () => {
    const s = createEmptySave(1);
    const units = generateRoster({ seed: 3, glory: 0 }).slice(0, 4);
    s.army = { id: 'a', units, squadIds: units.map((u) => u.id), createdAt: 1, battles: 0, wins: 0 };
    const map = generateMap({ seed: 3, biomeId: 'yard', difficulty: 'hard', squadAvgLevel: 1, squadSize: 4, unlockedBiomes: ['yard'] });
    s.battle = createBattle({ map, squad: units, seed: 3, now: 1 }).state;
    const compressed = compressSave(s);
    const chunks = chunkString(compressed);
    expect(chunks.every((c) => c.length <= 4000)).toBe(true);
    const r = decompressSave(chunks.join(''));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.save.battle?.units).toEqual(s.battle.units);
  });
  it('битый JSON и неверная схема отклоняются', () => {
    expect(parseSave('{').ok).toBe(false);
    expect(parseSave('{"version":1}').ok).toBe(false);
  });
});
