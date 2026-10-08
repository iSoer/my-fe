import type { Rng } from '../rng';
import { createRng, makeId } from '../rng';
import type { Appearance, Gender, Rarity, Species, Stat, Stats, UnitInstance, UnitSkills, WeaponKind } from '../types';
import { MAX_LEVEL, STATS, addStats, clamp } from '../types';
import type { ClassDef, PassiveDef, WeaponDef } from '../skills/types';
import { permanentBonus, unitKit, invalidateKit } from '../skills/engine';
import { CLASSES, classDef, className } from '@content/classes';
import { STAT_TEMPLATES } from '@content/archetypes';
import { basicWeaponId, weaponDef, weaponsForKind } from '@content/weapons';
import { SPECIALS } from '@content/skills/specials';
import { ASSISTS } from '@content/skills/assists';
import { PASSIVES } from '@content/skills/passives';
import { TRAITS } from '@content/traits';
import { BOSS_TITLES, EPITHETS, NAMES } from '@content/names';
import { BREEDS } from '@content/breeds';
import { PERSONALITIES } from '@content/personalities';
import { ACCESSORIES, EYES, EYE_COLORS, FUR_PALETTES, PATTERNS } from '@content/appearance';
import { COMBAT, ROSTER, gloryTier } from '@content/balance';
import { factionDef } from '@content/factions';

/* ---------- Статы и рост ---------- */

const RARITY_SKILL_POOL: Record<Rarity, number> = { 1: 3, 2: 3, 3: 4, 4: 4, 5: 5 };

/** Уровни (2..40), на которых стат растёт — детерминированная перестановка по seed. */
function growthLevels(unit: UnitInstance, stat: Stat): Set<number> {
  const gain = Math.round((unit.growths[stat] * (MAX_LEVEL - 1)) / 100);
  const rng = createRng(unit.seed).fork(`growth:${stat}`);
  const levels: number[] = [];
  for (let l = 2; l <= MAX_LEVEL; l++) levels.push(l);
  const order = rng.shuffle(levels);
  return new Set(order.slice(0, clamp(gain, 0, levels.length)));
}

const growthCache = new Map<string, Record<Stat, Set<number>>>();
function growthTable(unit: UnitInstance): Record<Stat, Set<number>> {
  const key = `${unit.seed}:${unit.growths.hp}:${unit.growths.atk}:${unit.growths.spd}:${unit.growths.def}:${unit.growths.res}`;
  let t = growthCache.get(key);
  if (!t) {
    t = {
      hp: growthLevels(unit, 'hp'),
      atk: growthLevels(unit, 'atk'),
      spd: growthLevels(unit, 'spd'),
      def: growthLevels(unit, 'def'),
      res: growthLevels(unit, 'res'),
    };
    growthCache.set(key, t);
  }
  return t;
}

/** Статы уровня `level` без оружия и навыков. */
export function statsAtLevel(unit: UnitInstance, level: number): Stats {
  const t = growthTable(unit);
  const out: Stats = { ...unit.baseStats };
  for (const s of STATS) {
    let gained = 0;
    for (const l of t[s]) if (l <= level) gained++;
    out[s] += gained;
  }
  return out;
}

/** Прирост статов между уровнями. */
export function levelGains(unit: UnitInstance, from: number, to: number): Partial<Stats> {
  const a = statsAtLevel(unit, from);
  const b = statsAtLevel(unit, to);
  const gains: Partial<Stats> = {};
  for (const s of STATS) if (b[s] !== a[s]) gains[s] = b[s] - a[s];
  return gains;
}

export function weaponMt(unit: UnitInstance): number {
  return weaponDef(unit.skills.weapon).mt + unit.weaponTier * COMBAT.weaponTierMt;
}

/** Видимые статы вне боя: уровень + Mt оружия + постоянные бонусы. */
export function visibleStats(unit: UnitInstance): Stats {
  const base = statsAtLevel(unit, unit.level);
  const withWeapon = addStats(base, { atk: weaponMt(unit) });
  const withBonus = addStats(withWeapon, permanentBonus(unit));
  return {
    hp: Math.max(1, withBonus.hp),
    atk: Math.max(0, withBonus.atk),
    spd: Math.max(0, withBonus.spd),
    def: Math.max(0, withBonus.def),
    res: Math.max(0, withBonus.res),
  };
}

export function statTotal(s: Stats): number {
  return s.hp + s.atk + s.spd + s.def + s.res;
}

/* ---------- Отображение ---------- */

export function displayName(unit: UnitInstance): string {
  return unit.epithet ? `${unit.name} ${unit.epithet}` : unit.name;
}

export function unitClassName(unit: UnitInstance): string {
  return className(classDef(unit.classId), unit.species, unit.gender);
}

export function unitWeapon(unit: UnitInstance): WeaponDef {
  return weaponDef(unit.skills.weapon);
}

export function unitClass(unit: UnitInstance): ClassDef {
  return classDef(unit.classId);
}

/* ---------- Пулы навыков ---------- */

function passiveAllowed(p: PassiveDef, cls: ClassDef): boolean {
  if (!p.allow) return true;
  if (p.allow.moveTypes && !p.allow.moveTypes.includes(cls.moveType)) return false;
  if (p.allow.weaponKinds && !p.allow.weaponKinds.includes(cls.weaponKind)) return false;
  if (p.allow.notWeaponKinds && p.allow.notWeaponKinds.includes(cls.weaponKind)) return false;
  return true;
}

/** Все навыки, которые класс/вид в принципе может изучить (без v1.1). */
export function allowedSkillIds(cls: ClassDef, species: Species): string[] {
  const out: string[] = [];
  const isStaff = cls.weaponKind === 'bandage';
  const isPurr = cls.weaponKind === 'purr';
  for (const s of SPECIALS) {
    if (s.stage === 'v1.1') continue;
    if (s.onlySpecies && s.onlySpecies !== species) continue;
    if (s.staffOnly !== isStaff && (s.staffOnly || isStaff)) continue;
    out.push(s.id);
  }
  for (const a of ASSISTS) {
    if (a.stage === 'v1.1') continue;
    if (a.staffOnly && !isStaff) continue;
    if (a.purrOnly && !isPurr) continue;
    if (isPurr && a.kind === 'refresh') continue; // Мурлыканье выдаётся автоматически
    out.push(a.id);
  }
  for (const p of PASSIVES) {
    if (p.stage === 'v1.1') continue;
    if (!passiveAllowed(p, cls)) continue;
    out.push(p.id);
  }
  for (const w of weaponsForKind(cls.weaponKind)) if (w.variant !== 'basic') out.push(w.id);
  return out;
}

/** Общие навыки, доступные всем без пула. */
export const COMMON_SKILLS = ['a_atk3', 'a_spd3', 'a_def3', 'a_res3', 'a_hp5', 'as_rally_atk', 'as_rally_def'];

export function slotOf(skillId: string): keyof UnitSkills {
  if (SPECIALS.some((s) => s.id === skillId)) return 'special';
  if (ASSISTS.some((a) => a.id === skillId)) return 'assist';
  const p = PASSIVES.find((x) => x.id === skillId);
  if (p) return p.slot;
  return 'weapon';
}

/** Что боец может изучить сейчас (не изучено, в пуле или общее). */
export function learnableNow(unit: UnitInstance): string[] {
  const set = new Set<string>([...unit.learnable, ...COMMON_SKILLS]);
  const cls = classDef(unit.classId);
  const allowed = new Set(allowedSkillIds(cls, unit.species));
  return [...set].filter((id) => !unit.learned.includes(id) && (allowed.has(id) || COMMON_SKILLS.includes(id)));
}

export function skillCost(skillId: string): number {
  const s = SPECIALS.find((x) => x.id === skillId);
  if (s) return s.spCost;
  const a = ASSISTS.find((x) => x.id === skillId);
  if (a) return a.spCost;
  const p = PASSIVES.find((x) => x.id === skillId);
  if (p) return p.spCost;
  return weaponDef(skillId).spCost;
}

/* ---------- Генерация ---------- */

/** Веса видов для бойцов игрока: мыши редки, но бывают. */
export const DEFAULT_SPECIES_WEIGHTS: Record<Species, number> = { cat: 45, dog: 45, mouse: 10 };

export interface GenerateUnitOptions {
  seed: number;
  level: number;
  rarity?: Rarity;
  rarityWeights?: Record<Rarity, number>;
  species?: Species;
  speciesWeights?: Record<Species, number>;
  classId?: string;
  isEnemy?: boolean;
  factionId?: string;
  isBoss?: boolean;
  /** Выдавать ли Особенность (у игрока — всегда). */
  withTrait?: boolean;
  now?: number;
}

function pickClass(rng: Rng, exclude: Set<string>): ClassDef {
  const items = CLASSES.filter((c) => !exclude.has(c.id)).map((c) => ({ item: c, w: c.weight }));
  return rng.weighted(items);
}

function pickRarity(rng: Rng, weights: Record<Rarity, number>): Rarity {
  return rng.weighted(([1, 2, 3, 4, 5] as Rarity[]).map((r) => ({ item: r, w: weights[r] })));
}

function pickAppearance(rng: Rng, build: 0 | 1 | 2, palettes?: number[]): Appearance {
  return {
    build,
    furPalette: palettes && palettes.length > 0 ? rng.pick(palettes) : rng.int(0, FUR_PALETTES.length - 1),
    pattern: rng.int(0, PATTERNS.length - 1),
    eyes: rng.int(0, EYES.length - 1),
    eyeColor: rng.int(0, EYE_COLORS.length - 1),
    accessory: rng.int(0, ACCESSORIES.length - 1),
  };
}

export function generateUnit(opts: GenerateUnitOptions): UnitInstance {
  const root = createRng(opts.seed);
  const r = {
    species: root.fork('species'),
    name: root.fork('name'),
    cls: root.fork('class'),
    rarity: root.fork('rarity'),
    stats: root.fork('stats'),
    skills: root.fork('skills'),
    look: root.fork('look'),
    trait: root.fork('trait'),
  };

  const species: Species =
    opts.species ??
    r.species.weighted((Object.entries(opts.speciesWeights ?? DEFAULT_SPECIES_WEIGHTS) as [Species, number][]).map(([item, w]) => ({ item, w })));
  const breed = r.species.pick(BREEDS.filter((b) => b.species === species));
  const nameEntry = r.name.pick(NAMES[species]);
  const gender: Gender = nameEntry.gender;
  let epithet: string | undefined;
  if (opts.isBoss) {
    const t = r.name.pick(BOSS_TITLES);
    epithet = gender === 'm' ? t[0] : t[1];
  } else if (r.name.chance(0.6)) {
    const e = r.name.pick(EPITHETS);
    epithet = gender === 'm' ? e[0] : e[1];
  }

  const cls = opts.classId ? classDef(opts.classId) : pickClass(r.cls, new Set());
  const rarity: Rarity = opts.rarity ?? pickRarity(r.rarity, opts.rarityWeights ?? gloryTier(0).rarityWeights);

  // Статы
  const tpl = STAT_TEMPLATES[cls.template];
  const base: Stats = { ...tpl.base };
  const growths: Stats = { ...tpl.growth };
  // Редкость: ±2 на звезду относительно ★3
  const rarityDelta = (rarity - 3) * 2;
  for (let i = 0; i < Math.abs(rarityDelta); i++) {
    const s = r.stats.pick(STATS);
    base[s] += Math.sign(rarityDelta);
  }
  // Видовой сдвиг
  if (species === 'cat') {
    base.spd += 1;
    base.hp -= 1;
  } else if (species === 'dog') {
    base.hp += 1;
    base.spd -= 1;
  } else {
    base.spd += 2;
    base.hp -= 2;
  }
  // Талант/Изъян
  let asset: Stat | undefined;
  let flaw: Stat | undefined;
  if (r.stats.chance(0.7)) {
    const pair = r.stats.shuffle(STATS);
    asset = pair[0];
    flaw = pair[1];
    if (asset && flaw) {
      base[asset] += 3;
      base[flaw] -= 3;
      growths[asset] += 10;
      growths[flaw] -= 10;
    }
  }
  for (const s of STATS) {
    growths[s] = clamp(growths[s] + r.stats.int(-10, 10), 15, 90);
    base[s] = Math.max(s === 'hp' ? 10 : 1, base[s]);
  }
  if (opts.isBoss) for (const s of STATS) base[s] += 3;

  // Навыки
  const skills: UnitSkills = { weapon: basicWeaponId(cls.weaponKind) };
  const learned: string[] = [];
  const allowed = allowedSkillIds(cls, species);
  const specials = allowed.filter((id) => SPECIALS.some((s) => s.id === id));
  const assists = allowed.filter((id) => ASSISTS.some((a) => a.id === id && !a.staffOnly));
  const passives = allowed.filter((id) => PASSIVES.some((p) => p.id === id));

  if (cls.weaponKind === 'bandage') {
    skills.assist = 'as_heal';
    learned.push('as_heal');
  }
  if (cls.weaponKind === 'purr') {
    skills.assist = 'as_purr';
    learned.push('as_purr');
  }
  if (specials.length > 0) {
    const sp = r.skills.pick(specials);
    skills.special = sp;
    learned.push(sp);
  }
  const extraCount = rarity <= 2 ? 0 : rarity <= 4 ? 1 : 2;
  for (let i = 0; i < extraCount; i++) {
    const wantAssist = !skills.assist && assists.length > 0 && r.skills.chance(0.4);
    if (wantAssist) {
      const a = r.skills.pick(assists);
      skills.assist = a;
      learned.push(a);
    } else {
      const freeSlots = (['a', 'b', 'c'] as const).filter((sl) => !skills[sl]);
      const cands = passives.filter((id) => !learned.includes(id) && freeSlots.includes((PASSIVES.find((p) => p.id === id) as PassiveDef).slot));
      if (cands.length === 0) continue;
      const p = r.skills.pick(cands);
      skills[(PASSIVES.find((x) => x.id === p) as PassiveDef).slot] = p;
      learned.push(p);
    }
  }
  const poolCands = r.skills.shuffle(allowed.filter((id) => !learned.includes(id)));
  const learnable = poolCands.slice(0, RARITY_SKILL_POOL[rarity]);

  // Особенность
  let traitId: string | undefined;
  const withTrait = opts.withTrait ?? !opts.isEnemy;
  if (withTrait || opts.isBoss) {
    const traits = TRAITS.filter(
      (t) => (!t.onlySpecies || t.onlySpecies === species) && !(t.notWeaponKinds ?? []).includes(cls.weaponKind as WeaponKind),
    );
    traitId = r.trait.weighted(traits.map((t) => ({ item: t.id, w: t.rare ? 1 : 4 })));
  }

  const palettes = opts.factionId ? factionDef(opts.factionId).palettes : undefined;
  const appearance = pickAppearance(r.look, breed.build, palettes);
  const personality = r.look.pick(PERSONALITIES);

  const unit: UnitInstance = {
    id: makeId(opts.isEnemy ? 'e' : 'u', opts.seed),
    seed: opts.seed,
    name: nameEntry.name,
    gender,
    species,
    breedId: breed.id,
    personalityId: personality.id,
    classId: cls.id,
    rarity,
    level: clamp(opts.level, 1, MAX_LEVEL),
    xp: 0,
    sp: 0,
    baseStats: base,
    growths,
    weaponTier: 0,
    skills,
    learned,
    learnable,
    appearance,
    history: { battles: 0, kills: 0, damageDealt: 0, damageTaken: 0, closestCall: 999 },
    createdAt: opts.now ?? 0,
  };
  if (epithet) unit.epithet = epithet;
  if (asset) unit.asset = asset;
  if (flaw) unit.flaw = flaw;
  if (traitId) unit.traitId = traitId;
  if (opts.isEnemy) unit.isEnemy = true;
  if (opts.isBoss) unit.isBoss = true;
  if (opts.factionId) unit.factionId = opts.factionId;
  return unit;
}

/* ---------- Ростер ---------- */

export interface RosterOptions {
  seed: number;
  glory: number;
  size?: number;
  now?: number;
}

function hasRole(units: UnitInstance[], pred: (c: ClassDef) => boolean): boolean {
  return units.some((u) => pred(classDef(u.classId)));
}

/** Ростер с гарантиями SPEC 5.3. Детерминирован по seed. */
export function generateRoster(opts: RosterOptions): UnitInstance[] {
  const tier = gloryTier(opts.glory);
  const size = opts.size ?? (opts.glory >= 150 ? ROSTER.sizeWithGlory150 : ROSTER.size);
  const startLevel = opts.glory >= 75 ? 3 : 1;
  const root = createRng(opts.seed);
  const guaranteeFive = opts.glory >= 300;

  for (let attempt = 0; attempt < 200; attempt++) {
    const rng = root.fork(`attempt:${attempt}`);
    const units: UnitInstance[] = [];
    let purrCount = 0;
    for (let i = 0; i < size; i++) {
      const seed = rng.int(0, 0x7fffffff);
      let u = generateUnit({ seed, level: startLevel, rarityWeights: tier.rarityWeights, now: opts.now });
      if (classDef(u.classId).weaponKind === 'purr') {
        purrCount++;
        if (purrCount > 1) u = generateUnit({ seed, level: startLevel, rarityWeights: tier.rarityWeights, classId: 'infantry_claw', now: opts.now });
      }
      units.push(u);
    }
    if (guaranteeFive && !units.some((u) => u.rarity === 5)) {
      const idx = rng.int(0, units.length - 1);
      const old = units[idx] as UnitInstance;
      units[idx] = generateUnit({ seed: old.seed, level: startLevel, rarity: 5, classId: old.classId, now: opts.now });
    }
    const ok =
      hasRole(units, (c) => c.weaponKind === 'bandage') &&
      units.filter((u) => ['claw', 'fang', 'stick'].includes(classDef(u.classId).weaponKind)).length >= 2 &&
      hasRole(units, (c) => ['hiss', 'howl', 'growl', 'slingshot', 'burr'].includes(c.weaponKind)) &&
      hasRole(units, (c) => ['claw', 'hiss'].includes(c.weaponKind)) &&
      hasRole(units, (c) => ['fang', 'howl'].includes(c.weaponKind)) &&
      hasRole(units, (c) => ['stick', 'growl'].includes(c.weaponKind)) &&
      units.some((u) => u.species === 'cat') &&
      units.some((u) => u.species === 'dog');
    if (ok) return units;
  }
  // Фолбэк: собрать вручную
  const rng = root.fork('fallback');
  const forced = ['infantry_bandage', 'infantry_claw', 'infantry_fang', 'infantry_stick', 'infantry_slingshot', 'infantry_howl', 'armor_claw', 'cavalry_stick'];
  return forced.slice(0, size).map((classId, i) =>
    generateUnit({
      seed: rng.int(0, 0x7fffffff),
      level: startLevel,
      classId,
      rarityWeights: tier.rarityWeights,
      species: i % 2 === 0 ? 'cat' : 'dog',
      now: opts.now,
    }),
  );
}

/* ---------- Изменения бойца (чистые) ---------- */

export function withSkills(unit: UnitInstance, patch: Partial<UnitSkills>): UnitInstance {
  const next: UnitInstance = { ...unit, skills: { ...unit.skills, ...patch } };
  invalidateKit(unit);
  return next;
}

export function learnSkill(unit: UnitInstance, skillId: string): UnitInstance {
  if (unit.learned.includes(skillId)) return unit;
  const cost = skillCost(skillId);
  if (unit.sp < cost) throw new Error('not enough SP');
  const slot = slotOf(skillId);
  const next: UnitInstance = {
    ...unit,
    sp: unit.sp - cost,
    learned: [...unit.learned, skillId],
    skills: { ...unit.skills, [slot]: skillId },
  };
  return next;
}

export function equipSkill(unit: UnitInstance, skillId: string | undefined, slot: keyof UnitSkills): UnitInstance {
  if (slot === 'weapon' && !skillId) throw new Error('weapon required');
  if (skillId && !unit.learned.includes(skillId) && !(slot === 'weapon' && skillId === basicWeaponId(classDef(unit.classId).weaponKind)))
    throw new Error('skill not learned');
  const skills = { ...unit.skills };
  if (skillId) skills[slot] = skillId as string;
  else delete skills[slot];
  return { ...unit, skills };
}

export { unitKit };
