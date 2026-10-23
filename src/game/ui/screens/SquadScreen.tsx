import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import type { Stance, UnitInstance } from "@game/core/types"
import { SQUAD_SIZE } from "@game/core/types"
import { attackOf, displayName, unitClassName, visibleStats } from "@game/core/units"
import { itemCount, totalCount } from "@game/core/items"
import { ITEMS, difficultyDef } from "@game/content/balance"
import { CONSUMABLES } from "@game/content/items"
import { biomeDef } from "@game/content/biomes"
import { $save, assignSquadSlot, setPackAction, startBattle } from "@game/state/save"
import { navigate } from "@game/state/router"
import { haptic } from "@game/platform/haptics"
import { Button } from "../components/Button"
import { TopBar } from "../components/TopBar"
import { ResourceBar } from "../components/ResourceBar"
import { UnitAvatar } from "../components/UnitAvatar"
import { UnitRow } from "../components/UnitRow"
import { UnitDetails } from "../components/UnitDetails"
import { BottomSheet } from "../components/Sheet"
import { useToast } from "../components/Toast"
import { classRoleText } from "../components/ClassInfo"
import { atkLabel, statTotal } from "../lib/format"
import { stagger } from "../lib/animate"
import { DIFF_STYLE } from "./BattleSetupScreen"
import { tr } from "@game/i18n"
import "../squad.css"

function stanceLabel(s: Stance): string {
  switch (s) {
    case "hold": return tr("waiting", "ждёт")
    case "advance": return tr("advancing", "наступает")
    case "guard": return tr("guarding", "охраняет")
  }
}

const power = (units: UnitInstance[]): number => units.reduce((a, u) => a + statTotal(visibleStats(u)), 0)

/** Карточка врага в сетке по 3: портрет, имя, уровень, роль класса, HP и Str/Mag; тап — подробности. */
function FoeCard({ unit, note, index, dim, onOpen }: {
  unit: UnitInstance
  note?: string
  index: number
  dim?: boolean
  onOpen: (u: UnitInstance) => void
}) {
  const st = visibleStats(unit)
  return (
    <button
      type="button"
      className={`foe-card pop-in ${unit.isBoss ? "boss" : ""} ${dim ? "dim" : ""}`}
      style={stagger(index, 40)}
      onClick={() => onOpen(unit)}
    >
      <span className="foe-lvl">{`${tr("Lv.", "Ур.")}${unit.level}`}</span>
      {unit.isBoss && <span className="foe-boss" aria-label={tr("Leader", "Вожак")}>👑</span>}
      <UnitAvatar unit={unit} size="md" animated={false} />
      <b className="foe-name">{displayName(unit)}</b>
      <span className="foe-role">{classRoleText(unit.classId)}</span>
      <span className="foe-stats">{`HP ${st.hp} · ${atkLabel(unit)} ${attackOf(unit, st)}`}</span>
      {note && <span className="foe-note">{note}</span>}
    </button>
  )
}

/** Слот отряда: боец (тап — заменить) или пустое место (тап — добавить). */
function SquadSlot({ unit, slot, onOpen }: { unit?: UnitInstance, slot: number, onOpen: (slot: number) => void }) {
  if (!unit)
    return (
      <button type="button" className="squad-slot empty" onClick={() => onOpen(slot)}>
        <span className="squad-plus">+</span>
        <span className="small">{tr("Add fighter", "Добавить бойца")}</span>
      </button>
    )
  const st = visibleStats(unit)
  return (
    <button type="button" className="squad-slot" onClick={() => onOpen(slot)}>
      <span className="squad-num">{slot + 1}</span>
      <UnitAvatar unit={unit} size="md" friendly />
      <b className="squad-name">{displayName(unit)}</b>
      <span className="small muted">{`${unitClassName(unit)} · ${tr("Lv.", "Ур.")}${unit.level}`}</span>
      <span className="small">{classRoleText(unit.classId)}</span>
      <span className="squad-stats">{`HP ${st.hp} · ${atkLabel(unit)} ${attackOf(unit, st)} · Spd ${st.spd}`}</span>
      <span className="squad-swap">{tr("Swap ›", "Заменить ›")}</span>
    </button>
  )
}

/** Вылазка, шаг 2 из 2: враги, которые ждут (по 3 в ряд), отряд из 4 слотов с заменой из ростера, рюкзак и старт. */
export function SquadScreen() {
  const save = useStore($save)
  const army = save.army
  const pending = save.pendingBattle
  const [slot, setSlot] = useState<number | null>(null)
  const [foe, setFoe] = useState<UnitInstance | null>(null)
  const [toastEl, toast] = useToast()

  useEffect(() => {
    // Без разведки или армии здесь делать нечего — назад к выбору сложности
    if (!$save.get().pendingBattle || !$save.get().army) navigate("/battle/setup", true)
  }, [])
  if (!army || !pending) return <div className="screen" />

  const map = pending.map
  const squad = army.squadIds
    .map(id => army.units.find(u => u.id === id))
    .filter((u): u is UnitInstance => !!u)
  const enemies = map.enemies
  const waves = map.reinforcements
  const enemyPower = power([...enemies.map(e => e.unit), ...waves.flatMap(w => w.units.map(x => x.unit))])
  const squadPower = power(squad)
  const ratio = enemyPower > 0 ? squadPower / enemyPower : 1
  const ratioLabel
    = ratio >= 1.1
      ? tr("You have the edge", "Преимущество у вас")
      : ratio >= 0.85
        ? tr("Evenly matched", "Силы равны")
        : ratio >= 0.6 ? tr("This will hurt", "Будет тяжело") : tr("Suicide", "Самоубийство")
  const ratioClass = ratio >= 1.0 ? "ok" : ratio >= 0.75 ? "warn" : "danger"
  const barClass = ratio >= 1.0 ? "good" : ratio >= 0.75 ? "mid" : "bad"
  const diff = difficultyDef(pending.difficulty)
  const pack = pending.pack ?? {}
  const packed = totalCount(pack)
  const owned = CONSUMABLES.filter(c => itemCount(save.inventory, c.id) > 0)
  const slotUnit = slot !== null ? squad[slot] : undefined
  const roster = [...army.units].sort((a, b) => b.level - a.level)

  const pick = (unitId: string | null) => {
    if (slot === null) return
    const r = assignSquadSlot(slot, unitId)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("select")
    setSlot(null)
  }
  const onPack = (id: string, delta: number) => {
    const r = setPackAction({ ...pack, [id]: Math.max(0, (pack[id] ?? 0) + delta) })
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("select")
  }
  const onStart = () => {
    if (squad.length === 0) return toast(tr("Pick fighters for the squad", "Выберите бойцов в отряд"), true)
    const r = startBattle(squad.map(u => u.id))
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("heavy")
    navigate("/battle", true)
  }

  return (
    <div className="screen">
      <TopBar title={tr("Sortie · 2/2", "Вылазка · 2/2")} right={<ResourceBar />} onBack={() => navigate("/battle/setup", true)} />
      <div className="screen-body">
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="chip">{`${DIFF_STYLE[pending.difficulty].icon} ${diff.name}`}</span>
          <span className="chip">{biomeDef(map.biomeId).name}</span>
          {map.objective === "killBoss" && <span className="chip red">{tr("goal: kill the leader", "цель: убить вожака")}</span>}
        </div>

        <div className="section-title">{tr(`Enemies waiting: ${enemies.length}`, `Враги ждут: ${enemies.length}`)}</div>
        <div className="foe-grid">
          {enemies.map((e, i) => (
            <FoeCard key={e.unit.id} unit={e.unit} index={i} note={stanceLabel(e.stance)} onOpen={setFoe} />
          ))}
        </div>
        {waves.map(w => (
          <div key={w.turn} className="stack" style={{ gap: 8 }}>
            <div className="muted small">
              {tr(`Reinforcements on turn ${w.turn}`, `Подкрепление на ходу ${w.turn}`)}
              {pending.difficulty === "nightmare" ? tr(" (no warning in battle)", " (в бою без предупреждения)") : ""}
            </div>
            <div className="foe-grid">
              {w.units.map((x, i) => <FoeCard key={x.unit.id} unit={x.unit} index={i} dim onOpen={setFoe} />)}
            </div>
          </div>
        ))}

        <div className="section-title">{tr(`Your squad ${squad.length}/${SQUAD_SIZE}`, `Ваш отряд ${squad.length}/${SQUAD_SIZE}`)}</div>
        <p className="muted small">{tr("Tap a fighter to swap them with someone from the roster.", "Нажмите на бойца, чтобы заменить его кем-то из ростера.")}</p>
        <div className="squad-grid">
          {Array.from({ length: SQUAD_SIZE }, (_, i) => (
            <SquadSlot key={squad[i]?.id ?? `empty-${i}`} unit={squad[i]} slot={i} onOpen={setSlot} />
          ))}
        </div>

        <div className="card power-card">
          <div className="row between">
            <span>{tr("Squad power", "Сила отряда")}</span>
            <b className={ratioClass}>{ratioLabel}</b>
          </div>
          <div className="muted small">{tr(`Yours ${squadPower} vs ${enemyPower} for the enemy (with reinforcements)`, `Ваши ${squadPower} против ${enemyPower} у врагов (с подкреплениями)`)}</div>
          <div className="bar" style={{ marginTop: 8 }}>
            <div className={barClass} style={{ width: `${Math.min(100, ratio * 50)}%` }} />
          </div>
        </div>

        <div className="section-title">{tr(`Pack ${packed}/${ITEMS.packSize}`, `Рюкзак ${packed}/${ITEMS.packSize}`)}</div>
        {owned.length === 0
          ? <p className="muted small">{tr("No consumables — Auntie Brie sells bandages and medkits at the Shop.", "Расходников нет — пластыри и аптечки продаёт Тётушка Сырница в Лавке.")}</p>
          : (
              <div className="stack">
                {owned.map(c => (
                  <div key={c.id} className="card pack-row">
                    <span className="store-ico" aria-hidden="true">{c.icon}</span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <b>{c.name}</b>
                      <div className="muted small">{`${c.desc} ${tr("In inventory:", "В инвентаре:")} ${itemCount(save.inventory, c.id)}`}</div>
                    </div>
                    <Button sm ghost disabled={!pack[c.id]} onClick={() => onPack(c.id, -1)}>−</Button>
                    <b className="pack-count">{pack[c.id] ?? 0}</b>
                    <Button
                      sm
                      disabled={packed >= ITEMS.packSize || (pack[c.id] ?? 0) >= itemCount(save.inventory, c.id)}
                      onClick={() => onPack(c.id, 1)}
                    >
                      +
                    </Button>
                  </div>
                ))}
              </div>
            )}

        <div className="warning-box">{tr("☠️ The fallen don’t come back — and neither does their gear. Defeat — half the loot.", "☠️ Павшие не возвращаются вместе со снаряжением. Поражение — половина добычи.")}</div>
        <div className="sticky-cta">
          <Button big primary block pulse={squad.length > 0} icon="⚔️" onClick={onStart} disabled={squad.length === 0}>
            {`${tr("Start battle", "Начать бой")} · ${squad.length}/${SQUAD_SIZE}`}
          </Button>
        </div>
      </div>

      <BottomSheet
        open={slot !== null}
        onClose={() => setSlot(null)}
        title={slotUnit
          ? tr(`Slot ${(slot ?? 0) + 1}: replace ${displayName(slotUnit)}`, `Слот ${(slot ?? 0) + 1}: заменить ${displayName(slotUnit)}`)
          : tr(`Slot ${(slot ?? 0) + 1}: who’s going?`, `Слот ${(slot ?? 0) + 1}: кого взять?`)}
      >
        <div className="stack">
          <p className="muted small">{tr("A fighter already in the squad will swap places with this slot.", "Боец из отряда поменяется местами с этим слотом.")}</p>
          {roster.map((u, i) => {
            const at = squad.findIndex(x => x.id === u.id)
            const here = slotUnit?.id === u.id
            return (
              <UnitRow
                key={u.id}
                unit={u}
                index={i}
                animated={false}
                selected={here}
                onClick={() => pick(u.id)}
                right={
                  here
                    ? <span className="chip squad">{tr("Here", "Здесь")}</span>
                    : at >= 0 ? <span className="chip">{tr(`Slot ${at + 1}`, `Слот ${at + 1}`)}</span> : undefined
                }
              />
            )
          })}
          {slotUnit && (
            <Button block ghost onClick={() => pick(null)}>
              {tr("Remove from squad", "Убрать из отряда")}
            </Button>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={!!foe} onClose={() => setFoe(null)} title={foe?.isBoss ? tr("👑 Leader", "👑 Вожак") : tr("Enemy", "Враг")}>
        {foe && <UnitDetails unit={foe} compact />}
      </BottomSheet>
      {toastEl}
    </div>
  )
}
