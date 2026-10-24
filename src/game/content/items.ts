import type { TalismanDef } from "@game/core/skills/types"
import type { Stat } from "@game/core/types"
import { STATS, bothAttacks } from "@game/core/types"
import { CHARACTER_STAT_LABELS as L } from "@shared/character/leveling"
import { tr } from "@game/i18n"

// Предметы Лавки: талисманы с пассивными свойствами. Оружие — `content/weapons.ts`.
// Цены — в описаниях ниже; медианный бой на «Нормально» отрядом 5-го уровня приносит ~125 🦴.

/** Подписи статов — из модели. */
const STAT: Record<Stat, string> = {
  hp: L.hp,
  str: L.attack,
  mag: L.specialAttack,
  spd: L.speed,
  def: L.defense,
  res: L.specialDefense
}

/** «+3 Str/Mag, +2 Spd»: одинаковая прибавка к Str и Mag — одной строкой. */
function statText(stats: Partial<Record<Stat, number>>): string {
  const both = !!stats.str && stats.str === stats.mag
  return STATS.filter(s => stats[s] && !(both && s === "mag"))
    .map(s => `+${stats[s]} ${both && s === "str" ? `${L.attack}/${L.specialAttack}` : STAT[s]}`)
    .join(", ")
}

const statTalisman = (
  id: string,
  [en, ru]: readonly [string, string],
  icon: string,
  price: number,
  stats: Partial<Record<Stat, number>>,
  minRosterLevel?: number
): TalismanDef => {
  const t: TalismanDef = {
    id,
    get name() {
      return tr(en, ru)
    },
    icon,
    desc: `${statText(stats)}.`,
    price,
    hooks: { statBonus: stats }
  }
  if (minRosterLevel) t.minRosterLevel = minRosterLevel
  return t
}

/** Талисманы: +3 к стату — 140 🦴; особые свойства — 180–240 🦴; сильные — с уровня ростера. */
export const TALISMANS: readonly TalismanDef[] = [
  statTalisman("tal_fang", ["Fang on a String", "Клык на шнурке"], "🦷", 140, { ...bothAttacks(3) }),
  statTalisman("tal_bell", ["Jingle Bell", "Бубенчик"], "🔔", 140, { spd: 3 }),
  statTalisman("tal_collar", ["Spiked Collar", "Шипастый ошейник"], "⛓️", 140, { def: 3 }),
  statTalisman("tal_ribbon", ["Satin Ribbon", "Атласная ленточка"], "🎀", 140, { res: 3 }),
  statTalisman("tal_heart", ["Felt Heart", "Сердечко из фетра"], "❤️", 120, { hp: 6 }),
  statTalisman("tal_claw", ["Leader's Claw", "Коготь вожака"], "🐾", 320, { ...bothAttacks(2), spd: 2, def: 2 }, 20),
  {
    id: "tal_book",
    get name() { return tr("Tattered Primer", "Потрёпанный букварь") },
    icon: "📖",
    get desc() { return tr("Battle XP ×1.5.", "Опыт в бою ×1.5.") },
    price: 180,
    hooks: { xpMultiplier: 1.5 }
  },
  {
    id: "tal_coin",
    get name() { return tr("Piggy-Bank Coin", "Монетка-копилка") },
    icon: "🪙",
    get desc() { return tr("Battle Treats ×1.15 if the fighter returns alive.", "Вкусняшки за бой ×1.15, если боец вернулся живым.") },
    price: 220,
    hooks: { treatsMultiplier: 1.15 }
  },
  {
    id: "tal_mint",
    get name() { return tr("Mint Leaf", "Листик мяты") },
    icon: "🍃",
    get desc() { return tr("Heals 4 HP at the start of each turn.", "В начале хода лечит 4 HP.") },
    price: 240,
    minRosterLevel: 10,
    hooks: {
      onTurnStart: (_state, self) => (self.hp < self.maxHp ? [{ type: "heal", unitId: self.unitId, amount: 4 }] : [])
    }
  },
  {
    id: "tal_foil",
    get name() { return tr("Tinfoil Cloak", "Плащ из фольги") },
    icon: "🛡️",
    get desc() { return tr("Enemy weapons are never effective against the wearer.", "Оружие врага не бывает эффективным против бойца.") },
    price: 200,
    hooks: { negateEffective: true }
  }
]

const TALISMAN_MAP = new Map(TALISMANS.map(t => [t.id, t]))

export function talismanDef(id: string): TalismanDef {
  const t = TALISMAN_MAP.get(id)
  if (!t) throw new Error(`unknown talisman ${id}`)
  return t
}

export function isTalismanId(id: string): boolean {
  return TALISMAN_MAP.has(id)
}
