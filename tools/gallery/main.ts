import {
  backdropSvg,
  critterSvg,
  tileSvg,
  furArt,
  eyeArt,
  heroSvg,
  type CritterArt,
  type Pose,
} from '@game/art/index';
import { villageGateSvg, villageHouseSvg, villageTreeSvg, villageWellSvg } from '@game/art/village';
import { BIOMES } from '@game/content/biomes';
import type { TerrainId } from '@game/core/types';

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
    cell(row, critterSvg({ ...base(species, i, i), pose, weapon: 'claw' }), 'critter', pose),
  );
  const row2 = section(`${species}: снаряжение и оружие`);
  const gear: Partial<CritterArt>[] = [
    { moveType: 'armored', weapon: 'fang', weaponColor: '#3a86ff' },
    { moveType: 'cavalry', weapon: 'stick', weaponColor: '#2ec4b6' },
    { moveType: 'flier', weapon: 'claw', weaponColor: '#e63946' },
    { weapon: 'slingshot', weaponColor: '#adb5bd' },
    { weapon: 'burr', weaponColor: '#adb5bd' },
    { weapon: 'bandage', weaponColor: '#adb5bd' },
    { weapon: 'howl', weaponColor: '#3a86ff' },
    { weapon: 'purr', weaponColor: '#adb5bd' },
    { boss: true, angry: true, weapon: 'hiss', weaponColor: '#e63946' },
  ];
  gear.forEach((g, i) =>
    cell(
      row2,
      critterSvg({ ...base(species, (i + 3) % 12, i + 2), ...g }),
      'critter',
      `${g.moveType ?? ''} ${g.weapon ?? ''} ${g.boss ? 'boss' : ''}`,
    ),
  );
}
const rowP = section('палитры (кот)');
for (let i = 0; i < 12; i++)
  cell(rowP, critterSvg({ ...base('cat', i, 0), pattern: 0, accessory: 0 }), 'critter', furArt(i).name);

const terrains: TerrainId[] = ['plain', 'forest', 'mountain', 'water', 'wall', 'wall_breakable', 'cover'];
for (const b of BIOMES) {
  const row = section(`тайлы: ${b.name}`);
  for (const t of terrains) cell(row, tileSvg(b.id, t), 'tile', t);
  const row2 = section(`фоны кинематика: ${b.name}`);
  for (const t of terrains) cell(row2, backdropSvg(b.id, t, 'left'), 'bd', t);
}

// Деревня: герой во всех направлениях, домики, ворота, колодец, деревья
const heroRow = section('Герой: направления и шаг');
for (const facing of ['down', 'up', 'left', 'right'] as const)
  for (let frame = 0; frame < 4; frame++)
    cell(heroRow, heroSvg({ facing, pose: 'walk', frame }), 'critter', `${facing} ${frame}`);
const villageRow = section('Деревня');
cell(
  villageRow,
  villageHouseSvg({ w: 5, h: 3, roof: '#8c3b2e', wall: '#d9b48a', sign: 'Казарма' }),
  'bd',
  'домик',
);
cell(villageRow, villageGateSvg(3, 'За околицу'), 'bd', 'ворота');
cell(villageRow, villageWellSvg(), 'critter', 'колодец');
for (let v = 0; v < 3; v++) cell(villageRow, villageTreeSvg(v), 'critter', `дерево ${v}`);
