import type { ConsumableDef, TalismanDef } from "@game/core/skills/types"
import type { Stat } from "@game/core/types"
import { STATS } from "@game/core/types"
import { CHARACTER_STAT_LABELS as L } from "@shared/character/leveling"

// Предметы Лавки: расходники для боя и талисманы с пассивными свойствами. Оружие — `content/weapons.ts`.
// Цены — в описаниях ниже; медианный бой на «Нормально» отрядом 5-го уровня приносит ~125 🦴.

/** Подписи статов — из модели (атака — «Str/Mag», как в общих местах интерфейса). */
const STAT: Record<Stat, string> = {
  hp: L.hp,
  atk: `${L.attack}/${L.specialAttack}`,
  spd: L.speed,
  def: L.defense,
  res: L.specialDefense
}

function statText(stats: Partial<Record<Stat, number>>): string {
  return STATS.filter(s => stats[s])
    .map(s => `+${stats[s]} ${STAT[s]}`)
    .join(", ")
}

/** Расходники: цена ≈ 3 🦴 за 1 HP малого лечения, массовое и полное лечение дороже. */
export const CONSUMABLES: readonly ConsumableDef[] = [
  { id: "itm_bandage", name: "Пластырь", icon: "🩹", desc: "Лечит 10 HP.", price: 30, heal: 10 },
  {
    id: "itm_kit",
    name: "Аптечка",
    icon: "🧰",
    desc: "Лечит половину здоровья (не меньше 12 HP).",
    price: 80,
    heal: 12,
    healPct: 0.5
  },
  {
    id: "itm_valerian",
    name: "Валерьянка",
    icon: "🌿",
    desc: "Снимает штрафы к статам и лечит 5 HP.",
    price: 45,
    heal: 5,
    cleanse: true
  },
  {
    id: "itm_stew",
    name: "Котелок похлёбки",
    icon: "🍲",
    desc: "Лечит 8 HP себе и всем союзникам в 2 клетках.",
    price: 130,
    heal: 8,
    area: 2,
    minRosterLevel: 10
  },
  {
    id: "itm_elixir",
    name: "Эликсир девяти жизней",
    icon: "🧪",
    desc: "Полностью восстанавливает здоровье.",
    price: 220,
    healPct: 1,
    minGlory: 75
  }
]

const statTalisman = (
  id: string,
  name: string,
  icon: string,
  price: number,
  stats: Partial<Record<Stat, number>>,
  minRosterLevel?: number
): TalismanDef => {
  const t: TalismanDef = { id, name, icon, desc: `${statText(stats)}.`, price, hooks: { statBonus: stats } }
  if (minRosterLevel) t.minRosterLevel = minRosterLevel
  return t
}

/** Талисманы: +3 к стату — 140 🦴; особые свойства — 180–240 🦴; сильные — с уровня ростера. */
export const TALISMANS: readonly TalismanDef[] = [
  statTalisman("tal_fang", "Клык на шнурке", "🦷", 140, { atk: 3 }),
  statTalisman("tal_bell", "Бубенчик", "🔔", 140, { spd: 3 }),
  statTalisman("tal_collar", "Шипастый ошейник", "⛓️", 140, { def: 3 }),
  statTalisman("tal_ribbon", "Атласная ленточка", "🎀", 140, { res: 3 }),
  statTalisman("tal_heart", "Сердечко из фетра", "❤️", 120, { hp: 6 }),
  statTalisman("tal_claw", "Коготь вожака", "🐾", 320, { atk: 2, spd: 2, def: 2 }, 20),
  {
    id: "tal_book",
    name: "Потрёпанный букварь",
    icon: "📖",
    desc: "Опыт в бою ×1.5.",
    price: 180,
    hooks: { xpMultiplier: 1.5 }
  },
  {
    id: "tal_coin",
    name: "Монетка-копилка",
    icon: "🪙",
    desc: "Вкусняшки за бой ×1.15, если боец вернулся живым.",
    price: 220,
    hooks: { treatsMultiplier: 1.15 }
  },
  {
    id: "tal_mint",
    name: "Листик мяты",
    icon: "🍃",
    desc: "В начале хода лечит 4 HP.",
    price: 240,
    minRosterLevel: 10,
    hooks: {
      onTurnStart: (_state, self) => (self.hp < self.maxHp ? [{ type: "heal", unitId: self.unitId, amount: 4 }] : [])
    }
  },
  {
    id: "tal_foil",
    name: "Плащ из фольги",
    icon: "🛡️",
    desc: "Оружие врага не бывает эффективным против бойца.",
    price: 200,
    hooks: { negateEffective: true }
  }
]

const CONSUMABLE_MAP = new Map(CONSUMABLES.map(c => [c.id, c]))
const TALISMAN_MAP = new Map(TALISMANS.map(t => [t.id, t]))

export function consumableDef(id: string): ConsumableDef {
  const c = CONSUMABLE_MAP.get(id)
  if (!c) throw new Error(`unknown consumable ${id}`)
  return c
}

export function talismanDef(id: string): TalismanDef {
  const t = TALISMAN_MAP.get(id)
  if (!t) throw new Error(`unknown talisman ${id}`)
  return t
}

export function isConsumableId(id: string): boolean {
  return CONSUMABLE_MAP.has(id)
}

export function isTalismanId(id: string): boolean {
  return TALISMAN_MAP.has(id)
}
