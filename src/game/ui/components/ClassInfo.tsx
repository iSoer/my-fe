import type { UnitInstance } from "@game/core/types"
import { classInfo, classRole } from "@game/content/classes"
import { SKILL_LABELS, rankAtLevel } from "@shared/character/skills"
import { MOVE_EMOJI } from "../lib/format"
import { plural, tr } from "@game/i18n"

/** Значок и роль класса в бою («⚡ Дуэлянт»); `tier` — ещё и ярус. */
export function ClassRoleLine({ classId, tier = false }: { classId: string, tier?: boolean }) {
  const info = classInfo(classId)
  return (
    <span className="class-role">
      <span className="class-role-ico" aria-hidden="true">{info.icon}</span>
      <span className="class-role-name">{info.role}</span>
      {tier && <span className="muted small">{tr(`${info.tierLabel} · from Lv. ${info.tierLevel}`, `${info.tierLabel} · с ${info.tierLevel} ур.`)}</span>}
    </span>
  )
}

/** Коротко для строк списка: «⚡ Дуэлянт». */
export function classRoleText(classId: string): string {
  const r = classRole(classId)
  return `${r.icon} ${r.role}`
}

/** Передвижение одной строкой: «👣 Infantry · ход 2». */
export function moveText(classId: string): string {
  const info = classInfo(classId)
  return `${MOVE_EMOJI[info.moveType]} ${info.moveLabel} · ${tr("move", "ход")} ${info.moveRange}`
}

/**
 * Что даёт класс: передвижение с правилами местности, бонус к статам, оружие класса (с рангами бойца, если он есть)
 * и требования. Оружие бойца — предмет, класс лишь подсказывает, чем ему сражаться выгоднее.
 */
export function ClassFacts({ classId, unit }: { classId: string, unit?: UnitInstance }) {
  const info = classInfo(classId)
  const cells = `${info.moveRange} ${plural(info.moveRange, ["tile", "tiles"], ["клетка", "клетки", "клеток"])}`
  return (
    <dl className="class-facts">
      <dt>{tr("Move", "Ход")}</dt>
      <dd>{`${MOVE_EMOJI[info.moveType]} ${info.moveLabel}: ${cells}, ${info.moveNote}`}</dd>
      <dt>{tr("Bonus", "Бонус")}</dt>
      <dd>
        {info.bonus.length === 0
          ? <span className="muted">{tr("none", "нет")}</span>
          : (
              <span className="bonus-chips">
                {info.bonus.map(b => (
                  <span key={b.label} className={`bonus-chip ${b.value > 0 ? "up" : "down"}`}>
                    {`${b.label} ${b.value > 0 ? "+" : "−"}${Math.abs(b.value)}`}
                  </span>
                ))}
              </span>
            )}
      </dd>
      <dt>{tr("Weapons", "Оружие")}</dt>
      <dd>
        {info.weapons
          .map(w => (unit ? `${SKILL_LABELS[w]} ${rankAtLevel(unit.aptitudes[w], unit.level)}` : SKILL_LABELS[w]))
          .join(", ")}
      </dd>
      <dt>{tr("Needs", "Нужно")}</dt>
      <dd>
        {[tr(`Lv. ${info.tierLevel}`, `${info.tierLevel} ур.`), ...info.requires].join(" · ")}
        {info.unique ? tr(" · one per Army", " · один на армию") : ""}
      </dd>
    </dl>
  )
}

/** Роль, пояснение и факты — полный блок о классе; `tier: false`, если ярус уже показан рядом. */
export function ClassInfoBlock({ classId, unit, tier = true }: { classId: string, unit?: UnitInstance, tier?: boolean }) {
  const info = classInfo(classId)
  return (
    <div className="class-info">
      <ClassRoleLine classId={classId} tier={tier} />
      <div className="class-summary">{info.summary}</div>
      <ClassFacts classId={classId} unit={unit} />
    </div>
  )
}
