import { useStore } from "@nanostores/react"
import type { UnitInstance, UnitSkills } from "@game/core/types"
import { MAX_LEVEL } from "@game/core/types"
import { learnableNow, rankMt, skillCost, slotOf, unitWeapon, weaponMt, weaponRank, weaponShortfall } from "@game/core/units"
import { itemCount } from "@game/core/items"
import { WEAPONS } from "@game/content/weapons"
import { TALISMANS, talismanDef } from "@game/content/items"
import { skillInfo } from "@game/content/index"
import { COMBAT } from "@game/content/balance"
import { ringSvg, weaponIconSvg } from "@game/art/gear"
import {
  APTITUDE_CURVES,
  MOVEMENT_SKILLS,
  RANKS,
  SKILL_LABELS,
  WEAPON_GRADE_LABELS,
  WEAPON_SKILLS,
  rankAtLevel,
  rankIndex,
  type Rank,
  type Skill,
  type WeaponSkill
} from "@shared/character/skills"
import { $inventory } from "@game/state/save"
import { BottomSheet } from "./Sheet"
import { tr } from "@game/i18n"

/** SVG-иконка снаряжения (оружие или кольцо талисмана). */
export function GearIcon({ svg, size = 56 }: { svg: string, size?: number }) {
  return <span className="gear-icon" style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Иконка вида оружия в плитках владения — железная, как «образец» навыка. */
const skillIcon = (s: WeaponSkill): string => weaponIconSvg(s, "iron")

const MOVE_ICON: Record<(typeof MOVEMENT_SKILLS)[number], string> = { riding: "🐎", flying: "🪽", heavyArmor: "🛡️" }

/** Следующий ранг навыка и уровень, на котором он придёт (нет — навык уже на потолке склонности). */
function nextRank(unit: UnitInstance, skill: Skill): { rank: Rank, level: number } | undefined {
  const aptitude = unit.aptitudes[skill]
  const now = rankAtLevel(aptitude, unit.level)
  for (let level = unit.level + 1; level <= MAX_LEVEL; level++) {
    const rank = rankAtLevel(aptitude, level)
    if (rank !== now) return { rank, level }
  }
  return undefined
}

/* ---------- Владение оружием ---------- */

/** «+1 с D+, +2 с B, +3 с A+» — пороги бонуса к Mt, из той же формулы, что и бой (`rankMt`). */
function mtSteps(): string {
  return [1, 2, 3].map(n => `+${n} ${tr("from", "с")} ${RANKS.find(r => rankMt(r) >= n)}`).join(", ")
}

/** Ранги навыков бойца плитками: иконка, буква ранга; ★ талант, ▼ слабость, рамка — оружие в лапах. */
export function MasteryGrid({ unit, onPick }: { unit: UnitInstance, onPick: (s: Skill) => void }) {
  const cell = (s: Skill, icon: React.ReactNode) => {
    const aptitude = unit.aptitudes[s]
    const rank = rankAtLevel(aptitude, unit.level)
    return (
      <button key={s} type="button" className={`mastery-cell ${aptitude} ${s === unit.weaponSkill ? "current" : ""}`} onClick={() => onPick(s)}>
        {aptitude !== "normal" && <span className="mastery-mark">{aptitude === "talent" ? "★" : "▼"}</span>}
        {icon}
        <b className="mastery-rank">{rank}</b>
        <span className="mastery-name">{SKILL_LABELS[s]}</span>
      </button>
    )
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="mastery-grid">{WEAPON_SKILLS.map(s => cell(s, <GearIcon svg={skillIcon(s)} size={30} />))}</div>
      <div className="mastery-grid mastery-grid--move">
        {MOVEMENT_SKILLS.map(s => cell(s, <span className="mastery-emoji" aria-hidden="true">{MOVE_ICON[s]}</span>))}
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
  const rank = rankAtLevel(aptitude, unit.level)
  const next = nextRank(unit, skill)
  const cap = APTITUDE_CURVES[aptitude]
  const isWeapon = (WEAPON_SKILLS as readonly string[]).includes(skill)
  const capText = aptitude === "talent"
    ? tr(`★ Talent: grows fast, reaches ${cap.end} by Lv. ${cap.endLevel}.`, `★ Талант: растёт быстро, ${cap.end} к ${cap.endLevel} ур.`)
    : aptitude === "weak"
      ? tr(`▼ Weakness: grows slowly, no higher than ${cap.end}.`, `▼ Слабость: растёт медленно, не выше ${cap.end}.`)
      : tr(`Grows steadily up to ${cap.end} by Lv. ${cap.endLevel}.`, `Растёт ровно, до ${cap.end} к ${cap.endLevel} ур.`)
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
        <div className="chip-row">
          <span className="chip">{capText}</span>
        </div>
        <p className="small" style={{ margin: 0 }}>
          {next
            ? tr(`Next rank: ${next.rank} at Lv. ${next.level}.`, `Следующий ранг: ${next.rank} на ${next.level} ур.`)
            : tr("This is the ceiling for this fighter.", "Это потолок для этого бойца.")}
        </p>
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
