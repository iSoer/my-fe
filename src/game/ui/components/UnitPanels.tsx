import { useStore } from "@nanostores/react"
import type { UnitInstance, UnitSkills } from "@game/core/types"
import { learnableNow, rankMt, skillCost, slotOf, unitClassName, unitWeapon, weaponMt, weaponRank, weaponShortfall } from "@game/core/units"
import { classAffinity, rankProgress, skillRank, skillRate } from "@game/core/units/proficiency"
import { itemCount } from "@game/core/items"
import { WEAPONS } from "@game/content/weapons"
import { TALISMANS, talismanDef } from "@game/content/items"
import { skillInfo } from "@game/content/index"
import { APTITUDE_RATE, COMBAT } from "@game/content/balance"
import { ringSvg, weaponIconSvg } from "@game/art/gear"
import {
  MOVEMENT_SKILLS,
  RANKS,
  SKILL_LABELS,
  WEAPON_GRADE_LABELS,
  WEAPON_SKILLS,
  rankIndex,
  type Skill,
  type WeaponSkill
} from "@shared/character/skills"
import { $inventory } from "@game/state/save"
import { BottomSheet } from "./Sheet"
import { tr } from "@game/i18n"
import { Icon } from "./Icon"

/** SVG-иконка снаряжения (оружие или кольцо талисмана). */
export function GearIcon({ svg, size = 56 }: { svg: string, size?: number }) {
  return <span className="gear-icon" style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Иконка вида оружия в плитках владения — железная, как «образец» навыка. */
const skillIcon = (s: WeaponSkill): string => weaponIconSvg(s, "iron")

const MOVE_ICON: Record<(typeof MOVEMENT_SKILLS)[number], string> = { riding: "🐎", flying: "🪽", heavyArmor: "🛡️" }

/** «×4.5» — скорость роста навыка: склонность класса × личная склонность. */
const rateText = (rate: number): string => `×${Number.isInteger(rate) ? rate : rate.toFixed(1)}`

/* ---------- Владение оружием ---------- */

/** «+1 с D+, +2 с B, +3 с A+» — пороги бонуса к Mt, из той же формулы, что и бой (`rankMt`). */
function mtSteps(): string {
  return [1, 2, 3].map(n => `+${n} ${tr("from", "с")} ${RANKS.find(r => rankMt(r) >= n)}`).join(", ")
}

/** Ранги навыков бойца плитками: иконка, буква ранга; ★ талант, ▼ слабость, рамка — оружие в лапах. */
export function MasteryGrid({ unit, onPick }: { unit: UnitInstance, onPick: (s: Skill) => void }) {
  const cell = (s: Skill, icon: React.ReactNode) => {
    const aptitude = unit.aptitudes[s]
    const rank = skillRank(unit, s)
    const fast = skillRate(unit, s) >= 3
    return (
      <button key={s} type="button" className={`mastery-cell ${aptitude} ${s === unit.weaponSkill ? "current" : ""}`} onClick={() => onPick(s)}>
        {aptitude !== "normal" && <span className="mastery-mark">{aptitude === "talent" ? "★" : "▼"}</span>}
        {icon}
        <b className="mastery-rank">{rank}</b>
        {fast && <span className="mastery-fast" title={tr("Grows fast in this class", "Быстро растёт в этом классе")}>▲</span>}
        <span className="mastery-name">{SKILL_LABELS[s]}</span>
      </button>
    )
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="mastery-grid">{WEAPON_SKILLS.map(s => cell(s, <GearIcon svg={skillIcon(s)} size={30} />))}</div>
      <div className="mastery-grid mastery-grid--move">
        {MOVEMENT_SKILLS.map(s => cell(s, <span className="mastery-emoji" aria-hidden="true"><Icon emoji={MOVE_ICON[s]} /></span>))}
      </div>
      <div className="mastery-legend">
        <span className="gold">{tr("★ talent", "★ талант")}</span>
        <span className="danger">{tr("▼ weakness", "▼ слабость")}</span>
        <span>
          <i className="mastery-swatch" />
          {tr("in paws", "в лапах")}
        </span>
      </div>
    </div>
  )
}

/** Что даёт ранг навыка: бонус к Mt, каким оружием без штрафа, следующий ранг и потолок по склонности. */
export function MasterySheet({ unit, skill, onClose }: { unit: UnitInstance, skill: Skill | null, onClose: () => void }) {
  if (!skill) return <BottomSheet open={false} onClose={onClose}>{null}</BottomSheet>
  const aptitude = unit.aptitudes[skill]
  const progress = rankProgress(unit, skill)
  const rank = progress.rank
  const isWeapon = (WEAPON_SKILLS as readonly string[]).includes(skill)
  const classRate = classAffinity(unit.classId, skill)
  const personal = APTITUDE_RATE[aptitude]
  const rateLine = [
    tr(`Class ${unitClassName(unit)} ${rateText(classRate)}`, `Класс ${unitClassName(unit)} ${rateText(classRate)}`),
    ...(aptitude === "talent" ? [tr(`★ talent ${rateText(personal)}`, `★ талант ${rateText(personal)}`)] : []),
    ...(aptitude === "weak" ? [tr(`▼ weakness ${rateText(personal)}`, `▼ слабость ${rateText(personal)}`)] : [])
  ].join(" · ")
  const howText = isWeapon
    ? tr("Grows by fighting with this weapon: every clash, more for a hit and a finishing blow; staves also by healing.", "Растёт от боёв этим оружием: каждая схватка, больше — за удар и добивание; посох — ещё и от лечения.")
    : tr("Grows a little with every action in battle, faster in a class that uses it.", "Понемногу растёт от каждого действия в бою, быстрее — в классе, который им пользуется.")
  const grades = isWeapon ? WEAPONS.filter(w => w.kind === skill && w.variant === "basic") : []
  const held = skill === unit.weaponSkill
  return (
    <BottomSheet open onClose={onClose} title={`${SKILL_LABELS[skill]} · ${rank}`}>
      <div className="stack">
        {isWeapon
          ? (
              <>
                <div className="row" style={{ gap: 12 }}>
                  <GearIcon svg={skillIcon(skill as WeaponSkill)} size={52} />
                  <p className="grow" style={{ margin: 0 }}>
                    {rankMt(rank) > 0
                      ? tr(`Rank ${rank}: +${rankMt(rank)} Mt with every ${SKILL_LABELS[skill]} weapon.`, `Ранг ${rank}: +${rankMt(rank)} Mt к любому оружию ${SKILL_LABELS[skill]}.`)
                      : tr(`Rank ${rank}: no Mt bonus yet (${mtSteps()}).`, `Ранг ${rank}: бонуса к Mt пока нет (${mtSteps()}).`)}
                  </p>
                </div>
                <div className="mastery-grades">
                  {grades.map((w) => {
                    const ok = rankIndex(rank) >= rankIndex(w.requiredRank)
                    return (
                      <div key={w.id} className={`mastery-grade ${ok ? "is-ok" : "is-short"}`}>
                        <GearIcon svg={weaponIconSvg(w.kind, w.grade)} size={34} />
                        <span className="small">{WEAPON_GRADE_LABELS[w.grade]}</span>
                        <b className="small">{ok ? "✓" : `${w.requiredRank}`}</b>
                      </div>
                    )
                  })}
                </div>
                <p className="muted small" style={{ margin: 0 }}>
                  {tr(
                    `✓ — wielded freely. Below the weapon’s rank the fighter loses ${COMBAT.rankShortMt} Mt per missing step.`,
                    `✓ — владеет свободно. Если ранг ниже нужного оружию, боец теряет ${COMBAT.rankShortMt} Mt за каждую недостающую ступень.`
                  )}
                  {held ? ` ${tr(`In paws now: ${unitWeapon(unit).name}, Mt ${weaponMt(unit)}.`, `Сейчас в лапах: ${unitWeapon(unit).name}, Mt ${weaponMt(unit)}.`)}` : ""}
                </p>
              </>
            )
          : (
              <p style={{ margin: 0 }}>
                {tr(
                  `${SKILL_LABELS[skill]} doesn’t change damage: its rank opens classes — riders need Riding, fliers Flying, armored classes Heavy Armor.`,
                  `${SKILL_LABELS[skill]} не влияет на урон: ранг открывает классы — всадникам нужен Riding, летунам Flying, латникам Heavy Armor.`
                )}
              </p>
            )}
        {progress.next
          ? (
              <div className="stack" style={{ gap: 4 }}>
                <div className="row between small">
                  <span>{tr(`To ${progress.next}`, `До ${progress.next}`)}</span>
                  <b>{`${Math.floor(progress.have)}/${progress.need}`}</b>
                </div>
                <div className="bar"><div style={{ width: `${Math.min(100, (progress.have / Math.max(1, progress.need)) * 100)}%` }} /></div>
              </div>
            )
          : <p className="small gold" style={{ margin: 0 }}>{tr("★ Highest rank reached.", "★ Достигнут высший ранг.")}</p>}
        <div className="chip-row">
          <span className="chip">{`${tr("Growth", "Рост")} ${rateText(classRate * personal)}: ${rateLine}`}</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>{howText}</p>
      </div>
    </BottomSheet>
  )
}

/* ---------- Снаряжение ---------- */

/** Есть ли в инвентаре оружие лучше деревянного и свободный талисман — тогда на плитке «!». */
export function gearAlerts(unit: UnitInstance, inventory: Record<string, number>): { weapon: boolean, talisman: boolean } {
  return {
    weapon: unitWeapon(unit).grade === "wood" && WEAPONS.some(w => w.grade !== "wood" && itemCount(inventory, w.id) > 0),
    talisman: !unit.accessory && TALISMANS.some(t => itemCount(inventory, t.id) > 0)
  }
}

/** Оружие и талисман одной строкой: крупные иконки, «!» — есть что надеть. */
export function GearRow({ unit, onWeapon, onTalisman }: { unit: UnitInstance, onWeapon: () => void, onTalisman: () => void }) {
  const inventory = useStore($inventory)
  const w = unitWeapon(unit)
  const alerts = gearAlerts(unit, inventory)
  const short = weaponShortfall(unit) > 0
  const worn = unit.accessory ? talismanDef(unit.accessory) : undefined
  return (
    <div className="gear-row">
      <button type="button" className={`gear-tile ${alerts.weapon ? "attention" : ""}`} onClick={onWeapon}>
        <GearIcon svg={weaponIconSvg(w.kind, w.grade, w.variant)} />
        <span className="gear-text">
          <span className="gear-slot">{tr("Weapon", "Оружие")}</span>
          <b className="gear-name">{w.name}</b>
          <span className={`gear-sub ${short ? "danger" : ""}`}>
            {`Mt ${weaponMt(unit)}${unit.weaponTier ? ` · ${"I".repeat(unit.weaponTier)}` : ""} · ${SKILL_LABELS[w.kind]} ${weaponRank(unit)}`}
          </span>
          {alerts.weapon && <span className="gear-cta">{tr("Better one in stock!", "Есть оружие получше!")}</span>}
        </span>
        {alerts.weapon && <i className="gear-badge">!</i>}
      </button>
      <button type="button" className={`gear-tile ${worn ? "" : "empty"} ${alerts.talisman ? "attention" : ""}`} onClick={onTalisman}>
        <GearIcon svg={ringSvg(worn?.id)} />
        <span className="gear-text">
          <span className="gear-slot">{tr("Talisman", "Талисман")}</span>
          <b className="gear-name">{worn ? worn.name : tr("Empty", "Пусто")}</b>
          <span className="gear-sub">{worn ? worn.desc : alerts.talisman ? "" : tr("Buy one in the Shop", "Купите в Лавке")}</span>
          {alerts.talisman && <span className="gear-cta">{tr("Tap to equip", "Тап, чтобы надеть")}</span>}
        </span>
        {alerts.talisman && <i className="gear-badge">!</i>}
      </button>
    </div>
  )
}

/* ---------- Навыки ---------- */

const SKILL_SLOTS: { slot: keyof UnitSkills, icon: string, kind: string }[] = [
  { slot: "special", icon: "✨", kind: "special" },
  { slot: "assist", icon: "🤝", kind: "assist" },
  { slot: "a", icon: "", kind: "a" },
  { slot: "b", icon: "", kind: "b" },
  { slot: "c", icon: "", kind: "c" }
]

function slotLabel(s: keyof UnitSkills): string {
  switch (s) {
    case "special": return tr("Special", "Спецприём")
    case "assist": return tr("Assist", "Поддержка")
    case "a": return tr("Passive A", "Пассив A")
    case "b": return tr("Passive B", "Пассив B")
    case "c": return tr("Passive C", "Пассив C")
    default: return tr("Weapon", "Оружие")
  }
}

/** Подсказка слота: спецприём копит заряд, поддержка — действие вместо атаки, A/B/C — пассивы всегда. */
function slotHint(s: keyof UnitSkills): string {
  switch (s) {
    case "special": return tr("charges in battle", "копит заряд в бою")
    case "assist": return tr("instead of attacking", "вместо атаки")
    case "a": return tr("own stats", "свои статы")
    case "b": return tr("in combat", "в схватке")
    case "c": return tr("helps allies", "помогает своим")
    default: return ""
  }
}

/**
 * Навыки цветными плитками: спецприём и поддержка крупно, пассивы A/B/C рядом. Видно, что надето, а золотая
 * плашка «Изучить» — что на этот слот хватает SP прямо сейчас.
 */
export function SkillGrid({ unit, onSlot }: { unit: UnitInstance, onSlot: (s: keyof UnitSkills) => void }) {
  const learnable = learnableNow(unit)
  return (
    <div className="skill-grid">
      {SKILL_SLOTS.map(({ slot, icon, kind }) => {
        const id = unit.skills[slot]
        const info = id ? skillInfo(id) : undefined
        const options = learnable.filter(l => slotOf(l) === slot)
        const cheapest = options.length ? Math.min(...options.map(skillCost)) : undefined
        const canLearn = cheapest !== undefined && cheapest <= unit.sp
        return (
          <button key={slot} type="button" className={`skill-tile skill-tile--${kind} ${info ? "" : "empty"}`} onClick={() => onSlot(slot)}>
            <span className="skill-tile-head">
              {icon && <span className="skill-tile-ico">{icon}</span>}
              <span>{slotLabel(slot)}</span>
            </span>
            <b className="skill-tile-name">{info?.name ?? tr("Empty", "Пусто")}</b>
            <span className="skill-tile-hint">{slotHint(slot)}</span>
            {canLearn
              ? <span className="skill-tile-learn">{tr(`Learn · ${cheapest} SP`, `Изучить · ${cheapest} SP`)}</span>
              : options.length > 0 && <span className="skill-tile-more">{tr(`${options.length} to learn`, `доступно: ${options.length}`)}</span>}
          </button>
        )
      })}
    </div>
  )
}
