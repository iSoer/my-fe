import type { BattleResult, BattleState, Difficulty, MapDef, ObjectiveKind, Rarity, SaveGame, UnitInstance } from "../types"
import { MAX_LEVEL } from "../types"
import { generateMap } from "../map/generate"
import { generateUnit } from "../units"
import { placeMissing } from "../settlement"
import { BUILDING_IDS, HOSPITAL, MAX_BUILDING_LEVEL, atLevel } from "@game/content/buildings"
import { DIFFICULTIES } from "@game/content/balance"
import { WEAPONS } from "@game/content/weapons"
import { TALISMANS } from "@game/content/items"

// Debug-режим: чистые правки сейва и боя для проверки механик (ресурсы, ростер, лагерь, любой бой).
// Только для локального запуска — UI подключается, когда включён `DEBUG` (`state/debug`).

const clampLevel = (n: number): number => Math.max(1, Math.min(MAX_LEVEL, Math.round(n)))

/** Добавить ресурсы (отрицательное — убавить, не ниже 0). */
export function addResources(save: SaveGame, d: { treats?: number, food?: number, glory?: number }): SaveGame {
  const p = save.profile
  return {
    ...save,
    profile: {
      ...p,
      treats: Math.max(0, p.treats + (d.treats ?? 0)),
      food: Math.max(0, p.food + (d.food ?? 0)),
      glory: Math.max(0, p.glory + (d.glory ?? 0))
    }
  }
}

/** Не меньше `min` Вкусняшек и Еды — «бесконечная валюта». `null` — пополнять не нужно. */
export function topUp(save: SaveGame, min: number): SaveGame | null {
  if (save.profile.treats >= min && save.profile.food >= min) return null
  return { ...save, profile: { ...save.profile, treats: Math.max(save.profile.treats, min * 2), food: Math.max(save.profile.food, min * 2) } }
}

/** Открыть все сложности (победы, нужные для открытия) и все звёзды для случайных бойцов. */
export function unlockAll(save: SaveGame): SaveGame {
  const wins = { ...save.profile.wins }
  for (const d of DIFFICULTIES) if (d.unlock) wins[d.unlock.difficulty] = Math.max(wins[d.unlock.difficulty] ?? 0, d.unlock.wins)
  return { ...save, profile: { ...save.profile, wins, maxRarity: 5 } }
}

function mapUnits(save: SaveGame, fn: (u: UnitInstance) => UnitInstance, onlySquad = false): SaveGame {
  const army = save.army
  if (!army) return save
  return { ...save, army: { ...army, units: army.units.map(u => (!onlySquad || army.squadIds.includes(u.id) ? fn(u) : u)) } }
}

/** Уровень всем бойцам (или только отряду); опыт до следующего уровня обнуляется. */
export function setLevels(save: SaveGame, level: number, onlySquad = false): SaveGame {
  const lv = clampLevel(level)
  return mapUnits(save, u => ({ ...u, level: lv, xp: 0 }), onlySquad)
}

/** SP на изучение навыков всем бойцам. */
export function addSp(save: SaveGame, sp: number): SaveGame {
  return mapUnits(save, u => ({ ...u, sp: u.sp + sp }))
}

/** Снять усталость со всех. */
export function clearFatigue(save: SaveGame): SaveGame {
  return mapUnits(save, (u) => {
    const next = { ...u }
    delete next.fatigue
    return next
  })
}

/** Каждого оружия и талисмана — по `count` в инвентарь. */
export function grantAllItems(save: SaveGame, count = 1): SaveGame {
  const inventory = { ...save.inventory }
  for (const id of [...WEAPONS.map(w => w.id), ...TALISMANS.map(t => t.id)]) inventory[id] = (inventory[id] ?? 0) + count
  return { ...save, inventory }
}

/** Новый боец в ростер (вместимость Казарм не проверяется). Армии нет — создаётся. */
export function addRecruit(save: SaveGame, o: { seed: number, level: number, rarity: Rarity, now: number }): SaveGame {
  const unit = { ...generateUnit({ seed: o.seed, level: clampLevel(o.level), rarity: o.rarity, weaponGrade: "wood", now: o.now }), createdAt: o.now }
  const army = save.army ?? { id: `army-${o.seed}`, units: [], squadIds: [], createdAt: o.now, battles: 0, wins: 0 }
  const squadIds = army.squadIds.length < 4 ? [...army.squadIds, unit.id] : army.squadIds
  return { ...save, army: { ...army, units: [...army.units, unit], squadIds } }
}

/** Все здания на уровень `level` (0–5): недостающие встают на свои места, Больница с полными зарядами. */
export function setBuildings(save: SaveGame, level: number): SaveGame {
  const lv = Math.max(0, Math.min(MAX_BUILDING_LEVEL, Math.round(level)))
  const buildings = { ...save.settlement.buildings }
  // Казармы и площадка не сносятся: у них всегда хотя бы 1
  for (const id of BUILDING_IDS) buildings[id] = id === "barracks" || id === "market" ? Math.max(1, lv) : lv
  const layout = { ...save.settlement.layout, buildings: { ...save.settlement.layout.buildings } }
  for (const id of BUILDING_IDS) if (buildings[id] === 0) delete layout.buildings[id]
  const settlement = placeMissing({ ...save.settlement, buildings, layout })
  settlement.hospital = { charges: buildings.hospital > 0 ? atLevel(HOSPITAL.charges, buildings.hospital) : 0 }
  return { ...save, settlement }
}

/** Промотать время лагеря на `ms`: Поля и полигон считают, будто прошло больше. Витрина — по реальным часам. */
export function skipTime(save: SaveGame, ms: number): SaveGame {
  const s = save.settlement
  return {
    ...save,
    settlement: { ...s, fields: { since: s.fields.since - ms }, training: { ...s.training, since: s.training.since - ms } }
  }
}

export interface DebugBattleOptions {
  seed: number
  difficulty: Difficulty
  /** Биом или «random». */
  biomeId: string
  /** Вражеская команда 0–3 (окно уровней сложности). */
  team: number
  /** Уровень всех врагов вместо уровней команды. */
  enemyLevel?: number
  objective?: ObjectiveKind
  /** Без подкреплений. */
  noReinforcements?: boolean
  squadSize: number
}

/** Карта боя по заданным параметрам: та же генерация, что у вылазки, с правками поверх. */
export function debugBattleMap(o: DebugBattleOptions): MapDef {
  const map = generateMap({ seed: o.seed, biomeId: o.biomeId, difficulty: o.difficulty, team: o.team, squadSize: o.squadSize, now: 0 })
  const lv = o.enemyLevel === undefined ? undefined : clampLevel(o.enemyLevel)
  const relevel = (u: UnitInstance): UnitInstance => (lv === undefined ? u : { ...u, level: lv, xp: 0 })
  return {
    ...map,
    ...(o.objective ? { objective: o.objective } : {}),
    enemies: map.enemies.map(e => ({ ...e, unit: relevel(e.unit) })),
    reinforcements: o.noReinforcements ? [] : map.reinforcements.map(w => ({ ...w, units: w.units.map(e => ({ ...e, unit: relevel(e.unit) })) }))
  }
}

/** Закончить бой исходом прямо сейчас: победа — враги пали и волны вышли, поражение — пал отряд. */
export function forceResult(state: BattleState, result: BattleResult): BattleState {
  const next = structuredClone(state)
  const loser = result === "victory" ? "enemy" : result === "defeat" ? "player" : undefined
  if (loser) {
    for (const u of Object.values(next.units)) {
      if (u.side !== loser) continue
      u.hp = 0
      u.alive = false
    }
  }
  if (result === "victory") next.spawnedWaves = next.map.reinforcements.map(w => w.turn)
  next.result = result
  return next
}

/** Все живые враги — на 1 HP. */
export function weakenEnemies(state: BattleState): BattleState {
  const next = structuredClone(state)
  for (const u of Object.values(next.units)) if (u.side === "enemy" && u.alive) u.hp = 1
  return next
}

/** Свои — полное HP и снова могут ходить в этом ходу. */
export function refreshSquad(state: BattleState): BattleState {
  const next = structuredClone(state)
  for (const u of Object.values(next.units)) {
    if (u.side !== "player" || !u.alive) continue
    u.hp = u.maxHp
    u.acted = false
  }
  return next
}
