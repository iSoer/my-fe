import { describe, expect, it } from 'vitest';
import { backdropSvg, critterSvg, tileSvg, unitSvg, unitPartSvg, unitArtKey, furArt, eyeArt, CRITTER_PARTS, type CritterArt, type Pose } from '@art/index';
import { BIOMES } from '@content/biomes';
import { CLASSES } from '@content/classes';
import { generateUnit } from '@core/units';
import type { TerrainId } from '@core/types';

const TERRAINS: TerrainId[] = ['plain', 'forest', 'mountain', 'water', 'wall', 'wall_breakable', 'cover'];
const POSES: Pose[] = ['idle', 'run', 'hurt', 'dead', 'happy', 'carried', 'blink'];

function wellFormed(svg: string): void {
  expect(svg.startsWith('<svg')).toBe(true);
  expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  expect(svg).not.toMatch(/NaN|undefined|null/);
  // парные теги g
  const open = (svg.match(/<g\b/g) ?? []).length;
  const close = (svg.match(/<\/g>/g) ?? []).length;
  expect(open).toBe(close);
}

describe('арт: миниатюры', () => {
  it('все виды × позы × снаряжение дают корректный SVG', () => {
    for (const species of ['cat', 'dog', 'mouse'] as const) {
      for (const pose of POSES) {
        for (const cls of CLASSES) {
          const a: CritterArt = {
            species,
            fur: furArt(cls.weight),
            iris: eyeArt(1),
            pattern: cls.weight % 4,
            eyes: cls.weight % 6,
            accessory: cls.weight % 8,
            moveType: cls.moveType,
            weapon: cls.weaponKind,
            weaponColor: '#e63946',
            pose,
            boss: pose === 'happy',
            angry: pose === 'run',
          };
          wellFormed(critterSvg(a));
        }
      }
    }
  });
  it('animated-вариант содержит CSS-хуки', () => {
    const svg = critterSvg({ species: 'cat', fur: furArt(0), iris: eyeArt(0), pattern: 0, eyes: 0, accessory: 0, animated: true, blinkDelay: -1.5 });
    for (const cls of ['class="tail"', 'class="legs"', 'leg-front', 'leg-back', 'class="head"', 'ear-l', 'class="eyes-open"', 'class="eyes-happy"']) expect(svg).toContain(cls);
    expect(svg).toContain('animation-delay:-1.50s');
  });
  it('части тела для разлёта — корректный SVG для всех видов и классов', () => {
    for (let i = 0; i < 24; i++) {
      const u = generateUnit({ seed: 5000 + i, level: 3, classId: CLASSES[i % CLASSES.length]!.id });
      for (const part of CRITTER_PARTS) wellFormed(unitPartSvg(u, part));
    }
  });
  it('unitSvg работает для сгенерированных бойцов, ключ стабилен', () => {
    for (let i = 0; i < 40; i++) {
      const u = generateUnit({ seed: 1000 + i, level: 5, isEnemy: i % 2 === 0, isBoss: i % 7 === 0 });
      wellFormed(unitSvg(u, { pose: POSES[i % POSES.length] }));
      expect(unitArtKey(u, 'idle')).toBe(unitArtKey({ ...u }, 'idle'));
    }
  });
});

describe('арт: фоны и тайлы', () => {
  it('фоны для всех биомов, клеток и сторон', () => {
    for (const b of BIOMES) for (const t of TERRAINS) for (const side of ['left', 'right'] as const) wellFormed(backdropSvg(b.id, t, side));
  });
  it('тайлы для всех биомов, клеток и кадров анимации', () => {
    for (const b of BIOMES) for (const t of TERRAINS) for (const f of [0, 1, 2]) wellFormed(tileSvg(b.id, t, f));
    // кадры воды действительно различаются
    expect(tileSvg('yard', 'water', 0)).not.toBe(tileSvg('yard', 'water', 1));
    expect(tileSvg('jungle', 'forest', 0)).not.toBe(tileSvg('jungle', 'forest', 1));
  });
});
