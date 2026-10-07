import { describe, expect, it } from 'vitest';
import { createRng, hashString, mixSeed } from '@core/rng';

describe('rng', () => {
  it('детерминирован по seed', () => {
    const a = createRng(123);
    const b = createRng(123);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });
  it('fork даёт независимые, но воспроизводимые стримы', () => {
    const a = createRng(5).fork('x');
    const b = createRng(5).fork('x');
    const c = createRng(5).fork('y');
    expect(a.int(0, 1000)).toBe(b.int(0, 1000));
    expect(a.int(0, 1000)).not.toBe(c.int(0, 1000) + 100000);
  });
  it('int в границах, weighted уважает нулевые веса', () => {
    const r = createRng(9);
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(r.weighted([{ item: 'a', w: 0 }, { item: 'b', w: 1 }])).toBe('b');
    }
  });
  it('hashString и mixSeed стабильны', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(mixSeed(1, 'a')).not.toBe(mixSeed(1, 'b'));
  });
});
