import { lootShare } from "@game/core/progression"
import { turnLimitOf } from "@game/content/balance"
import type { BattleState } from "@game/core/types"
import { tr } from "@game/i18n"
import { BUFFS } from "@game/content/expedition"
import { IconText } from "../components/Icon"

/**
 * Верхняя полоса HUD во всю ширину: ход (в чаще — без лимита, а в разведке вместо него «Разведка»), ключи и бонусы
 * отряда в чаще, добыча. Чья фаза — видно по цвету кромки полосы (красная — игрока, светлая — врага).
 */
export function TopHud({ battle }: { battle: BattleState }) {
  const isPlayer = battle.phase === "player"
  const limit = turnLimitOf(battle.map)
  // Бонусы всего отряда (личные — значками над бойцами)
  const teamBuffs = (battle.expedition?.buffs.team ?? []).map(b => BUFFS[b].icon).join("")
  const keys = battle.expedition
    ? Object.values(battle.expedition.keys).filter(k => k.unitId && battle.units[k.unitId]?.side === "player").length
    : 0
  return (
    <div className={`bf-hud-row bf-phase ${isPlayer ? "player" : "enemy"}`}>
      {battle.explore
        ? (
            <span
              className="bf-phase-turn"
              title={tr(
                "No enemies are awake: tap a tile and the squad walks there. Stepping into the purple haze wakes the enemies — then it’s turn-based combat",
                "Враги не проснулись: нажмите на клетку — отряд пойдёт туда. В фиолетовой дымке враги проснутся — начнётся пошаговый бой"
              )}
            >
              {tr("Exploring", "Разведка")}
            </span>
          )
        : Number.isFinite(limit)
          ? (
              <span
                className={`bf-phase-turn ${limit - battle.turn < 3 ? "late" : ""}`}
                title={tr(`The battle lasts at most ${limit} turns, then your squad retreats`, `Бой длится не больше ${limit} ходов, затем отряд отступает`)}
              >
                {`${tr("Turn", "Ход")} ${battle.turn}/${limit}`}
              </span>
            )
          : <span className="bf-phase-turn">{`${tr("Turn", "Ход")} ${battle.turn}`}</span>}
      {/* Чаща: ключи у отряда и бонусы всего отряда — только когда они есть */}
      {(keys > 0 || teamBuffs) && (
        <span
          className="bf-chip"
          title={tr("Keys carried by your squad and squad-wide bonuses", "Ключи у отряда и бонусы всего отряда")}
        >
          <IconText text={[keys > 0 ? `🗝 ${keys}` : "", teamBuffs].filter(Boolean).join(" · ")} />
        </span>
      )}
      <span className="bf-grow" />
      {battle.stats.loot > 0 && (
        <span
          className="bf-chip bf-loot"
          title={tr(
            `Loot at risk: all of it only on victory, ${Math.round(lootShare("defeat") * 100)}% on defeat, `
            + `${Math.round(lootShare("retreat") * 100)}% on retreat`,
            `Добыча под угрозой: целиком — только при победе, при поражении — ${Math.round(lootShare("defeat") * 100)}%, `
            + `при отступлении — ${Math.round(lootShare("retreat") * 100)}%`
          )}
        >
          <IconText text={`${tr("Collected", "Собрано")}: ${battle.stats.loot} 🦴`} />
        </span>
      )}
    </div>
  )
}
