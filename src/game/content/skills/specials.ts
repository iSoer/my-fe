import type { SpecialDef } from "@game/core/skills/types"
import { tr } from "@game/i18n"

export const SPECIALS: readonly SpecialDef[] = [
  {
    id: "sp_glimmer",
    get name() { return tr("Bloody Glimmer", "Кровавый блеск") },
    get desc() { return tr("Damage +50%.", "Урон +50 %.") },
    cd: 2,
    kind: "offense",
    spCost: 200,
    stage: "mvp",
    offense: { damageBonusPct: 50 }
  },
  {
    id: "sp_moonbow",
    get name() { return tr("Moon Sickle", "Лунный серп") },
    get desc() { return tr("Ignores 30% of the target's Def/Res.", "Игнорирует 30 % Def/Res цели.") },
    cd: 2,
    kind: "offense",
    spCost: 200,
    stage: "mvp",
    offense: { ignoreDefPct: 30 }
  },
  {
    id: "sp_luna",
    get name() { return tr("Fanged Moon", "Клыкастая луна") },
    get desc() { return tr("Ignores 50% of the target's Def/Res.", "Игнорирует 50 % Def/Res цели.") },
    cd: 3,
    kind: "offense",
    spCost: 200,
    stage: "v1",
    offense: { ignoreDefPct: 50 }
  },
  {
    id: "sp_bonfire",
    get name() { return tr("Fur Blaze", "Пламя шерсти") },
    get desc() { return tr("Damage +50% of own Def.", "Урон +50 % своего Def.") },
    cd: 3,
    kind: "offense",
    spCost: 200,
    stage: "mvp",
    offense: { damagePctOfStat: { stat: "def", pct: 50, of: "self" } }
  },
  {
    id: "sp_iceberg",
    get name() { return tr("Frost Fur", "Ледяная шерсть") },
    get desc() { return tr("Damage +50% of own Res.", "Урон +50 % своего Res.") },
    cd: 3,
    kind: "offense",
    spCost: 200,
    stage: "v1",
    offense: { damagePctOfStat: { stat: "res", pct: 50, of: "self" } }
  },
  {
    id: "sp_draconic",
    get name() { return tr("Claw Flurry", "Шквал когтей") },
    get desc() { return tr("Damage +30% of own Str/Mag.", "Урон +30 % своего Str/Mag.") },
    cd: 3,
    kind: "offense",
    spCost: 200,
    stage: "v1",
    offense: { damagePctOfStat: { stat: "atk", pct: 30, of: "self" } }
  },
  {
    id: "sp_sol",
    get name() { return tr("Clean Wound", "Чистая рана") },
    get desc() { return tr("Heals 50% of damage dealt.", "Лечит 50 % нанесённого урона.") },
    cd: 3,
    kind: "offense",
    spCost: 200,
    stage: "v1",
    offense: { healPctOfDamage: 50 }
  },
  {
    id: "sp_escutcheon",
    get name() { return tr("Fluffy Wall", "Пушистая стена") },
    get desc() { return tr("−30% damage from melee attacks.", "−30 % урона от ближней атаки.") },
    cd: 3,
    kind: "defense",
    spCost: 200,
    stage: "mvp",
    defense: { reduction: 0.3, vsRange: "melee" }
  },
  {
    id: "sp_cowl",
    get name() { return tr("Tail Shield", "Хвост-щит") },
    get desc() { return tr("−30% damage from ranged attacks.", "−30 % урона от дальней атаки.") },
    cd: 3,
    kind: "defense",
    spCost: 200,
    stage: "v1",
    defense: { reduction: 0.3, vsRange: "ranged" }
  },
  {
    id: "sp_miracle",
    get name() { return tr("Nine Lives", "Девять жизней") },
    get desc() { return tr("Survive a lethal blow with 1 HP (if HP > 1). Cats only.", "Пережить смертельный удар с 1 HP (если HP > 1). Только коты.") },
    cd: 5,
    kind: "defense",
    spCost: 200,
    stage: "v1",
    onlySpecies: "cat",
    miracle: true
  },
  {
    id: "sp_loyalty",
    get name() { return tr("Loyalty", "Верность") },
    get desc() { return tr("−30% damage from any attack and heals 30% of that damage. Dogs only.", "−30 % урона от любой атаки и лечение на 30 % этого урона. Только псы.") },
    cd: 4,
    kind: "defense",
    spCost: 200,
    stage: "v1",
    onlySpecies: "dog",
    defense: { reduction: 0.3, vsRange: "any", healPctOfDamage: 30 }
  },
  {
    id: "sp_squeak",
    get name() { return tr("Scurry", "Шмыг") },
    get desc() { return tr("−40% damage from any attack. Mice only.", "−40 % урона от любой атаки. Только мыши.") },
    cd: 3,
    kind: "defense",
    spCost: 200,
    stage: "v1",
    onlySpecies: "mouse",
    defense: { reduction: 0.4, vsRange: "any" }
  },
  {
    id: "sp_imbue",
    get name() { return tr("Healing Purr", "Мурчание исцеления") },
    get desc() { return tr("+10 to healing.", "+10 к лечению.") },
    cd: 1,
    kind: "heal",
    spCost: 200,
    stage: "mvp",
    staffOnly: true,
    heal: { bonusHeal: 10 }
  },
  {
    id: "sp_heavenly",
    get name() { return tr("Chorus Bark", "Общий лай") },
    get desc() { return tr("When healing, +10 HP to all allies.", "При лечении +10 HP всем союзникам.") },
    cd: 2,
    kind: "heal",
    spCost: 200,
    stage: "v1",
    staffOnly: true,
    heal: { allAlliesHeal: 10 }
  }
]

const MAP = new Map(SPECIALS.map(s => [s.id, s]))
export function specialDef(id: string): SpecialDef {
  const s = MAP.get(id)
  if (!s) throw new Error(`unknown special ${id}`)
  return s
}
