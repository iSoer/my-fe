import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import type { UnitInstance } from "@game/core/types"
import { XP } from "@game/content/balance"
import {
  DISHES,
  FIELDS,
  FOOD,
  MAX_BUILDING_LEVEL,
  TRAINING,
  atLevel,
  buildingDef,
  type BuildingDef,
  type BuildingId
} from "@game/content/buildings"
import {
  accrueTraining,
  buildingLevel,
  canUpgrade,
  fatigueOf,
  fieldsStored,
  hospitalCharges,
  isTraining,
  mealSlots,
  nextLevelCost,
  rosterCap,
  trainees,
  trainingCap,
  trainingGain,
  type TrainingLevelUp
} from "@game/core/settlement"
import { displayName } from "@game/core/units"
import {
  $save,
  collectFoodAction,
  collectTrainingAction,
  cureFatigueAction,
  sellFoodAction,
  setTrainingAction,
  upgradeBuildingAction
} from "@game/state/save"
import { haptic } from "@game/platform/haptics"
import { Button } from "./Button"
import { UnitRow } from "./UnitRow"
import { UnitStatusChips, fatigueHint } from "./UnitStatus"
import { stagger } from "../lib/animate"
import { tr } from "@game/i18n"

// Здания лагеря: карточка для экрана Поселения, сводка здания в лагере и панели механик (полигон, Больница,
// Поля, Столовая) — одни и те же на обоих экранах.

export type Toast = (msg: string, error?: boolean) => void

/** Текущее время, обновляемое раз в `ms` (таймеры полей, полигона и витрины). */
export function useNow(ms = 15000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return now
}

export function levelLabel(level: number): string {
  return level === 0 ? tr("Not built", "Не построено") : `${tr("Lv.", "Ур.")} ${level}/${MAX_BUILDING_LEVEL}`
}

/** Короткое состояние механики здания на его карточке. */
export function statusLine(id: BuildingId, now: number): string | null {
  const save = $save.get()
  if (buildingLevel(save, id) === 0) return null
  switch (id) {
    case "barracks":
      return tr(`Roster ${save.army?.units.length ?? 0}/${rosterCap(save)}`, `Ростер ${save.army?.units.length ?? 0}/${rosterCap(save)}`)
    case "market":
      return tr("New stock every hour", "Новый товар каждый час")
    case "training":
      return tr(`Training: ${trainees(save).length}/${TRAINING.slots}`, `Тренируются: ${trainees(save).length}/${TRAINING.slots}`)
    case "hospital": {
      const tired = save.army?.units.filter(u => fatigueOf(u) > 0).length ?? 0
      return tr(`Beds ${save.settlement.hospital.charges}/${hospitalCharges(save)} · tired ${tired}`, `Мест ${save.settlement.hospital.charges}/${hospitalCharges(save)} · уставших ${tired}`)
    }
    case "canteen":
      return tr(`Feeds ${mealSlots(save)} before a sortie`, `Кормит ${mealSlots(save)} перед вылазкой`)
    case "fields": {
      const level = buildingLevel(save, "fields")
      return tr(`Barn ${fieldsStored(save, now)}/${atLevel(FIELDS.storage, level)} 🌾`, `Амбар ${fieldsStored(save, now)}/${atLevel(FIELDS.storage, level)} 🌾`)
    }
  }
}

/** Карточка здания на экране Поселения: уровень, эффект «сейчас / дальше», постройка (место выбирается в лагере) и улучшение. */
export function BuildingCard({ def, index, now, onOpen, onBuild, toast }: {
  def: BuildingDef
  index: number
  now: number
  onOpen: (id: BuildingId) => void
  onBuild: (id: BuildingId) => void
  toast: Toast
}) {
  const save = useStore($save)
  const level = buildingLevel(save, def.id)
  const cost = nextLevelCost(save, def.id)
  const check = canUpgrade(save, def.id)
  const status = statusLine(def.id, now)
  const upgrade = () => {
    if (level === 0) return onBuild(def.id)
    const r = upgradeBuildingAction(def.id)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("success")
    toast(tr(`${def.name}: level ${level + 1}`, `${def.name}: уровень ${level + 1}`))
  }
  return (
    <div className={`card bld-card pop-in${level === 0 ? " is-empty" : ""}`} style={stagger(index, 50)}>
      <div className="bld-head">
        <span className="bld-ico" aria-hidden="true">{def.icon}</span>
        <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
          <b>{def.name}</b>
          <span className="bld-pips" aria-label={levelLabel(level)}>
            {Array.from({ length: MAX_BUILDING_LEVEL }, (_, i) => <i key={i} className={i < level ? "on" : ""} />)}
            <span className="muted small">{levelLabel(level)}</span>
          </span>
        </div>
        {level > 0 && (
          <Button sm onClick={() => onOpen(def.id)}>
            {tr("Open", "Открыть")}
          </Button>
        )}
      </div>
      <p className="muted small bld-desc">{def.desc}</p>
      {status && <div className="bld-status small">{status}</div>}
      <div className="bld-effects small">
        {level > 0 && (
          <div>
            <span className="muted">{tr("Now: ", "Сейчас: ")}</span>
            {def.effect(level)}
          </div>
        )}
        {cost && (
          <div>
            <span className="muted">{level === 0 ? tr("Gives: ", "Даст: ") : tr("Next: ", "Дальше: ")}</span>
            {def.effect(level + 1)}
          </div>
        )}
      </div>
      {cost
        ? (
            <div className="bld-foot">
              <span className="muted small grow">
                {cost.rosterLevel > 1 && tr(`Roster Lv. ${cost.rosterLevel}+`, `Ростер ур. ${cost.rosterLevel}+`)}
                {!check.ok && <span className="bld-why">{` ${check.error}`}</span>}
              </span>
              <Button sm primary={check.ok} disabled={!check.ok} onClick={upgrade}>
                {`${level === 0 ? tr("Build", "Построить") : tr("Upgrade", "Улучшить")} · 🦴 ${cost.treats}${cost.food ? ` · 🌾 ${cost.food}` : ""}`}
              </Button>
            </div>
          )
        : <div className="bld-foot muted small">{tr("Top level reached", "Наивысший уровень")}</div>}
    </div>
  )
}

/* ---------- Панели зданий ---------- */

export function TrainingPanel({ now, toast, onLevelUps }: { now: number, toast: Toast, onLevelUps: (l: TrainingLevelUp[]) => void }) {
  const raw = useStore($save)
  const [picking, setPicking] = useState(false)
  // Предпросмотр: опыт за время, ещё не записанный в сейв
  const save = accrueTraining(raw, now)
  const level = buildingLevel(save, "training")
  const cap = trainingCap(save)
  const list = trainees(save)
  const candidates = (save.army?.units ?? []).filter(u => !isTraining(save, u.id))
  const total = list.reduce((a, u) => a + trainingGain(save, u), 0)
  const toggle = (u: UnitInstance, on: boolean) => {
    const r = setTrainingAction(u.id, on)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("select")
    setPicking(false)
    if (r.levelUps?.length) onLevelUps(r.levelUps)
  }
  const collect = () => {
    const r = collectTrainingAction()
    if (r.xp === 0) return toast(tr("Nothing to collect yet", "Пока нечего забирать"), true)
    haptic("success")
    toast(tr(`+${r.xp} XP collected`, `Забрано опыта: ${r.xp}`))
    if (r.levelUps.length) onLevelUps(r.levelUps)
  }
  if (picking) {
    return (
      <div className="stack">
        <p className="muted small">{tr("Who goes to train? Squad fighters leave the squad.", "Кого отправить тренироваться? Боец отряда покинет отряд.")}</p>
        {candidates.map((u, i) => (
          <UnitRow
            key={u.id}
            unit={u}
            index={i}
            friendly
            dim={u.level >= cap}
            tags={<UnitStatusChips unit={u} />}
            right={u.level >= cap ? <span className="muted small">{tr("at the limit", "на пределе")}</span> : undefined}
            onClick={() => toggle(u, true)}
          />
        ))}
        {candidates.length === 0 && <p className="muted">{tr("Everyone is already here.", "Все уже здесь.")}</p>}
        <Button block ghost onClick={() => setPicking(false)}>{tr("Back", "Назад")}</Button>
      </div>
    )
  }
  return (
    <div className="stack">
      <p className="muted small">
        {tr(
          `${atLevel(TRAINING.xpPerBattle, level)} XP per squad battle and ${atLevel(TRAINING.xpPerHour, level)} XP per hour (counted up to ${atLevel(TRAINING.maxHours, level)} h away). Limit: Lv. ${Math.max(0, cap)} — one below your strongest fighter.`,
          `${atLevel(TRAINING.xpPerBattle, level)} опыта за каждый бой отряда и ${atLevel(TRAINING.xpPerHour, level)} в час (за отлучку — до ${atLevel(TRAINING.maxHours, level)} ч). Предел: ур. ${Math.max(0, cap)} — на 1 ниже сильнейшего бойца.`
        )}
      </p>
      {list.map((u, i) => {
        const gain = trainingGain(save, u)
        const toLevel = Math.min(cap, u.level + Math.floor((u.xp + gain) / XP.perLevel))
        return (
          <UnitRow
            key={u.id}
            unit={u}
            index={i}
            friendly
            tags={<UnitStatusChips unit={u} />}
            right={(
              <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
                <span className="small">{u.level >= cap ? tr("at the limit", "на пределе") : `+${gain} XP${toLevel > u.level ? ` → ${tr("Lv.", "ур.")} ${toLevel}` : ""}`}</span>
                <Button sm ghost onClick={() => toggle(u, false)}>{tr("Leave", "Снять")}</Button>
              </div>
            )}
          />
        )
      })}
      {list.length < TRAINING.slots && (
        <Button block icon="➕" onClick={() => setPicking(true)}>
          {tr(`Add a fighter (${list.length}/${TRAINING.slots})`, `Добавить бойца (${list.length}/${TRAINING.slots})`)}
        </Button>
      )}
      <Button block primary disabled={total === 0} icon="🎯" onClick={collect}>
        {total > 0 ? tr(`Collect ${total} XP`, `Забрать опыт: ${total}`) : tr("Nothing to collect yet", "Пока нечего забирать")}
      </Button>
    </div>
  )
}

export function HospitalPanel({ toast }: { toast: Toast }) {
  const save = useStore($save)
  const tired = (save.army?.units ?? []).filter(u => fatigueOf(u) > 0).sort((a, b) => fatigueOf(b) - fatigueOf(a))
  const charges = save.settlement.hospital.charges
  const cure = (u: UnitInstance) => {
    const r = cureFatigueAction(u.id)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("success")
    toast(tr(`${displayName(u)} is rested`, `${displayName(u)} отдохнул(а)`))
  }
  return (
    <div className="stack">
      <p className="muted small">
        {tr(
          `Every battle adds a fatigue stack to the squad. Free beds: ${charges} of ${hospitalCharges(save)} — they refill after each battle.`,
          `Каждый бой добавляет отряду стак усталости. Свободных мест: ${charges} из ${hospitalCharges(save)} — восстанавливаются после каждого боя.`
        )}
      </p>
      {tired.map((u, i) => (
        <UnitRow
          key={u.id}
          unit={u}
          index={i}
          friendly
          tags={<UnitStatusChips unit={u} training={isTraining(save, u.id)} />}
          right={(
            <Button sm primary={charges > 0} disabled={charges === 0} onClick={() => cure(u)}>
              {tr("Cure", "Лечить")}
            </Button>
          )}
        />
      ))}
      {tired.length > 0 && <p className="muted small">{fatigueHint(tired[0] as UnitInstance)}</p>}
      {tired.length === 0 && <p className="muted">{tr("Nobody is tired. 💤", "Уставших нет. 💤")}</p>}
    </div>
  )
}

export function FieldsPanel({ now, toast }: { now: number, toast: Toast }) {
  const save = useStore($save)
  const level = buildingLevel(save, "fields")
  const stored = fieldsStored(save, now)
  const storage = atLevel(FIELDS.storage, level)
  const food = save.profile.food
  const collect = () => {
    const r = collectFoodAction()
    if (!r.ok) return toast(tr("The barn is empty", "Амбар пуст"), true)
    haptic("success")
    toast(tr(`+${r.amount} Food`, `+${r.amount} Еды`))
  }
  const sell = (n: number) => {
    const r = sellFoodAction(n)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("success")
    toast(tr(`Sold ${n} Food for ${n * FOOD.sellPrice} 🦴`, `Продано ${n} Еды за ${n * FOOD.sellPrice} 🦴`))
  }
  return (
    <div className="stack">
      <p className="muted small">
        {tr(
          `${atLevel(FIELDS.perHour, level)} Food per hour, even while you're away. A full barn stops growing.`,
          `${atLevel(FIELDS.perHour, level)} Еды в час, даже пока вас нет. Полный амбар перестаёт расти.`
        )}
      </p>
      <div className="row between small">
        <span>{tr("Barn", "Амбар")}</span>
        <b>{`${stored}/${storage} 🌾`}</b>
      </div>
      <div className="bar">
        <div className={stored >= storage ? "bad" : "good"} style={{ width: `${Math.min(100, (stored / storage) * 100)}%` }} />
      </div>
      <Button block primary disabled={stored === 0} icon="🌾" onClick={collect}>
        {stored > 0 ? tr(`Harvest ${stored}`, `Собрать ${stored}`) : tr("Nothing grown yet", "Пока не выросло")}
      </Button>
      <div className="row between small">
        <span>{tr("In stock", "В запасе")}</span>
        <b>{`${food} 🌾`}</b>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Button sm style={{ flex: 1 }} disabled={food < 10} onClick={() => sell(10)}>{tr(`Sell 10 · +${10 * FOOD.sellPrice} 🦴`, `Продать 10 · +${10 * FOOD.sellPrice} 🦴`)}</Button>
        <Button sm style={{ flex: 1 }} disabled={food === 0} onClick={() => sell(food)}>{tr("Sell all", "Продать всё")}</Button>
      </div>
    </div>
  )
}

export function CanteenPanel() {
  const save = useStore($save)
  const level = buildingLevel(save, "canteen")
  return (
    <div className="stack">
      <p className="muted small">
        {tr(
          `Pick meals on the squad screen before a sortie: up to ${mealSlots(save)} of the squad. Food is spent when the battle starts.`,
          `Блюда выбираются на экране отряда перед вылазкой: до ${mealSlots(save)} бойцов. Еда тратится при старте боя.`
        )}
      </p>
      {DISHES.map(d => (
        <div key={d.id} className={`card store-item${d.minLevel > level ? " is-locked" : ""}`}>
          <span className="store-ico" aria-hidden="true">{d.icon}</span>
          <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
            <b>{d.name}</b>
            <div className="muted small">{d.desc}</div>
          </div>
          {d.minLevel > level
            ? <span className="muted small">{tr(`Lv. ${d.minLevel}`, `Ур. ${d.minLevel}`)}</span>
            : <b className="small">{`🌾 ${d.food}`}</b>}
        </div>
      ))}
    </div>
  )
}

/**
 * Здание в лагере (разговор у входа): уровень, эффект «сейчас / дальше», улучшение и перенос на другое место.
 */
export function BuildingInfo({ id, now, onMove, toast }: { id: BuildingId, now: number, onMove: () => void, toast: Toast }) {
  const save = useStore($save)
  const def = buildingDef(id)
  const level = buildingLevel(save, id)
  const cost = nextLevelCost(save, id)
  const check = canUpgrade(save, id)
  const status = statusLine(id, now)
  const upgrade = () => {
    const r = upgradeBuildingAction(id)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("success")
    toast(tr(`${def.name}: level ${level + 1}`, `${def.name}: уровень ${level + 1}`))
  }
  return (
    <div className="bld-info stack">
      <div className="row between">
        <span className="bld-pips" aria-label={levelLabel(level)}>
          {Array.from({ length: MAX_BUILDING_LEVEL }, (_, i) => <i key={i} className={i < level ? "on" : ""} />)}
          <span className="muted small">{levelLabel(level)}</span>
        </span>
        <Button sm ghost icon="✥" onClick={onMove}>{tr("Move", "Перенести")}</Button>
      </div>
      {status && <div className="bld-status small">{status}</div>}
      <div className="bld-effects small">
        <div>
          <span className="muted">{tr("Now: ", "Сейчас: ")}</span>
          {def.effect(level)}
        </div>
        {cost && (
          <div>
            <span className="muted">{tr("Next: ", "Дальше: ")}</span>
            {def.effect(level + 1)}
          </div>
        )}
      </div>
      {cost && (
        <div className="bld-foot">
          <span className="muted small grow">
            {cost.rosterLevel > 1 && tr(`Roster Lv. ${cost.rosterLevel}+`, `Ростер ур. ${cost.rosterLevel}+`)}
            {!check.ok && <span className="bld-why">{` ${check.error}`}</span>}
          </span>
          <Button sm primary={check.ok} disabled={!check.ok} onClick={upgrade}>
            {`${tr("Upgrade", "Улучшить")} · 🦴 ${cost.treats}${cost.food ? ` · 🌾 ${cost.food}` : ""}`}
          </Button>
        </div>
      )}
    </div>
  )
}
