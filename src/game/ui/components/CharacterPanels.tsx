import type { UnitInstance } from "@game/core/types"
import { canTakeClassNow, isUniqueClassId, openClasses, unitWeapon, weaponRank } from "@game/core/units"
import { CLASS_IDS, classInfo, fwClass } from "@game/content/classes"
import { CLASS_TIERS, TIER_LABELS, TIER_LEVELS, earliestLevelOf } from "@shared/character/classes"
import { SKILLS, SKILL_LABELS, rankAtLevel, skillsWith } from "@shared/character/skills"
import { Button } from "./Button"
import { ClassFacts, ClassRoleLine, classRoleText } from "./ClassInfo"
import { BottomSheet } from "./Sheet"
import { tr } from "@game/i18n"

const APTITUDE_MARK = { talent: "★", normal: "", weak: "▼" } as const

/** «Таланты: Sword, Flying · Слабости: Bow» — склонности персонажа модели. */
export function aptitudeLine(unit: UnitInstance): string {
  const talents = skillsWith(unit.aptitudes, "talent").map(s => SKILL_LABELS[s])
  const weak = skillsWith(unit.aptitudes, "weak").map(s => SKILL_LABELS[s])
  const t = talents.join(", ") || "—"
  return weak.length
    ? tr(`Talents: ${t} · Weaknesses: ${weak.join(", ")}`, `Таланты: ${t} · Слабости: ${weak.join(", ")}`)
    : tr(`Talents: ${t}`, `Таланты: ${t}`)
}

/** Оружие бойца: оружие в лапах и ранг навыка, которым он им владеет. */
export function weaponLine(unit: UnitInstance): string {
  return `${unitWeapon(unit).name} · ${SKILL_LABELS[unit.weaponSkill]} ${weaponRank(unit)}`
}

/** Ранги всех навыков на уровне бойца; ★ — талант, ▼ — слабость. */
export function SkillRanks({ unit }: { unit: UnitInstance }) {
  return (
    <div className="rank-grid">
      {SKILLS.map((s) => {
        const aptitude = unit.aptitudes[s]
        return (
          <div key={s} className={`rank-cell ${aptitude} ${s === unit.weaponSkill ? "current" : ""}`}>
            <span className="rank-name">
              {APTITUDE_MARK[aptitude]}
              {SKILL_LABELS[s]}
            </span>
            <b className="rank-value">{rankAtLevel(aptitude, unit.level)}</b>
          </div>
        )
      })}
    </div>
  )
}

interface ClassSheetProps {
  unit: UnitInstance
  /** Бойцы армии: божественный класс может быть только у одного. */
  army: UnitInstance[]
  open: boolean
  onClose: () => void
  onPick: (classId: string) => void
}

/** Шторка смены класса: что даёт каждый открытый класс (роль, ход, бонус, оружие), по ярусам; ниже — ближайшие закрытые. */
export function ClassSheet({ unit, army, open, onClose, onPick }: ClassSheetProps) {
  const opened = new Set(open ? openClasses(unit) : [])
  const takenDivine = new Set(army.filter(u => u.id !== unit.id && isUniqueClassId(u.classId)).map(u => u.classId))
  const upcoming = open
    ? CLASS_IDS.filter(id => !opened.has(id))
        .map(id => ({ id, level: earliestLevelOf(fwClass(id), unit.aptitudes) }))
        .filter((x): x is { id: string, level: number } => x.level !== undefined)
        .sort((a, b) => a.level - b.level)
        .slice(0, 6)
    : []
  const pick = (id: string) => {
    const blocked = takenDivine.has(id)
    const current = id === unit.classId
    return (
      <div key={id} className={`card class-pick stack ${current ? "current" : ""}`} style={{ gap: 6, padding: 12 }}>
        <div className="class-pick-head">
          <b>{fwClass(id).name}</b>
          {current
            ? <span className="chip squad">{tr("Current", "Сейчас")}</span>
            : (
                <Button sm primary disabled={blocked || !canTakeClassNow(unit, id)} onClick={() => onPick(id)}>
                  {tr("Pick", "Выбрать")}
                </Button>
              )}
        </div>
        <ClassRoleLine classId={id} />
        <div className="class-summary">{classInfo(id).summary}</div>
        {blocked && <div className="small danger">{tr("Another fighter already has this divine class", "Божественный класс уже у другого бойца")}</div>}
        <details>
          <summary>{tr("Move, stat bonus, weapons ›", "Ход, бонус к статам, оружие ›")}</summary>
          <ClassFacts classId={id} unit={unit} />
        </details>
      </div>
    )
  }
  return (
    <BottomSheet open={open} onClose={onClose} title={tr("🎓 Class", "🎓 Класс")}>
      {open && (
        <div className="stack">
          <p className="class-legend muted">
            {tr(
              "A class sets the battle role: how many tiles a fighter moves, where it can’t go and what stat bonus it gets. "
              + "Weapons are separate items: the class only hints at what the fighter is best with. Switching is free.",
              "Класс задаёт роль в бою: сколько клеток боец проходит, где не пройдёт и какой бонус к статам получает. "
              + "Оружие — отдельный предмет: класс лишь подсказывает, чем бойцу сражаться выгоднее. Смена бесплатна."
            )}
          </p>
          {pick(unit.classId)}
          {CLASS_TIERS.map((tier) => {
            const ids = CLASS_IDS.filter(id => opened.has(id) && fwClass(id).tier === tier && id !== unit.classId)
            if (ids.length === 0) return null
            return (
              <div key={tier} className="stack" style={{ gap: 8 }}>
                <b className="small muted">{tr(`${TIER_LABELS[tier]} · from Lv. ${TIER_LEVELS[tier]}`, `${TIER_LABELS[tier]} · с ${TIER_LEVELS[tier]} ур.`)}</b>
                {ids.map(pick)}
              </div>
            )
          })}
          {upcoming.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <b className="small muted">{tr("Unlocks later", "Откроются позже")}</b>
              {upcoming.map(({ id, level }) => (
                <div key={id} className="row between small">
                  <span>
                    {`${fwClass(id).name} `}
                    <span className="muted">{`· ${classRoleText(id)}`}</span>
                  </span>
                  <span className="muted">{tr(`from Lv. ${level}`, `с ${level} ур.`)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="muted small">
            {tr(
              `A class unlocks when the level reaches its tier (${CLASS_TIERS.slice(1).map(t => TIER_LEVELS[t]).join(" / ")}) `
              + "and skill ranks meet the class requirements.",
              `Класс открывается, когда уровень достигает яруса (${CLASS_TIERS.slice(1).map(t => TIER_LEVELS[t]).join(" / ")}), `
              + "а ранги навыков — требований класса."
            )}
          </p>
        </div>
      )}
    </BottomSheet>
  )
}
