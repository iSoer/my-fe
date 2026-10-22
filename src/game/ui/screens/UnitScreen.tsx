import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import type { UnitSkills } from "@game/core/types"
import { MAX_LEVEL, STATS } from "@game/core/types"
import {
  canRebirth,
  displayName,
  hasClassUpgrade,
  learnableNow,
  skillCost,
  slotOf,
  statsAtLevel,
  unitClass,
  unitClassName,
  visibleStats,
  weaponMt,
  levelGains
} from "@game/core/units"
import { XP } from "@game/content/balance"
import { TIER_LABELS } from "@shared/character/classes"
import { sharpenCost, trainCost } from "@game/core/progression"
import { skillInfo } from "@game/content/index"
import { traitDef } from "@game/content/traits"
import { breedDef } from "@game/content/breeds"
import { personalityText } from "@game/content/personalities"
import { talismanDef } from "@game/content/items"
import {
  $save,
  equipAction,
  learnSkillAction,
  rebirthAction,
  reclassAction,
  releaseUnit,
  sharpenAction,
  trainUnitAction
} from "@game/state/save"
import { navigate } from "@game/state/router"
import { Button } from "../components/Button"
import { TopBar } from "../components/TopBar"
import { ResourceBar } from "../components/ResourceBar"
import { UnitAvatar } from "../components/UnitAvatar"
import { MoveBadge, RarityStars, WeaponBadge } from "../components/Badges"
import { StatBar, StatsGrid } from "../components/Stats"
import { BottomSheet, ConfirmModal } from "../components/Sheet"
import { useToast } from "../components/Toast"
import { ClassSheet, SkillRanks, aptitudeLine, weaponLine } from "../components/CharacterPanels"
import { TalismanSheet, WeaponSheet } from "../components/GearSheet"
import { ClassInfoBlock } from "../components/ClassInfo"
import { STAT_LABELS, atkLabel, fmtGains, speciesName } from "../lib/format"
import { useReplay } from "../lib/animate"
import { haptic } from "@game/platform/haptics"
import { tr } from "@game/i18n"

function slotName(s: keyof UnitSkills): string {
  switch (s) {
    case "weapon": return tr("Weapon", "Оружие")
    case "assist": return tr("Assist", "Поддержка")
    case "special": return tr("Special", "Спецприём")
    case "a": return tr("Skill A", "Навык A")
    case "b": return tr("Skill B", "Навык B")
    case "c": return tr("Skill C", "Навык C")
  }
}
const SLOT_ICONS: Record<keyof UnitSkills, string> = {
  weapon: "⚔️",
  assist: "🤝",
  special: "✨",
  a: "A",
  b: "B",
  c: "C"
}
/** Оружие — предмет (блок «Снаряжение»), в навыках — только изучаемое за SP. */
const SLOTS: (keyof UnitSkills)[] = ["assist", "special", "a", "b", "c"]

export function UnitScreen({ unitId }: { unitId: string }) {
  const save = useStore($save)
  const [slot, setSlot] = useState<keyof UnitSkills | null>(null)
  const [release, setRelease] = useState<0 | 1 | 2>(0)
  const [rebirthOpen, setRebirthOpen] = useState(false)
  const [classOpen, setClassOpen] = useState(false)
  const [gear, setGear] = useState<"weapon" | "talisman" | null>(null)
  const [toastEl, toast] = useToast()
  const [bounceKey, replayBounce] = useReplay()
  const [happy, setHappy] = useState(false)
  const army = save.army
  const unit = army?.units.find(u => u.id === unitId)

  useEffect(() => {
    if (!unit) navigate("/army", true)
  }, [unit])
  useEffect(() => {
    if (!happy) return
    const t = setTimeout(() => setHappy(false), 1400)
    return () => clearTimeout(t)
  }, [happy, bounceKey])
  if (!unit || !army) return <div className="screen" />

  const cls = unitClass(unit)
  const stats = visibleStats(unit)
  const trait = unit.traitId ? traitDef(unit.traitId) : undefined
  const tCost = trainCost(unit.level)
  const sCost = sharpenCost(unit.weaponTier)
  const learnable = learnableNow(unit)
  const own = statsAtLevel(unit, unit.level)
  const atMax = statsAtLevel(unit, MAX_LEVEL)

  const celebrate = (): void => {
    replayBounce()
    setHappy(true)
  }

  const onTrain = () => {
    const gains = levelGains(unit, unit.level, unit.level + 1)
    const r = trainUnitAction(unit.id)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("success")
    celebrate()
    toast(tr(`Level ${unit.level + 1}! ${fmtGains(gains)}`, `Уровень ${unit.level + 1}! ${fmtGains(gains)}`))
  }
  const onReclass = (classId: string) => {
    const r = reclassAction(unit.id, classId)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("success")
    celebrate()
    setClassOpen(false)
    toast(tr(`New class: ${unitClassName({ ...unit, classId })}`, `Новый класс: ${unitClassName({ ...unit, classId })}`))
  }
  const onSharpen = () => {
    const r = sharpenAction(unit.id)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("medium")
    celebrate()
    toast(tr("Weapon sharpened", "Оружие заточено"))
  }
  const nextStar = unit.rarity + 1
  const onRebirth = () => {
    setRebirthOpen(false)
    const r = rebirthAction(unit.id)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("success")
    celebrate()
    toast(
      r.unlocked
        ? tr(
            `Reborn as ★${r.unlocked}! ★${r.unlocked} fighters now appear in the Shop, rewards and new rosters.`,
            `Перерождение: ★${r.unlocked}! Бойцы с ★${r.unlocked} теперь появляются в магазине, наградах и новых ростерах.`
          )
        : tr(`Reborn as ★${nextStar}! Back to level 1.`, `Перерождение: ★${nextStar}! Снова 1-й уровень.`)
    )
  }
  const onRelease = () => {
    const r = releaseUnit(unit.id)
    setRelease(0)
    if (!r.ok) return
    haptic("warning")
    navigate("/army", true)
  }

  const slotOptions = (s: keyof UnitSkills): { id: string, state: "equipped" | "learned" | "learnable" }[] => {
    const out: { id: string, state: "equipped" | "learned" | "learnable" }[] = []
    const equipped = unit.skills[s]
    if (equipped) out.push({ id: equipped, state: "equipped" })
    for (const id of unit.learned) if (id !== equipped && slotOf(id) === s) out.push({ id, state: "learned" })
    for (const id of learnable) if (slotOf(id) === s) out.push({ id, state: "learnable" })
    return out
  }

  const onLearn = (id: string) => {
    const r = learnSkillAction(unit.id, id)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("success")
    celebrate()
    toast(tr(`Learned: ${skillInfo(id)?.name ?? id}`, `Изучено: ${skillInfo(id)?.name ?? id}`))
  }
  const onEquip = (s: keyof UnitSkills, id: string | undefined) => {
    const r = equipAction(unit.id, s, id)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("select")
    setSlot(null)
  }

  return (
    <div className="screen">
      <TopBar title={displayName(unit)} right={<ResourceBar />} onBack={() => navigate("/army", true)} />
      <div className="screen-body">
        <div className="card row pop-in unit-hero">
          <span key={bounceKey} className={`avatar-wrap ${bounceKey ? "bounce" : ""}`}>
            <UnitAvatar unit={unit} size="xl" pose={happy ? "happy" : "idle"} />
          </span>
          <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
            <div className="muted small">
              {speciesName(unit)}
              {" "}
              ·
              {breedDef(unit.breedId).name}
              {" "}
              ·
              {unitClassName(unit)}
            </div>
            <div className="row wrap">
              <RarityStars rarity={unit.rarity} />
              <b>
                {tr("Lv.", "Ур.")}
                {unit.level}
              </b>
            </div>
            <div className="row wrap">
              <MoveBadge classId={cls.id} />
              <WeaponBadge skill={cls.weaponSkill} />
            </div>
            <StatBar value={unit.xp} max={XP.perLevel} kind="xp" animate />
            <div className="row between small muted">
              <span>
                XP
                {" "}
                {unit.xp}
                /
                {XP.perLevel}
              </span>
              <span className="gold">
                SP
                {unit.sp}
              </span>
            </div>
          </div>
        </div>

        <div className="card stack pop-in" style={{ animationDelay: "60ms" }}>
          <div className="row between">
            <b>{tr("Stats", "Характеристики")}</b>
            <span className="muted small">
              {tr("Weapon Mt", "Mt оружия")}
              {" "}
              {weaponMt(unit)}
              {unit.weaponTier ? ` · ${tr("sharpened", "заточка")} ${"I".repeat(unit.weaponTier)}` : ""}
            </span>
          </div>
          <StatsGrid stats={stats} animate atkLabel={atkLabel(unit)} />
          <div className="stack" style={{ gap: 4 }}>
            {STATS.map((s, i) => (
              <div key={s} className="row small">
                <span className="muted" style={{ width: 32 }}>
                  {s === "atk" ? atkLabel(unit) : STAT_LABELS[s]}
                </span>
                <div className="grow">
                  <StatBar value={own[s]} max={Math.max(1, atMax[s])} kind="growth" animate delay={120 + i * 60} />
                </div>
                <span className="muted" style={{ width: 52, textAlign: "right" }}>
                  {own[s]}
                  →
                  {atMax[s]}
                </span>
              </div>
            ))}
            <div className="muted small">
              {tr(
                `Stats grow linearly up to level ${MAX_LEVEL} (character model, rarity ${unit.rarity}★); on the right — the value at level ${MAX_LEVEL} in this class.`,
                `Статы растут линейно до ${MAX_LEVEL} уровня (модель персонажа, редкость ${unit.rarity}★); справа — сколько будет на ${MAX_LEVEL}-м в этом классе.`
              )}
            </div>
          </div>
        </div>

        <div className="card stack pop-in" style={{ animationDelay: "80ms" }}>
          <div className="row between">
            <b>
              {tr("Class:", "Класс:")}
              {" "}
              {unitClassName(unit)}
              {" "}
              <span className="muted small">
                ·
                {TIER_LABELS[cls.tier]}
              </span>
            </b>
            {hasClassUpgrade(unit) && <span className="chip red pop">{tr("Promotion", "Повышение")}</span>}
          </div>
          <ClassInfoBlock classId={unit.classId} unit={unit} tier={false} />
          <div className="muted small">{`${weaponLine(unit)} · ${aptitudeLine(unit)}`}</div>
          <SkillRanks unit={unit} />
          <Button block icon="🎓" onClick={() => setClassOpen(true)}>
            {tr("Change class", "Сменить класс")}
          </Button>
        </div>

        {trait && (
          <div className="card pop-in" style={{ animationDelay: "100ms" }}>
            <b>
              {tr("★ Trait:", "★ Особенность:")}
              {trait.name}
            </b>
            <div className="muted small">{trait.desc}</div>
          </div>
        )}

        <div className="card stack pop-in" style={{ animationDelay: "120ms" }}>
          <b>{tr("Gear", "Снаряжение")}</b>
          <div className="slot" onClick={() => setGear("weapon")}>
            <span className="slot-ico">⚔️</span>
            <span className="slot-text">
              <div className="slot-name">{tr("Weapon", "Оружие")}</div>
              <div className="slot-value">{weaponLine(unit)}</div>
            </span>
            <span className="muted">›</span>
          </div>
          <div className="slot" onClick={() => setGear("talisman")}>
            <span className="slot-ico">🔮</span>
            <span className="slot-text">
              <div className="slot-name">{tr("Talisman", "Талисман")}</div>
              <div className={`slot-value ${unit.accessory ? "" : "empty"}`}>
                {unit.accessory ? `${talismanDef(unit.accessory).icon} ${talismanDef(unit.accessory).name}` : tr("— empty —", "— пусто —")}
              </div>
            </span>
            <span className="muted">›</span>
          </div>
        </div>

        <div className="card stack pop-in" style={{ animationDelay: "140ms" }}>
          <b>{tr("Skills", "Навыки")}</b>
          {SLOTS.map((s) => {
            const id = unit.skills[s]
            const info = id ? skillInfo(id) : undefined
            const hasLearnable = learnable.some(l => slotOf(l) === s && skillCost(l) <= unit.sp)
            const letter = s === "a" || s === "b" || s === "c"
            return (
              <div key={s} className="slot" onClick={() => setSlot(s)}>
                <span className={`slot-ico ${letter ? "letter" : ""}`}>{SLOT_ICONS[s]}</span>
                <span className="slot-text">
                  <div className="slot-name">{slotName(s)}</div>
                  <div className={`slot-value ${info ? "" : "empty"}`}>{info?.name ?? tr("— empty —", "— пусто —")}</div>
                </span>
                {hasLearnable && <span className="chip red pop">{tr("New", "Новое")}</span>}
                <span className="muted">›</span>
              </div>
            )
          })}
        </div>

        <div className="card stack pop-in" style={{ animationDelay: "180ms" }}>
          <b>{tr("Upgrades", "Прокачка")}</b>
          <Button block icon="🏋️" onClick={onTrain} disabled={unit.level >= MAX_LEVEL || save.profile.treats < tCost}>
            {tr("Train: +1 level", "Тренировка: +1 уровень")}
            {" "}
            {unit.level >= MAX_LEVEL ? tr("(max)", "(максимум)") : `(🦴 ${tCost})`}
          </Button>
          <Button block icon="🔪" onClick={onSharpen} disabled={sCost === null || save.profile.treats < sCost}>
            {tr("Sharpen weapon", "Заточить оружие")}
            {" "}
            {sCost === null ? tr("(maxed)", "(предел)") : `(🦴 ${sCost}, Mt +2)`}
          </Button>
          {unit.rarity < 5 && (
            <Button block icon="🌟" onClick={() => setRebirthOpen(true)} disabled={!canRebirth(unit)}>
              {tr(`Rebirth: Lv. 1, ★${nextStar}`, `Перерождение: 1 ур., ★${nextStar}`)}
              {" "}
              {canRebirth(unit) ? "" : tr(`(from Lv. ${MAX_LEVEL})`, `(с ${MAX_LEVEL} ур.)`)}
            </Button>
          )}
          <Button block danger onClick={() => setRelease(1)}>
            {tr("Release", "Отпустить")}
          </Button>
        </div>

        <div className="card stack pop-in" style={{ animationDelay: "220ms" }}>
          <b>{tr("History", "История")}</b>
          <div className="stats-table">
            <span className="k">{tr("Battles", "Боёв")}</span>
            <span className="v">{unit.history.battles}</span>
            <span className="k">{tr("Kills", "Убийств")}</span>
            <span className="v">{unit.history.kills}</span>
            <span className="k">{tr("Damage dealt", "Урона нанесено")}</span>
            <span className="v">{unit.history.damageDealt}</span>
            <span className="k">{tr("Damage taken", "Урона получено")}</span>
            <span className="v">{unit.history.damageTaken}</span>
            {unit.history.closestCall < 999 && (
              <>
                <span className="k">{tr("Closest call", "Ближе всего к смерти")}</span>
                <span className="v danger">
                  {unit.history.closestCall}
                  {" "}
                  HP
                </span>
              </>
            )}
          </div>
          <p className="muted small">
            «
            {personalityText(unit.personalityId)}
            »
          </p>
        </div>
      </div>

      <BottomSheet
        open={!!slot}
        onClose={() => setSlot(null)}
        title={slot ? `${SLOT_ICONS[slot]} ${slotName(slot)}` : ""}
      >
        {slot && (
          <div className="stack">
            {slotOptions(slot).map(({ id, state }) => {
              const info = skillInfo(id)
              if (!info) return null
              const cost = skillCost(id)
              return (
                <div key={id} className={`skill-item ${state === "equipped" ? "equipped" : ""}`}>
                  <div className="txt">
                    <div>
                      <b>{info.name}</b>
                      {" "}
                      {state === "equipped" && <span className="chip squad">{tr("Equipped", "Экипирован")}</span>}
                    </div>
                    <div className="desc">{info.desc}</div>
                  </div>
                  {state === "learned" && (
                    <Button sm primary onClick={() => onEquip(slot, id)}>
                      {tr("Equip", "Надеть")}
                    </Button>
                  )}
                  {state === "learnable" && (
                    <Button sm onClick={() => onLearn(id)} disabled={unit.sp < cost}>
                      {tr("Learn ·", "Изучить ·")}
                      {" "}
                      {cost}
                      {" "}
                      SP
                    </Button>
                  )}
                </div>
              )
            })}
            {slotOptions(slot).length === 0 && <p className="muted">{tr("No skills available for this slot.", "Нет доступных навыков для этого слота.")}</p>}
            {unit.skills[slot] && (
              <Button block ghost onClick={() => onEquip(slot, undefined)}>
                {tr("Unequip", "Снять")}
              </Button>
            )}
            <p className="muted small">
              SP:
              {" "}
              <b className="gold">{unit.sp}</b>
              {tr(". Skill points are earned in battle.", ". Очки навыков копятся в боях.")}
            </p>
          </div>
        )}
      </BottomSheet>

      <WeaponSheet unit={unit} open={gear === "weapon"} onClose={() => setGear(null)} toast={toast} />
      <TalismanSheet unit={unit} open={gear === "talisman"} onClose={() => setGear(null)} toast={toast} />

      <ClassSheet
        unit={unit}
        army={army.units}
        open={classOpen}
        onClose={() => setClassOpen(false)}
        onPick={onReclass}
      />

      <ConfirmModal
        open={rebirthOpen}
        title={tr(`Rebirth as ★${nextStar}?`, `Переродить в ★${nextStar}?`)}
        text={tr(
          `${displayName(unit)} goes back to level 1 and gains a star: at level ${MAX_LEVEL} the stats will be higher than now. `
          + "Class, weapon, skills and SP stay."
          + (nextStar > save.profile.maxRarity ? ` ★${nextStar} fighters will start appearing in the Shop, rewards and new rosters.` : ""),
          `${displayName(unit)} вернётся на 1-й уровень и получит звезду: к ${MAX_LEVEL}-му статы будут выше, чем сейчас. `
          + "Класс, оружие, навыки и SP сохранятся."
          + (nextStar > save.profile.maxRarity ? ` Бойцы с ★${nextStar} начнут появляться в магазине, наградах и новых ростерах.` : "")
        )}
        confirmLabel={tr("Rebirth", "Переродить")}
        onConfirm={onRebirth}
        onClose={() => setRebirthOpen(false)}
      />
      <ConfirmModal
        open={release === 1}
        title={tr("Release this fighter?", "Отпустить бойца?")}
        text={tr(
          `${displayName(unit)} will leave forever and go to the Graveyard marked “left on their own”. `
          + "Bought weapons and talismans return to your inventory.",
          `${displayName(unit)} уйдёт навсегда и попадёт на Кладбище с пометкой «ушёл сам». `
          + "Купленное оружие и талисман вернутся в инвентарь."
        )}
        confirmLabel={tr("Release", "Отпустить")}
        danger
        onConfirm={() => setRelease(2)}
        onClose={() => setRelease(0)}
      />
      <ConfirmModal
        open={release === 2}
        title={tr("Sure?", "Точно?")}
        text={tr("There’s no undo. None at all.", "Вернуть нельзя. Совсем.")}
        confirmLabel={tr("Yes, release", "Да, отпустить")}
        danger
        onConfirm={onRelease}
        onClose={() => setRelease(0)}
      />
      {toastEl}
    </div>
  )
}
