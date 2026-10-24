import type { MoveType, TerrainId, UnitInstance } from "@game/core/types"
import { classInfo, classRole } from "@game/content/classes"
import { SKILL_LABELS, rankAtLevel } from "@shared/character/skills"
import { moveCost } from "@game/core/map/pathing"
import { TERRAIN_BONUS } from "@game/content/balance"
import { unitClassName } from "@game/core/units"
import { tileSvg } from "@game/art/tile"
import { weaponIconSvg } from "@game/art/gear"
import { MOVE_EMOJI } from "../lib/format"
import { GearIcon } from "./UnitPanels"
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
                    {`${b.label} ${b.value > 0 ? "+" : "−"}${Math.abs(b.value)}%`}
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

/* ---------- Панель класса в карточке бойца ---------- */

const TERRAINS: readonly TerrainId[] = ["plain", "forest", "mountain", "water", "wall"]

function terrainName(t: TerrainId): string {
  switch (t) {
    case "plain": return tr("Plain", "Равнина")
    case "forest": return tr("Forest", "Лес")
    case "mountain": return tr("Mountain", "Горы")
    case "water": return tr("Water", "Вода")
    default: return tr("Wall", "Стена")
  }
}

/** Против чего тип передвижения уязвим (×1.5 урона), как в `content/weapons.ts`. */
function moveWeakness(m: MoveType): string | undefined {
  switch (m) {
    case "flier": return tr("Bows hit ×1.5", "Луки бьют ×1.5")
    case "armored": return tr("Armorslayers hit ×1.5", "Armorslayer бьёт ×1.5")
    case "cavalry": return tr("Horseslayers hit ×1.5", "Horseslayer бьёт ×1.5")
    default: return undefined
  }
}

/** Передвижение наглядно: дальность хода клетками и цена каждой местности по правилам боя (`moveCost`) и бонус стоящему на ней. */
export function MovePanel({ classId }: { classId: string }) {
  const info = classInfo(classId)
  const weakness = moveWeakness(info.moveType)
  return (
    <div className="class-move">
      <div className="class-move-head">
        <span className="class-move-ico" aria-hidden="true">{MOVE_EMOJI[info.moveType]}</span>
        <span className="grow">
          <b>{info.moveLabel}</b>
          <span className="class-move-range" aria-label={tr(`Move ${info.moveRange}`, `Ход ${info.moveRange}`)}>
            {[1, 2, 3, 4].map(i => <i key={i} className={i <= info.moveRange ? "on" : ""} />)}
            <span className="small">{`${info.moveRange} ${plural(info.moveRange, ["tile", "tiles"], ["клетка", "клетки", "клеток"])}`}</span>
          </span>
        </span>
      </div>
      <div className="class-terrains">
        {TERRAINS.map((t) => {
          const cost = moveCost(t, info.moveType)
          const bonus = TERRAIN_BONUS[t]
          return (
            <div key={t} className={`class-terrain ${cost === null ? "no" : cost > 1 ? "slow" : "ok"}`}>
              <GearIcon svg={tileSvg("yard", t)} size={34} />
              <span className="class-terrain-name">{terrainName(t)}</span>
              <b title={bonus ? tr(`+${bonus.def} Def, +${bonus.res} Res`, `+${bonus.def} Def, +${bonus.res} Res`) : undefined}>
                {cost === null ? "✕" : cost > 1 ? tr(`${cost} pts`, `${cost} оч.`) : bonus ? `🛡+${bonus.def}` : "✓"}
              </b>
            </div>
          )
        })}
      </div>
      {weakness && <div className="class-weak">{`⚠ ${weakness}`}</div>}
    </div>
  )
}

/**
 * Класс в карточке бойца: роль и ярус, передвижение (дальность и местность), бонус к статам, оружие класса
 * с рангами бойца и кнопка смены класса с подсказкой, открыто ли повышение и когда следующий ярус.
 */
export function ClassPanel({ unit, openCount, upgrade, nextTierLevel, onChange }: {
  unit: UnitInstance
  /** Сколько классов открыто бойцу сейчас (вместе с текущим). */
  openCount: number
  upgrade: boolean
  /** Уровень, на котором откроется следующий ярус; нет — ярусы кончились. */
  nextTierLevel?: number
  onChange: () => void
}) {
  const info = classInfo(unit.classId)
  return (
    <div className="class-panel">
      <div className="class-panel-head">
        <span className="class-role-ico big" aria-hidden="true">{info.icon}</span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="class-panel-tier">{tr(`${info.tierLabel} · from Lv. ${info.tierLevel}`, `${info.tierLabel} · с ${info.tierLevel} ур.`)}</span>
          <b className="class-panel-name">{unitClassName(unit)}</b>
          <span className="class-role-name">{info.role}</span>
        </span>
      </div>
      <div className="class-summary">{info.summary}</div>

      <div className="class-section">
        <span className="class-section-title">{tr("Movement", "Передвижение")}</span>
        <MovePanel classId={unit.classId} />
      </div>

      <div className="class-section">
        <span className="class-section-title">{tr("Class stat multipliers", "Множители класса к статам")}</span>
        {info.bonus.length === 0
          ? <span className="muted small">{tr("none", "нет")}</span>
          : (
              <span className="bonus-chips">
                {info.bonus.map(b => (
                  <span key={b.label} className={`bonus-chip big ${b.value > 0 ? "up" : "down"}`}>
                    {`${b.label} ${b.value > 0 ? "+" : "−"}${Math.abs(b.value)}%`}
                  </span>
                ))}
              </span>
            )}
        <span className="muted small">{tr("Scale both the stats and their growth per level; already included in the stats above, works while the fighter is in this class.", "Меняют и статы, и их рост за уровень; уже учтены в статах выше и действуют, пока боец в этом классе.")}</span>
      </div>

      <div className="class-section">
        <span className="class-section-title">{tr("Class weapons", "Оружие класса")}</span>
        <div className="class-weapons">
          {info.weapons.map(w => (
            <span key={w} className="class-weapon">
              <GearIcon svg={weaponIconSvg(w, "iron")} size={28} />
              <span className="small">{SKILL_LABELS[w]}</span>
              <b>{rankAtLevel(unit.aptitudes[w], unit.level)}</b>
            </span>
          ))}
        </div>
        <span className="muted small">
          {tr(
            "Any fighter can wield any weapon; the class ranks show what opens it and what it fights best with.",
            "Сражаться можно любым оружием; ранги класса показывают, что его открывает и чем он воюет лучше."
          )}
        </span>
      </div>

      <button type="button" className={`class-change ${upgrade ? "upgrade" : ""}`} onClick={onChange}>
        <span className="class-change-ico" aria-hidden="true">{upgrade ? "⬆️" : "🎓"}</span>
        <span className="grow">
          <b>{upgrade ? tr("Promotion available!", "Доступно повышение!") : tr("Change class", "Сменить класс")}</b>
          <span className="small">
            {tr(`${openCount} ${openCount === 1 ? "class" : "classes"} open`, `открыто классов: ${openCount}`)}
            {nextTierLevel ? tr(` · next tier at Lv. ${nextTierLevel}`, ` · следующий ярус с ${nextTierLevel} ур.`) : ""}
          </span>
        </span>
        <span aria-hidden="true">›</span>
      </button>
    </div>
  )
}
