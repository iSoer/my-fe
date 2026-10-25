import { useState } from "react"
import { useStore } from "@nanostores/react"
import type { UnitInstance } from "@game/core/types"
import { SQUAD_SIZE } from "@game/core/types"
import { isTraining, rosterCap } from "@game/core/settlement"
import {
  attackOf,
  displayName,
  hasClassUpgrade,
  learnableNow,
  skillCost,
  unitClass,
  unitClassName,
  visibleStats
} from "@game/core/units"
import { $save, ensureRoster, freeSlots, toggleSquad } from "@game/state/save"
import { navigate } from "@game/state/router"
import { haptic } from "@game/platform/haptics"
import { Button } from "../components/Button"
import { TopBar } from "../components/TopBar"
import { ResourceBar } from "../components/ResourceBar"
import { UnitAvatar } from "../components/UnitAvatar"
import { RarityStars, WeaponBadge } from "../components/Badges"
import { ShopSheet } from "../components/ShopSheet"
import { RewardPicker } from "../components/RewardPicker"
import { UnitStatusChips } from "../components/UnitStatus"
import { useToast } from "../components/Toast"
import { MOVE_EMOJI, atkLabel } from "../lib/format"
import { MOVE_RANGE } from "@game/content/classes"
import { classRoleText } from "../components/ClassInfo"
import { stagger } from "../lib/animate"
import { tr } from "@game/i18n"

/** Заполненный слот: краткая карточка бойца, тап — на экран бойца. */
function FilledSlot({
  unit,
  index,
  justHired,
  inSquad,
  training,
  onToggleSquad
}: {
  unit: UnitInstance
  index: number
  justHired: boolean
  inSquad: boolean
  training: boolean
  onToggleSquad: (id: string) => void
}) {
  const cls = unitClass(unit)
  const st = visibleStats(unit)
  const canLearn = learnableNow(unit).some(id => skillCost(id) <= unit.sp)
  return (
    <div
      className={`card slot-card filled clickable ${justHired ? "just-hired" : "pop-in"}`}
      style={stagger(index, 60)}
      onClick={() => {
        haptic("select")
        navigate(`/army/${unit.id}`)
      }}
    >
      <span className="slot-tab">
        {tr("Lv.", "Ур.")}
        {unit.level}
      </span>
      <div className="slot-head">
        <UnitAvatar unit={unit} size="md" />
        <div className="slot-meta">
          <div className="slot-name">{displayName(unit)}</div>
          <RarityStars rarity={unit.rarity} />
          <div className="muted small slot-class">{`${unitClassName(unit)} · ${classRoleText(unit.classId)}`}</div>
          <div className="muted small slot-class">{`${MOVE_EMOJI[cls.moveType]} ${tr("move", "ход")} ${MOVE_RANGE[cls.moveType]}`}</div>
        </div>
      </div>
      <div className="slot-foot">
        <WeaponBadge skill={cls.weaponSkill} />
        {canLearn && <span className="chip red pop">{tr("New skill", "Есть навык")}</span>}
        {hasClassUpgrade(unit) && <span className="chip gold pop">{tr("New class", "Новый класс")}</span>}
        <UnitStatusChips unit={unit} training={training} />
        {!training && (
          <button
          type="button"
          className={`chip squad-toggle ${inSquad ? "squad" : ""}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSquad(unit.id)
          }}
        >
            {inSquad ? tr("✓ In squad", "✓ В отряде") : tr("+ To squad", "+ В отряд")}
          </button>
        )}
      </div>
      <div className="mini-stats">
        <span>
          HP
          {" "}
          <b>{st.hp}</b>
        </span>
        <span>
          {atkLabel(unit)}
          {" "}
          <b>{attackOf(unit, st)}</b>
        </span>
        <span>
          Spd
          {" "}
          <b>{st.spd}</b>
        </span>
        <span>
          Def
          {" "}
          <b>{st.def}</b>
        </span>
        <span>
          Res
          {" "}
          <b>{st.res}</b>
        </span>
      </div>
    </div>
  )
}

export function ArmyScreen() {
  const save = useStore($save)
  const [shopOpen, setShopOpen] = useState(false)
  const [justHired, setJustHired] = useState<string | null>(null)
  const [toastEl, toast] = useToast()
  const army = save.army

  const welcome = (unit: UnitInstance) => {
    setJustHired(unit.id)
    toast(tr(`${displayName(unit)} joined the roster!`, `${displayName(unit)} в ростере!`))
    window.setTimeout(() => setJustHired(cur => (cur === unit.id ? null : cur)), 900)
  }

  if (!army || army.units.length === 0) {
    return (
      <div className="screen">
        <TopBar title={tr("Barracks", "Казарма")} right={<ResourceBar />} onBack={() => navigate("/village", true)} />
        <div className="screen-body">
          <div className="empty">
            <div className="big">🪦</div>
            <h3>{tr("The Barracks are empty", "Казарма пуста")}</h3>
            <p>{tr("Everyone fell, or nobody’s here yet. A new roster is issued right away; your Glory stays with you.", "Все пали или никого ещё нет. Новый ростер выдаётся сразу; Слава остаётся с вами.")}</p>
            <Button primary big icon="🐾" onClick={() => ensureRoster()}>
              {tr("Recruit a new roster", "Набрать новый ростер")}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const onToggleSquad = (id: string) => {
    const r = toggleSquad(id)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("select")
  }

  // Сначала отряд, затем остальные по уровню
  const squad = new Set(army.squadIds)
  const units = [...army.units].sort((a, b) => Number(squad.has(b.id)) - Number(squad.has(a.id)) || b.level - a.level)

  return (
    <div className="screen">
      <TopBar title={tr("Barracks", "Казарма")} right={<ResourceBar />} onBack={() => navigate("/village", true)} />
      <div className="screen-body">
        <RewardPicker toast={toast} onClaimed={welcome} />
        <div className="row between">
          <span className="muted small">
            {tr("Fighters:", "Персонажей:")}
            {" "}
            <b>{army.units.length}</b>
            /
            {rosterCap(save)}
          </span>
          <span className="muted small">{`${tr("Squad", "Отряд")}: ${army.squadIds.length}/${SQUAD_SIZE}`}</span>
        </div>
        <div className="slot-grid">
          {units.map((u, i) => (
            <FilledSlot
              key={u.id}
              unit={u}
              index={i}
              justHired={justHired === u.id}
              inSquad={squad.has(u.id)}
              training={isTraining(save, u.id)}
              onToggleSquad={onToggleSquad}
            />
          ))}
        </div>
        {army.units.length < SQUAD_SIZE && (
          <div className="warning-box">{tr(`Not enough fighters for a squad (${army.units.length}/${SQUAD_SIZE}) — recruit some.`, `Не хватает бойцов в отряд (${army.units.length}/${SQUAD_SIZE}) — наймите.`)}</div>
        )}
        <Button
          block
          primary={army.units.length < SQUAD_SIZE}
          icon="🐾"
          onClick={() => {
            haptic("select")
            setShopOpen(true)
          }}
        >
          {`${tr("Recruit", "Набор")} (${save.shelter.candidates.length})`}
        </Button>
        <p className="muted small hint-line">{tr("The Scout leads your squad into battle — he waits at the village gate.", "В бой отряд выводит Разведчик Шрам — он ждёт у ворот поселения.")}</p>
        {freeSlots(save) === 0 && (
          <p className="muted small hint-line">{tr("Roster full: upgrade the Barracks in the Settlement or release someone.", "Ростер полон: улучшите Казармы в Поселении или отпустите кого-нибудь.")}</p>
        )}
      </div>
      <ShopSheet open={shopOpen} onClose={() => setShopOpen(false)} toast={toast} onBought={welcome} />
      {toastEl}
    </div>
  )
}
