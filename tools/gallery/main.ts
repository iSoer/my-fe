import {
  backdropSvg,
  critterSvg,
  tileSvg,
  furArt,
  eyeArt,
  heroSvg,
  unitSvg,
  FUR_ART,
  HERO_WALK_FRAMES,
  type CritterArt,
  type Pose,
} from '@game/art/index';
import {
  TREE_VARIANTS,
  villageBuildingSvg,
  villageGateSvg,
  villagePlotSvg,
  villageTreeSvg,
} from '@game/art/village';
import { BIOMES } from '@game/content/biomes';
import { BUILDING_IDS, BUILDING_MAX_LEVEL, PLOTS, SORTIE_GATE } from '@game/content/settlement';
import { generateUnit } from '@game/core/units';
import type { TerrainId } from '@game/core/types';
import { CHARACTER_CLASSES, TIER_LEVELS } from '@shared/character/classes';
import { WEAPON_GRADES, WEAPON_SKILLS } from '@shared/character/skills';

// Галерея процедурного арта для глаз разработчика: `pnpm dev` → /tools/gallery/index.html.
// Проверяется `pnpm typecheck` (tools/gallery входит в tsconfig.json) — при смене API арта галерея не скомпилируется.

const app = document.getElementById('app') as HTMLElement;
const section = (title: string): HTMLDivElement => {
  const h = document.createElement('h2');
  h.textContent = title;
  app.appendChild(h);
  const row = document.createElement('div');
  row.className = 'row';
  app.appendChild(row);
  return row;
};
const cell = (row: HTMLElement, svg: string, cls: string, label: string): void => {
  const d = document.createElement('div');
  d.className = 'cell';
  d.innerHTML = `<div class="${cls}">${svg}</div><small>${label}</small>`;
  row.appendChild(d);
};

const base = (species: CritterArt['species'], fur: number, i: number): CritterArt => ({
  species,
  fur: furArt(fur),
  iris: eyeArt(i % 5),
  pattern: i % 4,
  eyes: i % 6,
  accessory: i % 8,
});

const poses: Pose[] = ['idle', 'run', 'hurt', 'dead', 'happy'];
for (const species of ['cat', 'dog', 'mouse'] as const) {
  const row = section(`${species}: позы`);
  poses.forEach((pose, i) =>
    cell(row, critterSvg({ ...base(species, i, i), pose, weapon: 'sword' }), 'critter', pose),
  );
  const row2 = section(`${species}: оружие, материал, передвижение`);
  WEAPON_SKILLS.forEach((weapon, i) => {
    const weaponGrade = WEAPON_GRADES[i % WEAPON_GRADES.length];
    cell(
      row2,
      critterSvg({ ...base(species, (i + 3) % FUR_ART.length, i + 2), weapon, weaponGrade }),
      'critter',
      `${weapon} ${weaponGrade}`,
    );
  });
  const moves: Partial<CritterArt>[] = [
    { moveType: 'armored', weapon: 'axe' },
    { moveType: 'cavalry', weapon: 'spear', mount: 'horse' },
    { moveType: 'flier', weapon: 'spear', mount: 'pegasus' },
    { moveType: 'flier', weapon: 'axe', mount: 'dragon' },
    { boss: true, angry: true, weapon: 'blackMagic' },
    { zombie: true, angry: true, weapon: 'gauntlet' },
  ];
  moves.forEach((g, i) =>
    cell(
      row2,
      critterSvg({ ...base(species, (i + 5) % FUR_ART.length, i + 1), ...g }),
      'critter',
      `${g.moveType ?? ''} ${g.mount ?? ''} ${g.boss ? 'boss' : ''}${g.zombie ? 'zombie' : ''}`,
    ),
  );
}

const rowP = section('палитры (кот)');
FUR_ART.forEach((f, i) =>
  cell(rowP, critterSvg({ ...base('cat', i, 0), pattern: 0, accessory: 0 }), 'critter', f.name),
);

// Классы: наряд, ярус и верховое животное — через настоящего бойца (generateUnit → unitSvg)
const rowC = section('классы');
CHARACTER_CLASSES.forEach((c, i) => {
  try {
    const unit = generateUnit({ seed: 100 + i, level: TIER_LEVELS[c.tier], classId: c.id });
    cell(rowC, unitSvg(unit), 'critter', `${c.id} (${c.tier})`);
  } catch (e) {
    cell(rowC, '', 'critter', `${c.id}: ${(e as Error).message}`);
  }
});

const terrains: TerrainId[] = ['plain', 'forest', 'mountain', 'water', 'wall', 'wall_breakable', 'cover'];
for (const b of BIOMES) {
  const row = section(`тайлы: ${b.name}`);
  for (const t of terrains) cell(row, tileSvg(b.id, t), 'tile', t);
  const row2 = section(`фоны кинематика: ${b.name}`);
  for (const t of terrains) cell(row2, backdropSvg(b.id, t, 'left'), 'bd', t);
}

// Деревня: герой во всех направлениях, здания по уровням, ворота, пустырь, деревья
const heroRow = section('Герой: направления и шаг');
for (const facing of ['down', 'up', 'left', 'right'] as const)
  for (let frame = 0; frame < HERO_WALK_FRAMES; frame++)
    cell(heroRow, heroSvg({ facing, pose: 'walk', frame }), 'critter', `${facing} ${frame}`);

for (const id of BUILDING_IDS) {
  const plot = PLOTS.find((p) => p.building === id);
  if (!plot) continue;
  const row = section(`здание: ${id}`);
  for (let level = 1; level <= BUILDING_MAX_LEVEL; level++)
    cell(row, villageBuildingSvg(id, plot.w, plot.h, level), 'house', `уровень ${level}`);
}
const villageRow = section('Деревня');
cell(villageRow, villageGateSvg(SORTIE_GATE.w), 'house', 'ворота');
cell(villageRow, villagePlotSvg(4), 'house', 'пустое место');
cell(villageRow, villagePlotSvg(4, true), 'house', 'резерв');
for (let v = 0; v < TREE_VARIANTS; v++) cell(villageRow, villageTreeSvg(v), 'critter', `дерево ${v}`);
