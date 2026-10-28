import { atom } from "nanostores"
import type { BuildingId, Facing, LevelUpSummary, Pos, SaveGame, UnitInstance } from "@game/core/types"
import { SQUAD_SIZE } from "@game/core/types"
import { learnableNow, skillCost } from "@game/core/units"
import {
  build,
  buildingLevel,
  levelCost,
  plotStatus,
  reviveStatus,
  revivable,
  revive,
  settleStore,
  settleTraining,
  startTraining,
  stopTraining,
  upgrade,
  upgradable,
  type Outcome,
  type PlotStatus
} from "@game/core/settlement"
import { BUILDING_MAX_LEVEL, PLOTS, buildingDef, type PlaceId } from "@game/content/settlement"
import { tr } from "@game/i18n"
import { $save, updateSave } from "./save"

// Действия поселения для экранов: проверка и изменение сейва — в `core/settlement`, здесь — одно `updateSave`
// на действие (ресурсы и результат меняются вместе или никак).

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false, error: string }

function commit<T>(r: Outcome<T>): ActionResult<Omit<T, "save">> {
  if (!r.ok) return r
  const { save, ...rest } = r as { save: SaveGame } & T
  updateSave(() => save)
  return { ok: true, ...(rest as Omit<T, "save">) }
}

export function buildAction(id: BuildingId, now = Date.now()): ActionResult {
  return commit(build($save.get(), id, now))
}

export function upgradeAction(id: BuildingId, now = Date.now()): ActionResult {
  return commit(upgrade($save.get(), id, now))
}

export function trainAction(unitId: string, now = Date.now()): ActionResult {
  return commit(startTraining($save.get(), unitId, now))
}

export function collectAction(unitId: string, now = Date.now()): ActionResult<{ levelUps: LevelUpSummary[] }> {
  return commit(stopTraining($save.get(), unitId, now))
}

export function reviveAction(entryId: string, now = Date.now()): ActionResult<{ unit: UnitInstance }> {
  return commit(revive($save.get(), entryId, now))
}

/**
 * Догнать время: опыт тренирующимся и смена витрины Лавки. Экран поселения зовёт это при открытии и по таймеру;
 * сейв пишется, только если что-то изменилось.
 */
export function tickSettlement(now = Date.now()): LevelUpSummary[] {
  const s = $save.get()
  const trained = settleTraining(s, now)
  const next = settleStore(trained.save, now)
  if (next !== s) updateSave(() => next)
  return trained.levelUps
}

/* ---------- Состояние экрана ---------- */

/** Открытая карточка места (id места карты) или ворот вылазки. */
export type SettlementPanel = string | "gate"

export const $settlementPanel = atom<SettlementPanel | null>(null)

export function openPanel(id: SettlementPanel): void {
  $settlementPanel.set(id)
}

export function closePanel(): void {
  $settlementPanel.set(null)
}

/** Рядом с каким местом стоит герой (подсветка кнопки панели, «E — открыть»). */
export const $settlementNear = atom<PlaceId | undefined>(undefined)

export function setNearPlace(id: PlaceId | undefined): void {
  if ($settlementNear.get() !== id) $settlementNear.set(id)
}

/** Запомнить, где стоит герой (сцена зовёт это при остановке и уходе, а не каждый кадр). */
export function setHeroSpot(pos: Pos, facing: Facing): void {
  const cur = $save.get().settlement.hero
  if (cur && Math.abs(cur.pos.x - pos.x) < 0.01 && Math.abs(cur.pos.y - pos.y) < 0.01 && cur.facing === facing) return
  updateSave(st => ({ ...st, settlement: { ...st.settlement, hero: { pos: { x: pos.x, y: pos.y }, facing } } }))
}

/** Управление сценой поселения (регистрирует смонтированная сцена) — для панели мест и смоук-тестов. */
export interface SettlementControl {
  /** Переставить героя к входу в место. */
  teleport(id: PlaceId): void
  /** Подойти к месту и открыть его карточку. */
  walkTo(id: PlaceId): void
}

let control: SettlementControl | null = null

export function setSettlementControl(c: SettlementControl | null): void {
  control = c
}

export function settlementControl(): SettlementControl | null {
  return control
}

/* ---------- Подсказки на карте ---------- */

export type SettlementPlace = BuildingId | "gate"

/**
 * «!» над местом: Казармы — ростер пуст, отряд неполон, ждёт награда или кому-то есть что изучить; Лавка —
 * свежая витрина; Кладбище — сегодня можно воскресить; ворота — незаконченный бой.
 */
export function placeAlerts(save: SaveGame, now = Date.now()): Record<SettlementPlace, boolean> {
  const army = save.army
  const learn = !!army?.units.some(u => learnableNow(u).some(id => skillCost(id) <= u.sp))
  const rs = reviveStatus(save, now)
  return {
    barracks: !army || army.units.length < SQUAD_SIZE || army.squadIds.length < SQUAD_SIZE || !!save.rewardChoice || learn,
    training: false,
    store: !!save.settlement.buildings.store && save.store.fresh,
    graveyard: rs.unlocked && rs.readyToday && revivable(save).length > 0,
    gate: !!save.battle && !save.battle.result
  }
}

/** Следующий шаг игрока (подсвечен в нижней панели): идёт бой — к воротам; нет отряда или ждёт награда — в Казармы. */
export function settlementGuide(save: SaveGame): SettlementPlace {
  if (save.battle && !save.battle.result) return "gate"
  const army = save.army
  if (!army || army.units.length === 0 || army.squadIds.length === 0 || save.rewardChoice) return "barracks"
  return "gate"
}

/** Вывеска места на карте: название, строка состояния и подсветки. */
export interface PlaceSign {
  title: string
  sub: string
  status: PlotStatus | "gate"
  alert: boolean
  guide: boolean
  /** Построено ли здание (у ворот — всегда). */
  built: boolean
  /** Уровень здания (0 — не построено; у ворот и пустыря — 0): от него зависит, насколько оно разбито на карте. */
  level: number
}

/** Вывески всех мест: сцена опрашивает их раз в полсекунды и перерисовывает изменившиеся. */
export function placeSigns(save: SaveGame, now = Date.now()): Record<PlaceId, PlaceSign> {
  const alerts = placeAlerts(save, now)
  const guide = settlementGuide(save)
  const canUp = upgradable(save)
  const out: Record<PlaceId, PlaceSign> = {}
  for (const plot of PLOTS) {
    const id = plot.building
    const status = plotStatus(save, plot)
    if (!id) {
      out[plot.id] = { title: `🚧 ${tr("Vacant lot", "Пустырь")}`, sub: `🔒 ${tr("Coming soon", "Скоро")}`, status, alert: false, guide: false, built: false, level: 0 }
      continue
    }
    const def = buildingDef(id)
    const level = buildingLevel(save, id)
    const sub = level > 0
      ? `${"◆".repeat(level)}${"◇".repeat(BUILDING_MAX_LEVEL - level)}${canUp.has(id) ? " ⬆" : ""}`
      : status === "locked" ? `🔒 ${tr("Unavailable", "Недоступно")}` : `🔨 ${levelCost(id, 0) ?? 0} 🦴`
    out[plot.id] = { title: `${def.icon} ${def.name}`, sub, status, alert: alerts[id], guide: guide === id, built: level > 0, level }
  }
  const battleOn = !!save.battle && !save.battle.result
  out["gate"] = {
    title: `⚔️ ${battleOn ? tr("Back to battle", "Вернуться в бой") : tr("Sortie", "Вылазка")}`,
    sub: tr("Beyond the fence", "За околицу"),
    status: "gate",
    alert: alerts.gate,
    guide: guide === "gate",
    built: true,
    level: 0
  }
  return out
}
