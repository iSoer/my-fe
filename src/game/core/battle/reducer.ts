import type {
  BattleAction,
  BattleEvent,
  BattleState,
  BattleUnit,
  Effect,
  MapDef,
  Pos,
  ReduceResult,
  Side,
  Stats,
  UnitInstance
} from "../types"
import { STATS, inMap, manhattan, mapSize, posKey, samePos } from "../types"
import { livingUnits, otherSide, unitAt } from "./query"
import { planAssist } from "./assist"
import { moveOrigin, pathTo, reachableTiles, targetsFrom, wallsFrom } from "../map/pathing"
import { simulateCombat } from "../combat"
import { specialMaxCd, unitKit, xpMultiplier } from "../skills/engine"
import { levelGains, visibleStats } from "../units"
import { lootFor } from "../progression"
import { difficultyDef, SKILL_XP, SP, turnLimitOf, XP } from "@game/content/balance"
import { gainSkillXp } from "../units/proficiency"
import { MOVEMENT_SKILLS, type Skill } from "@shared/character/skills"
import { MAX_LEVEL } from "../types"
import { tr } from "@game/i18n"

export interface CreateBattleOptions {
  map: MapDef
  squad: UnitInstance[]
  seed: number
  now: number
}

function makeBattleUnit(
  unit: UnitInstance,
  side: Side,
  pos: Pos,
  stance: BattleUnit["stance"],
  turn: number
): BattleUnit {
  const hp = visibleStats(unit).hp
  return {
    unitId: unit.id,
    side,
    pos: { ...pos },
    hp,
    maxHp: hp,
    specialCd: specialMaxCd(unit) ?? 0,
    acted: false,
    alive: true,
    bonuses: {},
    penalties: {},
    stance,
    flags: {},
    spawnedTurn: turn
  }
}

export function createBattle(opts: CreateBattleOptions): ReduceResult {
  const state: BattleState = {
    id: `b_${opts.seed.toString(36)}_${opts.now.toString(36)}`,
    seed: opts.seed,
    map: opts.map,
    difficulty: opts.map.difficulty,
    turn: 1,
    phase: "player",
    units: {},
    roster: {},
    walls: {},
    decals: [],
    stats: { kills: 0, damage: 0, turns: 0, deaths: [], xpGained: {}, loot: 0 },
    spawnedWaves: [],
    enemyQueue: null,
    startedAt: opts.now
  }
  opts.map.tiles.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t === "wall_breakable") state.walls[posKey({ x, y })] = 2
    })
  )
  opts.squad.forEach((u, i) => {
    const spawn = opts.map.playerSpawns[i]
    if (!spawn) return
    state.roster[u.id] = u
    state.units[u.id] = makeBattleUnit(u, "player", spawn, "advance", 1)
  })
  for (const e of opts.map.enemies) {
    state.roster[e.unit.id] = e.unit
    const bu = makeBattleUnit(e.unit, "enemy", e.pos, e.stance, 1)
    if (e.post) bu.post = { ...e.post }
    if (e.leash !== undefined) bu.leash = e.leash
    state.units[e.unit.id] = bu
  }
  // Вылазка в чащу: ключ от каждого сундука — у одного из его стражей
  if (opts.map.expedition)
    state.expedition = { keys: Object.fromEntries(opts.map.expedition.chests.map(c => [c.id, { unitId: c.keyHolderId }])), opened: [] }
  const events: BattleEvent[] = []
  startPhase(state, "player", events)
  return { state, events }
}

/* ---------- Вспомогательные ---------- */

function applyEffects(state: BattleState, effects: Effect[], events: BattleEvent[]): void {
  for (const e of effects) {
    const u = state.units[e.unitId]
    if (!u || !u.alive) continue
    switch (e.type) {
      case "buff":
        for (const s of STATS) {
          const v = e.stats[s]
          if (v === undefined || v === 0) continue
          u.bonuses[s] = Math.max(u.bonuses[s] ?? 0, v)
        }
        events.push({ type: "effect", effect: e })
        break
      case "debuff":
        for (const s of STATS) {
          const v = e.stats[s]
          if (v === undefined || v === 0) continue
          u.penalties[s] = Math.min(u.penalties[s] ?? 0, v)
        }
        events.push({ type: "effect", effect: e })
        break
      case "heal": {
        const before = u.hp
        u.hp = Math.min(u.maxHp, u.hp + e.amount)
        if (u.hp !== before) events.push({ type: "effect", effect: { ...e, amount: u.hp - before }, hpAfter: u.hp })
        break
      }
      case "damage": {
        const before = u.hp
        u.hp = Math.max(1, u.hp - e.amount)
        if (u.hp !== before) events.push({ type: "effect", effect: { ...e, amount: before - u.hp }, hpAfter: u.hp })
        break
      }
      case "flag":
        u.flags[e.key] = e.value
        break
    }
  }
}

/**
 * Павший с ключом: ключ забирает убивший его боец игрока, иначе (убит врагом, эффектом, пал сам боец игрока)
 * ключ падает на клетку павшего — его подберёт тот, кто на неё встанет.
 */
function passKeys(state: BattleState, u: BattleUnit, killerId: string | undefined, events: BattleEvent[]): void {
  const exp = state.expedition
  if (!exp) return
  const killer = killerId ? state.units[killerId] : undefined
  const taker = killer && killer.alive && killer.side === "player" && u.side === "enemy" ? killer : undefined
  for (const [chestId, spot] of Object.entries(exp.keys)) {
    if (spot.unitId !== u.unitId) continue
    if (taker) {
      exp.keys[chestId] = { unitId: taker.unitId }
      events.push({ type: "keyTaken", chestId, unitId: taker.unitId, pos: { ...u.pos } })
    }
    else {
      exp.keys[chestId] = { pos: { ...u.pos } }
      events.push({ type: "keyDropped", chestId, pos: { ...u.pos } })
    }
  }
}

/**
 * Боец игрока встал на клетку в чаще (любой шаг, в том числе перестановка в пределах хода): подобрал ключ, что
 * лежит на ней, и сразу открыл сундук, если стоит на нём с ключом от него, — содержимое идёт в добычу вылазки.
 * Отдельного действия не нужно, ход бойца не тратится.
 */
function expeditionStepOn(state: BattleState, unitId: string, events: BattleEvent[]): void {
  const exp = state.expedition
  const def = state.map.expedition
  const bu = state.units[unitId]
  if (!exp || !def || !bu || !bu.alive || bu.side !== "player" || state.result) return
  for (const [chestId, spot] of Object.entries(exp.keys)) {
    if (spot.pos && samePos(spot.pos, bu.pos)) {
      exp.keys[chestId] = { unitId }
      events.push({ type: "keyTaken", chestId, unitId, pos: { ...bu.pos } })
    }
  }
  for (const chest of def.chests) {
    if (exp.opened.includes(chest.id) || exp.keys[chest.id]?.unitId !== unitId || !samePos(chest.pos, bu.pos)) continue
    exp.opened.push(chest.id)
    delete exp.keys[chest.id]
    state.stats.loot += chest.treats
    events.push({ type: "chestOpened", chestId: chest.id, unitId, pos: { ...chest.pos }, treats: chest.treats })
  }
}

/**
 * Действие бойца игрока в чаще завершено: всё, что даёт клетка (`expeditionStepOn`), а встал на выход, когда открыт
 * хоть один сундук, — отряд уходит с добычей (победа). Выход — только по завершённому действию, не от перестановки.
 */
function expeditionStep(state: BattleState, unitId: string, events: BattleEvent[]): void {
  expeditionStepOn(state, unitId, events)
  const exp = state.expedition
  const def = state.map.expedition
  const bu = state.units[unitId]
  if (!exp || !def || !bu || !bu.alive || bu.side !== "player" || state.result) return
  if (exp.opened.length > 0 && samePos(bu.pos, def.exit)) {
    events.push({ type: "extracted", unitId, pos: { ...bu.pos } })
    state.result = "victory"
    events.push({ type: "battleEnded", result: "victory" })
  }
}

function killUnit(state: BattleState, u: BattleUnit, killerId: string | undefined, events: BattleEvent[]): void {
  if (!u.alive) return
  u.alive = false
  u.hp = 0
  u.acted = true
  passKeys(state, u, killerId, events)
  state.decals.push({ pos: { ...u.pos }, kind: "pool" })
  if (u.side === "player") state.stats.deaths.push(u.unitId)
  if (killerId && state.units[killerId]?.side === "player") {
    state.stats.kills++
    const killerUnit = state.roster[killerId]
    if (killerUnit)
      state.roster[killerId] = {
        ...killerUnit,
        history: { ...killerUnit.history, kills: killerUnit.history.kills + 1 }
      }
  }
  const killer = killerId ? state.units[killerId] : undefined
  const fx: Effect[] = []
  for (const ally of livingUnits(state, u.side)) {
    const au = state.roster[ally.unitId]
    if (!au) continue
    for (const h of unitKit(au).hooks) fx.push(...(h.onAllyDeath?.(state, ally, u, killer) ?? []))
  }
  applyEffects(state, fx, events)
  const died: BattleEvent = { type: "died", unitId: u.unitId, pos: { ...u.pos }, side: u.side }
  if (killerId) died.killerId = killerId
  events.push(died)
  // Павший враг роняет Вкусняшки: копятся за бой и достаются игроку при любом исходе
  const fallen = state.roster[u.unitId]
  if (u.side === "enemy" && fallen) {
    const amount = lootFor(fallen, difficultyDef(state.difficulty).treatsMult)
    state.stats.loot += amount
    events.push({ type: "loot", unitId: u.unitId, pos: { ...u.pos }, amount })
  }
}

function grantXp(state: BattleState, unitId: string, xp: number, sp: number, events: BattleEvent[]): void {
  const bu = state.units[unitId]
  const unit = state.roster[unitId]
  if (!bu || !unit || !bu.alive || bu.side !== "player") return
  const gainedXp = unit.level >= MAX_LEVEL ? 0 : Math.round(xp * xpMultiplier(unit))
  let next: UnitInstance = { ...unit, xp: unit.xp + gainedXp, sp: unit.sp + sp }
  state.stats.xpGained[unitId] = (state.stats.xpGained[unitId] ?? 0) + gainedXp
  events.push({ type: "xp", unitId, amount: gainedXp, sp })
  while (next.xp >= XP.perLevel && next.level < MAX_LEVEL) {
    const from = next.level
    next = { ...next, level: from + 1, xp: next.xp - XP.perLevel }
    const gains = levelGains(next, from, from + 1)
    const hpGain = gains.hp ?? 0
    bu.maxHp += hpGain
    bu.hp = Math.min(bu.maxHp, bu.hp + hpGain)
    events.push({ type: "levelUp", unitId, level: next.level, gains })
  }
  if (next.level >= MAX_LEVEL) next = { ...next, xp: 0 }
  state.roster[unitId] = next
}

/** Чем схватка закончилась для бойца: урона не нанёс, нанёс, добил. */
export type CombatXpResult = "none" | "hit" | "kill"

/**
 * Опыт за схватку как в Fire Emblem (`XP`): урон — по разнице уровней, добивание — сверху бонус (у вожака больше),
 * без урона — единица. Если боец выше врага, опыт режется на `overlevelPenalty` за уровень, но не меньше `combatMin`.
 */
export function xpForCombat(selfLevel: number, foeLevel: number, result: CombatXpResult, foeIsBoss = false): number {
  if (result === "none") return XP.noDamage
  const diff = foeLevel - selfLevel
  const hit = Math.max(XP.combatMin, Math.min(XP.combatMax, XP.combatBase + XP.combatPerLevelDiff * diff))
  const raw = result === "kill" ? hit + Math.max(0, XP.killBonus + XP.killPerLevelDiff * diff) + (foeIsBoss ? XP.bossBonus : 0) : hit
  const mult = diff < 0 ? Math.max(0, 1 + diff * XP.overlevelPenalty) : 1
  return Math.max(XP.combatMin, Math.round(raw * mult))
}

/** Опыт за лечение: больше вылечил — больше опыта. */
export function xpForHeal(healed: number): number {
  return Math.min(XP.healMax, XP.heal + Math.round(healed * XP.healPerHp))
}

/**
 * Опыт навыков бойца игрока от использования (`SKILL_XP`): множители класса и склонности — в `gainSkillXp`.
 * Новый ранг — событие `rankUp`. Враги после боя не сохраняются, им не начисляется.
 */
function grantSkillXp(state: BattleState, unitId: string, gains: Partial<Record<Skill, number>>, events: BattleEvent[]): void {
  const bu = state.units[unitId]
  const unit = state.roster[unitId]
  if (!bu || !unit || bu.side !== "player") return
  const r = gainSkillXp(unit, gains)
  state.roster[unitId] = r.unit
  for (const up of r.rankUps) events.push({ type: "rankUp", unitId, skill: up.skill, rank: up.rank })
}

/** Каждое действие тренирует передвижение: свой тип класса — быстрее (×3), остальные понемногу. */
const MOVE_TRAINING: Partial<Record<Skill, number>> = Object.fromEntries(MOVEMENT_SKILLS.map(s => [s, SKILL_XP.move]))

function finishAction(state: BattleState, bu: BattleUnit, newStance?: BattleUnit["stance"], events?: BattleEvent[]): void {
  if (events && bu.alive) grantSkillXp(state, bu.unitId, MOVE_TRAINING, events)
  bu.acted = true
  delete bu.turnStart
  bu.penalties = {}
  if (newStance) bu.stance = newStance
}

function checkEnd(state: BattleState, events: BattleEvent[]): boolean {
  if (state.result) return true
  const players = livingUnits(state, "player")
  if (players.length === 0) {
    state.result = "defeat"
    events.push({ type: "battleEnded", result: "defeat" })
    return true
  }
  // Вылазка в чащу: перебить всех мало — победа только уходом с добычей через выход (`expeditionStep`)
  if (state.map.objective === "extract") return false
  const enemies = livingUnits(state, "enemy")
  const allWavesSpawned = state.map.reinforcements.every(w => state.spawnedWaves.includes(w.turn))
  if (state.map.objective === "killBoss") {
    const bossAlive = enemies.some(e => state.roster[e.unitId]?.isBoss)
    const bossExists = Object.values(state.roster).some(u => u.isBoss)
    if (bossExists && !bossAlive) {
      state.result = "victory"
      events.push({ type: "battleEnded", result: "victory" })
      return true
    }
  }
  if (enemies.length === 0 && allWavesSpawned) {
    state.result = "victory"
    events.push({ type: "battleEnded", result: "victory" })
    return true
  }
  return false
}

function spawnReinforcements(state: BattleState, events: BattleEvent[]): void {
  for (const wave of state.map.reinforcements) {
    if (wave.turn !== state.turn || state.spawnedWaves.includes(wave.turn)) continue
    state.spawnedWaves.push(wave.turn)
    const ids: string[] = []
    for (const r of wave.units) {
      let pos = r.pos
      if (unitAt(state, pos)) {
        const alt = [
          { x: pos.x + 1, y: pos.y },
          { x: pos.x - 1, y: pos.y },
          { x: pos.x, y: pos.y + 1 }
        ].find(
          p =>
            inMap(mapSize(state.map), p) && !unitAt(state, p) && state.map.tiles[p.y]?.[p.x] === "plain"
        )
        if (!alt) continue
        pos = alt
      }
      state.roster[r.unit.id] = r.unit
      state.units[r.unit.id] = makeBattleUnit(r.unit, "enemy", pos, "advance", state.turn)
      ids.push(r.unit.id)
    }
    if (ids.length > 0) events.push({ type: "reinforcements", unitIds: ids })
  }
}

function startPhase(state: BattleState, side: Side, events: BattleEvent[]): void {
  state.phase = side
  state.enemyQueue = null
  for (const u of livingUnits(state, side)) {
    u.acted = false
    u.bonuses = {}
    delete u.turnStart
  }
  if (side === "enemy") spawnReinforcements(state, events)
  events.push({ type: "phaseChanged", phase: side, turn: state.turn })
  const fx: Effect[] = []
  for (const u of livingUnits(state, side)) {
    const unit = state.roster[u.unitId]
    if (!unit) continue
    for (const h of unitKit(unit).hooks) fx.push(...(h.onTurnStart?.(state, u) ?? []))
  }
  applyEffects(state, fx, events)
}

function endPhase(state: BattleState, events: BattleEvent[]): void {
  const side = state.phase
  for (const u of livingUnits(state, side)) {
    if (!u.acted) u.penalties = {}
    delete u.turnStart
  }
  if (side === "player") startPhase(state, "enemy", events)
  else if (state.turn >= turnLimitOf(state.map)) {
    // Лимит ходов: отряд отступает — живые бойцы возвращаются, добыча — как при отступлении
    state.result = "retreat"
    state.timeUp = true
    events.push({ type: "battleEnded", result: "retreat" })
  }
  else {
    state.turn++
    state.stats.turns = state.turn
    startPhase(state, "player", events)
  }
}

/**
 * Перемещение в пределах хода от клетки начала хода (`moveOrigin`): боец может переставляться несколько раз,
 * пока не совершит действие. Путь для анимации — от клетки, где он стоит сейчас.
 */
function moveUnit(state: BattleState, bu: BattleUnit, to: Pos, events: BattleEvent[]): void {
  if (manhattan(bu.pos, to) === 0) return
  const origin = moveOrigin(bu)
  const reach = reachableTiles(state, bu)
  const node = reach.get(posKey(to))
  if (!node || !node.canStop) throw new Error(tr("tile unreachable", "клетка недостижима"))
  let path = pathTo(reach, to)
  if (!samePos(bu.pos, origin)) {
    // Уже переставлен: идём от текущей клетки (с запасом хода — дорогу назад бюджет не ограничивает)
    const here = reachableTiles(state, bu, bu.pos, mapSize(state.map).w * mapSize(state.map).h)
    path = here.has(posKey(to)) ? pathTo(here, to) : [{ ...bu.pos }, { ...to }]
  }
  bu.pos = { ...to }
  if (samePos(to, origin)) delete bu.turnStart
  else bu.turnStart = { ...origin }
  events.push({ type: "moved", unitId: bu.unitId, path })
}

function validateActor(state: BattleState, unitId: string): BattleUnit {
  const bu = state.units[unitId]
  if (!bu || !bu.alive) throw new Error(tr("unit unavailable", "юнит недоступен"))
  if (bu.side !== state.phase) throw new Error(tr("not your phase", "не ваша фаза"))
  if (bu.acted) throw new Error(tr("unit has already acted", "юнит уже действовал"))
  return bu
}

/* ---------- Главная функция ---------- */

export function applyAction(prev: BattleState, action: BattleAction): ReduceResult {
  if (prev.result) return { state: prev, events: [] }
  const state = structuredClone(prev)
  const events: BattleEvent[] = []

  switch (action.type) {
    case "endPhase":
      endPhase(state, events)
      break
    case "retreat":
      state.result = "retreat"
      events.push({ type: "battleEnded", result: "retreat" })
      break
    case "move": {
      const bu = validateActor(state, action.unitId)
      moveUnit(state, bu, action.to, events)
      break
    }
    case "wait": {
      const bu = validateActor(state, action.unitId)
      moveUnit(state, bu, action.to, events)
      finishAction(state, bu, action.newStance, events)
      events.push({ type: "waited", unitId: bu.unitId })
      break
    }
    case "attackWall": {
      const bu = validateActor(state, action.unitId)
      moveUnit(state, bu, action.to, events)
      const key = posKey(action.wall)
      if (!wallsFrom(state, bu, bu.pos).some(p => posKey(p) === key)) throw new Error(tr("wall out of reach", "стена недоступна"))
      state.walls[key] = Math.max(0, (state.walls[key] ?? 0) - 1)
      events.push({ type: "wallHit", unitId: bu.unitId, pos: action.wall, hpAfter: state.walls[key] ?? 0 })
      finishAction(state, bu, action.newStance, events)
      break
    }
    case "assist": {
      const bu = validateActor(state, action.unitId)
      moveUnit(state, bu, action.to, events)
      const plan = planAssist(state, bu.unitId, bu.pos, action.targetId)
      if (!plan.valid || !plan.assist) throw new Error(plan.reason ?? tr("Assist not possible", "Поддержка невозможна"))
      const target = state.units[action.targetId] as BattleUnit
      for (const m of plan.moves) {
        const mu = state.units[m.unitId]
        if (mu) mu.pos = { ...m.to }
      }
      for (const b of plan.buffs) applyEffects(state, [{ type: "buff", unitId: b.unitId, stats: b.stats }], [])
      if (plan.targetHpDelta !== 0) target.hp = Math.max(1, Math.min(target.maxHp, target.hp + plan.targetHpDelta))
      if (plan.selfHpDelta !== 0) bu.hp = Math.max(1, Math.min(bu.maxHp, bu.hp + plan.selfHpDelta))
      let healedAll = 0
      if (plan.allHeal > 0) {
        for (const ally of livingUnits(state, bu.side)) {
          if (ally.unitId === bu.unitId || ally.unitId === target.unitId) continue
          const before = ally.hp
          ally.hp = Math.min(ally.maxHp, ally.hp + plan.allHeal)
          healedAll += ally.hp - before
        }
      }
      if (plan.assist.kind === "heal") {
        if (plan.specialTriggered) bu.specialCd = specialMaxCd(state.roster[bu.unitId] as UnitInstance) ?? 0
        else if (state.roster[bu.unitId]?.skills.special) bu.specialCd = Math.max(0, bu.specialCd - 1)
      }
      if (plan.refresh) {
        // Танец: союзник снова действует — и ходит заново от клетки, где стоит
        target.acted = false
        delete target.turnStart
      }
      events.push({
        type: "assist",
        unitId: bu.unitId,
        targetId: target.unitId,
        assistId: plan.assist.id,
        moves: plan.moves,
        heal: plan.heal,
        targetHpAfter: target.hp,
        unitHpAfter: bu.hp
      })
      finishAction(state, bu, action.newStance, events)
      // Лечение — по вылеченному (с лечением всех союзников спецприёмом), танец и Ободрение — фиксированно
      const kind = plan.assist.kind
      const healed = kind === "heal" || kind === "sacrifice" || kind === "reciprocal" ? plan.heal + healedAll : 0
      const xp = healed > 0 ? xpForHeal(healed) : kind === "refresh" ? XP.dance : kind === "rally" ? XP.rally : XP.assist
      grantXp(state, bu.unitId, xp, SP.assist, events)
      // Лечение посохом тренирует белую магию
      const healer = state.roster[bu.unitId]
      if (healed > 0 && healer?.weaponSkill === "whiteMagic") grantSkillXp(state, bu.unitId, { whiteMagic: SKILL_XP.heal }, events)
      break
    }
    case "attack": {
      const bu = validateActor(state, action.unitId)
      moveUnit(state, bu, action.to, events)
      const target = state.units[action.targetId]
      if (!target || !target.alive || target.side === bu.side) throw new Error(tr("target unavailable", "цель недоступна"))
      if (!targetsFrom(state, bu, bu.pos).some(t => t.unitId === target.unitId)) throw new Error(tr("target out of range", "цель вне дальности"))
      resolveCombat(state, bu, target, events)
      finishAction(state, bu, action.newStance ?? (bu.side === "enemy" ? "advance" : undefined), events)
      break
    }
  }

  if (action.type === "move") expeditionStepOn(state, action.unitId, events)
  else if (action.type === "wait" || action.type === "attack" || action.type === "assist" || action.type === "attackWall")
    expeditionStep(state, action.unitId, events)
  checkEnd(state, events)
  return { state, events }
}

function resolveCombat(state: BattleState, bu: BattleUnit, target: BattleUnit, events: BattleEvent[]): void {
  const outcome = simulateCombat(state, bu.unitId, target.unitId, bu.pos)
  const aUnit = state.roster[bu.unitId] as UnitInstance
  const dUnit = state.roster[target.unitId] as UnitInstance

  bu.hp = outcome.attacker.hpAfter
  bu.specialCd = outcome.attacker.cdAfter
  bu.flags = outcome.attacker.flags
  target.hp = outcome.defender.hpAfter
  target.specialCd = outcome.defender.cdAfter
  target.flags = outcome.defender.flags

  const dealtByA = outcome.strikes.filter(s => s.attackerId === bu.unitId).reduce((a, s) => a + s.damage, 0)
  const dealtByD = outcome.strikes.filter(s => s.attackerId === target.unitId).reduce((a, s) => a + s.damage, 0)
  if (bu.side === "player") state.stats.damage += dealtByA
  else state.stats.damage += 0
  if (target.side === "player") state.stats.damage += dealtByD

  const updHistory = (u: UnitInstance, dealt: number, taken: number, hpAfter: number): UnitInstance => ({
    ...u,
    history: {
      ...u.history,
      damageDealt: u.history.damageDealt + dealt,
      damageTaken: u.history.damageTaken + taken,
      closestCall: hpAfter > 0 ? Math.min(u.history.closestCall, hpAfter) : u.history.closestCall
    }
  })
  state.roster[bu.unitId] = updHistory(aUnit, dealtByA, dealtByD, bu.hp)
  state.roster[target.unitId] = updHistory(dUnit, dealtByD, dealtByA, target.hp)

  if (target.side === "enemy" && state.roster[target.unitId]?.isBoss && target.hp < target.maxHp)
    target.stance = "advance"
  if (bu.side === "enemy" && target.hp > 0) bu.stance = "advance"

  events.push({
    type: "combat",
    attackerId: bu.unitId,
    defenderId: target.unitId,
    attackerPos: { ...bu.pos },
    defenderPos: { ...target.pos },
    strikes: outcome.strikes,
    attackerHpBefore: outcome.attacker.hpBefore,
    defenderHpBefore: outcome.defender.hpBefore,
    attackerHpAfter: bu.hp,
    defenderHpAfter: target.hp
  })

  const aDied = bu.hp <= 0
  const dDied = target.hp <= 0
  if (dDied) killUnit(state, target, bu.unitId, events)
  if (aDied) killUnit(state, bu, target.unitId, events)

  applyEffects(state, outcome.afterEffects, events)
  // Эффекты «после боя» (Ярость) могут не убивать — applyEffects оставляет минимум 1 HP.

  // Опыт получает каждый выживший участник: добил — больше всего, нанёс урон — по разнице уровней, иначе — единица
  const aStruck = outcome.strikes.some(s => s.attackerId === bu.unitId)
  const dStruck = outcome.strikes.some(s => s.attackerId === target.unitId)
  const result = (killed: boolean, dealt: number): CombatXpResult => (killed ? "kill" : dealt > 0 ? "hit" : "none")
  // Владение оружием в лапах растёт от каждой схватки: удар, добивание сверху, без урона — понемногу
  const weaponXp = (res: CombatXpResult) => (res === "kill" ? SKILL_XP.hit + SKILL_XP.kill : res === "hit" ? SKILL_XP.hit : SKILL_XP.none)
  if (!aDied) {
    const res = result(dDied, dealtByA)
    const xp = xpForCombat(aUnit.level, dUnit.level, res, !!dUnit.isBoss)
    grantXp(state, bu.unitId, xp, dDied ? SP.kill : aStruck ? SP.combat : 0, events)
    grantSkillXp(state, bu.unitId, { [aUnit.weaponSkill]: weaponXp(res) }, events)
  }
  if (!dDied) {
    const res = result(aDied, dealtByD)
    const xp = xpForCombat(dUnit.level, aUnit.level, res, !!aUnit.isBoss)
    grantXp(state, target.unitId, xp, aDied ? SP.kill : dStruck ? SP.combat : 0, events)
    if (dStruck) grantSkillXp(state, target.unitId, { [dUnit.weaponSkill]: weaponXp(res) }, events)
  }
}

/** Удобный прогноз для UI: статы и исход без мутаций. */
export function forecast(state: BattleState, attackerId: string, defenderId: string, from: Pos) {
  return simulateCombat(state, attackerId, defenderId, from)
}

export function allPlayerUnitsActed(state: BattleState): boolean {
  return livingUnits(state, "player").every(u => u.acted)
}

export function unitStatsInBattle(state: BattleState, unitId: string): Stats | undefined {
  const unit = state.roster[unitId]
  const bu = state.units[unitId]
  if (!unit || !bu) return undefined
  const base = visibleStats(unit)
  const out: Stats = { ...base }
  for (const s of STATS) out[s] = Math.max(0, base[s] + (bu.bonuses[s] ?? 0) + (bu.penalties[s] ?? 0))
  return out
}

export { otherSide, difficultyDef }
