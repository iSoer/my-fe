import { useEffect, useRef, useState, type ReactNode } from "react"
import type { BuildingId, SaveGame } from "@game/core/types"
import { MAX_LEVEL, SQUAD_SIZE } from "@game/core/types"
import { BUILDING_MAX_LEVEL, GRAVEYARD, PLOTS, buildingDef, type StatLine } from "@game/content/settlement"
import { XP } from "@game/content/balance"
import {
  buildingLevel,
  canBuild,
  canTrain,
  canUpgrade,
  levelCost,
  nextStoreRefresh,
  plotStatus,
  reviveStatus,
  revivable,
  rosterCapacity,
  storeDiscount,
  storeOfferCount,
  trainingCapacity,
  trainingIds,
  trainingRate
} from "@game/core/settlement"
import { displayName, unitClassName } from "@game/core/units"
import { $save, ensureRoster } from "@game/state/save"
import { buildAction, closePanel, collectAction, orderDrinkAction, trainAction, upgradeAction } from "@game/state/settlement"
import { canOrderDrink, drinkPct, drinksAt } from "@game/core/settlement/tavern"
import { DRINKS, drinkDef } from "@game/content/tavern"
import { navigate } from "@game/state/router"
import { haptic } from "@game/platform/haptics"
import { Button } from "../components/Button"
import { UnitAvatar } from "../components/UnitAvatar"
import { UnitRow } from "../components/UnitRow"
import { drinkEffects, fmtDuration } from "../lib/format"
import { plural, tr } from "@game/i18n"

type Toast = (msg: string, error?: boolean) => void

/** Текущее время, обновляемое раз в `ms` (для таймеров в карточках). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const go = (path: string) => {
  haptic("select")
  closePanel()
  navigate(path)
}

function Stats({ lines, next }: { lines: StatLine[], next?: StatLine[] }) {
  return (
    <div className="st-stats">
      {lines.map((l, i) => {
        const n = next?.[i]
        const changed = !!n && n.value !== l.value
        return (
          <div key={l.label} className="st-stat">
            <span className="muted">{l.label}</span>
            <b>
              {l.value}
              {changed && <span className="st-next">{` → ${n.value}`}</span>}
            </b>
          </div>
        )
      })}
    </div>
  )
}

/** Постройка или улучшение: цена, кнопка и причина, если сейчас нельзя. */
function GrowthBlock({ save, id, toast }: { save: SaveGame, id: BuildingId, toast: Toast }) {
  // Замок от двойного тапа: снимается только после перерисовки с новым уровнем (или после ошибки)
  const busy = useRef(false)
  const level = buildingLevel(save, id)
  useEffect(() => { busy.current = false }, [level])
  const cost = levelCost(id, level)
  if (cost === null)
    return <p className="small st-max">{tr("★ Maximum level reached", "★ Достигнут максимальный уровень")}</p>
  const check = level === 0 ? canBuild(save, id) : canUpgrade(save, id)
  const act = () => {
    if (busy.current) return
    busy.current = true
    const r = level === 0 ? buildAction(id) : upgradeAction(id)
    if (!r.ok) {
      busy.current = false
      return toast(r.error, true)
    }
    haptic("success")
    // Уровень берём из нового сейва, а не из замыкания
    const now = buildingLevel($save.get(), id)
    toast(level === 0
      ? tr(`${buildingDef(id).name} built!`, `${buildingDef(id).name}: построено!`)
      : tr(`${buildingDef(id).name}: level ${now}`, `${buildingDef(id).name}: уровень ${now}`))
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <Button block primary={check.ok} disabled={!check.ok} icon={level === 0 ? "🔨" : "⬆"} onClick={act}>
        {level === 0
          ? `${tr("Build", "Построить")} · ${cost} 🦴`
          : `${tr(`Upgrade to level ${level + 1}`, `Улучшить до ${level + 1}-го уровня`)} · ${cost} 🦴`}
      </Button>
      {!check.ok && <p className="small danger-text st-why">{check.error}</p>}
    </div>
  )
}

/** Уровень здания ромбиками. */
export function LevelPips({ level }: { level: number }) {
  return (
    <span className="st-pips" aria-label={tr(`Level ${level} of ${BUILDING_MAX_LEVEL}`, `Уровень ${level} из ${BUILDING_MAX_LEVEL}`)}>
      {Array.from({ length: BUILDING_MAX_LEVEL }, (_, i) => <i key={i} className={i < level ? "on" : ""} />)}
    </span>
  )
}

/* ---------- Разделы зданий ---------- */

function BarracksSection({ save }: { save: SaveGame }) {
  const army = save.army
  const units = army?.units ?? []
  const cap = rosterCapacity(save)
  const training = trainingIds(save)
  const fallen = save.memorial.filter(m => m.reason === "killed" && m.revivedAt === undefined).length
  const squad = new Set(army?.squadIds ?? [])
  return (
    <div className="stack">
      <div className="st-meter">
        <span>{tr("Roster", "Ростер")}</span>
        <div className="bar"><div style={{ width: `${Math.min(100, (units.length / cap) * 100)}%` }} /></div>
        <b>{`${units.length}/${cap}`}</b>
      </div>
      <p className="muted small">
        {tr(
          `Squad ${army?.squadIds.length ?? 0}/${SQUAD_SIZE} · training ${training.size} · fallen ${fallen} (they don’t take up places)`,
          `В отряде ${army?.squadIds.length ?? 0}/${SQUAD_SIZE} · на полигоне ${training.size} · павших ${fallen} (мест не занимают)`
        )}
      </p>
      {units.length === 0
        ? (
            <Button block primary icon="🐾" onClick={() => {
              ensureRoster()
              go("/army")
            }}
            >
              {tr("Recruit a new roster", "Набрать новый ростер")}
            </Button>
          )
        : (
            <>
              <div className="st-list">
                {[...units].sort((a, b) => b.level - a.level).map(u => (
                  <UnitRow
                    key={u.id}
                    unit={u}
                    animated={false}
                    onClick={() => go(`/army/${u.id}`)}
                    tags={training.has(u.id)
                      ? <span className="chip">{tr("🎯 Training", "🎯 Тренируется")}</span>
                      : squad.has(u.id) ? <span className="chip squad">{tr("Squad", "Отряд")}</span> : undefined}
                  />
                ))}
              </div>
              <Button block primary icon="🛡️" onClick={() => go("/army")}>
                {tr("Army: squad, recruits, rewards", "Армия: отряд, набор, награды")}
              </Button>
            </>
          )}
    </div>
  )
}

function TrainingSection({ save, toast }: { save: SaveGame, toast: Toast }) {
  const now = useNow(1000)
  const cap = trainingCapacity(save)
  const rate = trainingRate(save)
  const units = save.army?.units ?? []
  const slots = save.settlement.training
  const busy = trainingIds(save)
  const idle = units.filter(u => !busy.has(u.id)).sort((a, b) => b.level - a.level)
  const send = (id: string) => {
    const r = trainAction(id)
    if (!r.ok) return toast(r.error, true)
    haptic("select")
  }
  const collect = (id: string) => {
    const r = collectAction(id)
    if (!r.ok) return toast(r.error, true)
    haptic("success")
    const up = r.levelUps.at(-1)
    toast(up ? tr(`Level ${up.to}!`, `Уровень ${up.to}!`) : tr("Back in the Barracks", "Вернулся в Казармы"))
  }
  return (
    <div className="stack">
      <div className="st-meter">
        <span>{tr("Slots", "Места")}</span>
        <div className="bar"><div style={{ width: `${cap ? (slots.length / cap) * 100 : 0}%` }} /></div>
        <b>{`${slots.length}/${cap}`}</b>
      </div>
      {slots.length === 0 && <p className="muted small">{tr("Nobody is training. Pick fighters below.", "Никто не тренируется. Выберите бойцов ниже.")}</p>}
      {slots.map((t) => {
        const u = units.find(x => x.id === t.unitId)
        if (!u) return null
        const max = u.level >= MAX_LEVEL
        // Опыт, накопленный с последнего начисления (ещё не записан в сейв) — для живой полоски
        // (на максимальном уровне опыт не копится — и в «+N» его не показываем)
        const pending = rate > 0 && !max ? Math.floor(((now - t.lastTick + t.carryMs) * rate) / 3_600_000) : 0
        const xp = max ? XP.perLevel : Math.min(XP.perLevel, u.xp + pending)
        return (
          <div key={t.unitId} className="card st-trainee">
            <UnitAvatar unit={u} size="md" animated={false} />
            <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
              <b className="st-ellipsis">{displayName(u)}</b>
              <span className="muted small">
                {`${tr("Lv.", "Ур.")} ${u.level}`}
                {max ? tr(" · max level: no more XP", " · максимум: опыт не копится") : ` · ${xp}/${XP.perLevel} XP`}
              </span>
              <div className="bar xp"><div style={{ width: `${(xp / XP.perLevel) * 100}%` }} /></div>
              <span className="muted small">
                {tr(`+${t.xp + pending} XP in ${fmtDuration(now - t.since)}`, `+${t.xp + pending} опыта за ${fmtDuration(now - t.since)}`)}
              </span>
            </div>
            <Button sm onClick={() => collect(t.unitId)}>{tr("Collect", "Забрать")}</Button>
          </div>
        )
      })}
      <div className="section-title">{tr("Available fighters", "Свободные бойцы")}</div>
      {idle.length === 0 && <p className="muted small">{tr("Everyone is already training.", "Все уже на полигоне.")}</p>}
      {idle.length > 0 && slots.length >= cap && <p className="muted small">{tr("All slots are taken — upgrade the Training Ground or collect someone.", "Все места заняты — улучшите полигон или заберите кого-нибудь.")}</p>}
      <div className="st-list">
        {idle.map((u) => {
          const check = canTrain(save, u.id)
          return (
            <div key={u.id} className={`card st-trainee${check.ok ? "" : " dim"}`}>
              <UnitAvatar unit={u} size="md" animated={false} />
              <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                <b className="st-ellipsis">{displayName(u)}</b>
                <span className="muted small st-ellipsis">{`${tr("Lv.", "Ур.")} ${u.level} · ${unitClassName(u)}`}</span>
              </div>
              <Button sm primary={check.ok} disabled={!check.ok} onClick={() => send(u.id)} title={check.ok ? undefined : check.error}>
                {tr("Train", "Тренировать")}
              </Button>
            </div>
          )
        })}
      </div>
      <p className="muted small hint-line">
        {tr(
          "Training fighters keep their place in the Barracks but skip sorties. XP accrues even while the game is closed.",
          "Тренирующиеся занимают место в Казармах, но в вылазки не ходят. Опыт копится, даже пока игра закрыта."
        )}
      </p>
    </div>
  )
}

function StoreSection({ save }: { save: SaveGame }) {
  const now = useNow(1000)
  const count = save.store.weapons.length + save.store.talismans.length
  return (
    <div className="stack">
      <p className="small">
        {tr(`On display: ${count} of ${storeOfferCount(save)} · discount ${Math.round(storeDiscount(save) * 100)}%`, `На витрине: ${count} из ${storeOfferCount(save)} · скидка ${Math.round(storeDiscount(save) * 100)}%`)}
        {save.store.fresh && <span className="chip gold" style={{ marginLeft: 6 }}>{tr("New stock", "Новый завоз")}</span>}
      </p>
      <p className="muted small">{`${tr("Next delivery in", "Новый завоз через")} ${fmtDuration(nextStoreRefresh(save.store) - now)}`}</p>
      <Button block primary icon="🛒" onClick={() => go("/store")}>
        {tr("Open the shop", "Открыть лавку")}
      </Button>
    </div>
  )
}

function GraveyardSection({ save }: { save: SaveGame }) {
  const now = useNow(1000)
  const status = reviveStatus(save, now)
  const candidates = revivable(save).length
  const total = save.memorial.length
  return (
    <div className="stack">
      <p className="small">
        {total === 0
          ? tr("No one rests here yet. Let’s keep it that way.", "Здесь пока никто не лежит. Пусть так и останется.")
          : tr(`${total} ${plural(total, ["name", "names"], ["имя", "имени", "имён"])} on the stones.`, `На камнях ${total} ${plural(total, ["name", "names"], ["имя", "имени", "имён"])}.`)}
      </p>
      <div className={`st-revive ${status.unlocked && status.readyToday ? "is-ready" : ""}`}>
        {!status.unlocked
          ? tr(`🔒 Resurrection opens at level ${GRAVEYARD.reviveLevel}.`, `🔒 Воскрешение откроется на ${GRAVEYARD.reviveLevel}-м уровне.`)
          : status.readyToday
            ? tr(`✨ You can revive one fighter today (${candidates} can be revived).`, `✨ Сегодня можно воскресить одного бойца (доступно: ${candidates}).`)
            : tr(`⏳ Next resurrection in ${fmtDuration((status.nextAt ?? now) - now)}.`, `⏳ Следующее воскрешение через ${fmtDuration((status.nextAt ?? now) - now)}.`)}
      </div>
      <Button block primary icon="🪦" onClick={() => go("/memorial")} disabled={total === 0}>
        {tr("Read the gravestones", "Прочитать надгробия")}
      </Button>
    </div>
  )
}

function TavernSection({ save, toast }: { save: SaveGame, toast: Toast }) {
  const level = buildingLevel(save, "tavern")
  const menu = drinksAt(level)
  const ordered = save.settlement.drink
  const orderedDef = ordered && drinkDef(ordered.id)
  const order = (id: string) => {
    const r = orderDrinkAction(id)
    if (!r.ok) return toast(r.error, true)
    haptic("success")
    toast(tr("Poured! It’ll kick in on the next sortie", "Налито! Подействует на следующей вылазке"))
  }
  return (
    <div className="stack">
      {orderedDef
        ? (
            <div className="card st-drink is-ordered">
              <span className="st-drink-ico" aria-hidden="true">{orderedDef.icon}</span>
              <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                <b>{tr(`For the next sortie: ${orderedDef.name}`, `На следующую вылазку: ${orderedDef.name}`)}</b>
                <span className="small st-drink-fx">{drinkEffects(drinkPct(orderedDef, ordered.level))}</span>
              </div>
            </div>
          )
        : <p className="muted small">{tr("One mug per sortie. The whole squad drinks; the effect lasts the whole battle.", "Одна кружка на вылазку. Пьёт весь отряд, действует весь бой.")}</p>}
      <div className="section-title">{tr("Menu", "Меню")}</div>
      <div className="st-list">
        {DRINKS.map((d) => {
          const open = menu.includes(d)
          const check = canOrderDrink(save, d.id)
          return (
            <div key={d.id} className={`card st-drink${open ? "" : " dim"}`}>
              <span className="st-drink-ico" aria-hidden="true">{open ? d.icon : "🔒"}</span>
              <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                <b className="st-ellipsis">{d.name}</b>
                <span className="small st-drink-fx">{drinkEffects(drinkPct(d, Math.max(level, 1)))}</span>
                <span className="muted small">{open ? d.desc : tr(`From bar level ${d.minLevel}`, `С ${d.minLevel}-го уровня бара`)}</span>
              </div>
              {open && (
                <Button sm primary={check.ok} disabled={!check.ok} onClick={() => order(d.id)} title={check.ok ? undefined : check.error}>
                  {`${d.price} 🦴`}
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Карточки ---------- */

/** Шапка карточки; `level` не задан — у места нет уровней (ворота, резерв). */
function Header({ icon, name, level, desc }: { icon: string, name: string, level?: number, desc: string }) {
  return (
    <div className="st-head">
      <span className="st-head-ico" aria-hidden="true">{icon}</span>
      <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
        <b className="st-head-name">{name}</b>
        {level === undefined
          ? null
          : level > 0
            ? (
                <span className="row" style={{ gap: 6 }}>
                <LevelPips level={level} />
                  <span className="muted small">{tr(`Level ${level}/${BUILDING_MAX_LEVEL}`, `Уровень ${level}/${BUILDING_MAX_LEVEL}`)}</span>
                </span>
              )
            : <span className="muted small">{tr("Not built", "Не построено")}</span>}
        <span className="muted small">{desc}</span>
      </div>
    </div>
  )
}

/** Раздел здания; `switch` исчерпывающий — новый BuildingId без раздела не скомпилируется. */
function buildingSection(id: BuildingId, save: SaveGame, toast: Toast): ReactNode {
  switch (id) {
    case "barracks": return <BarracksSection save={save} />
    case "training": return <TrainingSection save={save} toast={toast} />
    case "store": return <StoreSection save={save} />
    case "tavern": return <TavernSection save={save} toast={toast} />
    case "graveyard": return <GraveyardSection save={save} />
    default: {
      const never: never = id
      return never
    }
  }
}

/** Карточка места: здание (характеристики, улучшение, свой раздел), пустое место (постройка) или резерв. */
export function BuildingPanel({ plotId, save, toast }: { plotId: string, save: SaveGame, toast: Toast }) {
  const plot = PLOTS.find(p => p.id === plotId)
  if (!plot) return null
  const id = plot.building
  if (!id) {
    return (
      <div className="stack">
        <Header icon="🚧" name={tr("Vacant lot", "Пустырь")} desc={tr("Reserved for future buildings. Nothing can be built here yet.", "Участок под будущие постройки. Пока здесь ничего не построить.")} />
        <p className="small st-state-locked">{tr("🔒 Unavailable", "🔒 Недоступно")}</p>
        <Button block ghost onClick={closePanel}>{tr("Close", "Закрыть")}</Button>
      </div>
    )
  }
  const def = buildingDef(id)
  const level = buildingLevel(save, id)
  const status = plotStatus(save, plot)
  const section: ReactNode = level > 0 ? buildingSection(id, save, toast) : null
  return (
    <div className="stack">
      <Header icon={def.icon} name={def.name} level={level} desc={def.desc} />
      {level === 0
        ? (
            <>
              <div className="section-title">{tr("After construction", "После постройки")}</div>
              <Stats lines={def.stats(1)} />
              {status === "locked" && <p className="small st-state-locked">{tr("🔒 Can’t be built yet", "🔒 Пока построить нельзя")}</p>}
            </>
          )
        : (
            <>
              <div className="section-title">
                {level < BUILDING_MAX_LEVEL ? tr(`Level ${level} → ${level + 1}`, `Уровень ${level} → ${level + 1}`) : tr("Characteristics", "Характеристики")}
              </div>
              <Stats lines={def.stats(level)} next={level < BUILDING_MAX_LEVEL ? def.stats(level + 1) : undefined} />
            </>
          )}
      <GrowthBlock save={save} id={id} toast={toast} />
      {section}
    </div>
  )
}

/** Ворота: вылазка (или возврат в идущий бой). */
export function GatePanel({ save }: { save: SaveGame }) {
  const army = save.army
  const units = army?.units.length ?? 0
  const squad = army?.squadIds.length ?? 0
  const battleOn = !!save.battle && !save.battle.result
  let text: string
  let action: ReactNode
  if (battleOn) {
    text = tr(`The battle’s still on: turn ${save.battle?.turn ?? 1}. Your squad awaits orders.`, `Бой ещё идёт: ход ${save.battle?.turn ?? 1}. Отряд ждёт приказа.`)
    action = <Button big primary block glow icon="⚔️" onClick={() => go("/battle")}>{tr("Back to battle", "Вернуться в бой")}</Button>
  }
  else if (units === 0 || squad === 0) {
    text = units === 0
      ? tr("No fighters, no sortie — recruit a roster in the Barracks first.", "Без бойцов вылазки не будет — сперва наберите ростер в Казармах.")
      : tr("No squad assembled — pick your fighters in the Barracks.", "Отряд не собран — отметьте бойцов в Казармах.")
    action = <Button big primary block icon="🛡️" onClick={() => go("/army")}>{tr("To the Barracks", "В Казармы")}</Button>
  }
  else {
    text = tr(
      `Squad ${squad}/${SQUAD_SIZE}. Lose and you keep only half the loot; retreat and you keep three quarters.`,
      `Отряд ${squad}/${SQUAD_SIZE}. Проиграешь — унесёшь половину выбитого, отступишь — три четверти.`
    )
    action = <Button big primary block icon="⚔️" onClick={() => go("/battle/setup")}>{tr("Plan a sortie", "Собрать вылазку")}</Button>
  }
  return (
    <div className="stack">
      <Header icon="⚔️" name={tr("Gate", "Ворота")} desc={tr("Beyond the fence lie enemies and loot.", "За околицей — враги и добыча.")} />
      <p className="small">{text}</p>
      {action}
    </div>
  )
}
