import type { AssistDef } from "@game/core/skills/types"
import { bothAttacks } from "@game/core/types"
import { tr } from "@game/i18n"

export const ASSISTS: readonly AssistDef[] = [
  {
    id: "as_rally_atk",
    get name() { return tr("Rally Attack", "Подбодрить: атака") },
    get desc() { return tr("+4 Str/Mag to an ally until the start of your next phase.", "+4 Str/Mag союзнику до начала вашей следующей фазы.") },
    kind: "rally",
    spCost: 150,
    stage: "mvp",
    stats: { ...bothAttacks(4) }
  },
  {
    id: "as_rally_spd",
    get name() { return tr("Rally Speed", "Подбодрить: скорость") },
    get desc() { return tr("+4 Spd to an ally until the start of your next phase.", "+4 Spd союзнику до начала вашей следующей фазы.") },
    kind: "rally",
    spCost: 150,
    stage: "v1",
    stats: { spd: 4 }
  },
  {
    id: "as_rally_def",
    get name() { return tr("Rally Defense", "Подбодрить: защита") },
    get desc() { return tr("+4 Def to an ally until the start of your next phase.", "+4 Def союзнику до начала вашей следующей фазы.") },
    kind: "rally",
    spCost: 150,
    stage: "mvp",
    stats: { def: 4 }
  },
  {
    id: "as_rally_res",
    get name() { return tr("Rally Resistance", "Подбодрить: сопротивление") },
    get desc() { return tr("+4 Res to an ally until the start of your next phase.", "+4 Res союзнику до начала вашей следующей фазы.") },
    kind: "rally",
    spCost: 150,
    stage: "v1",
    stats: { res: 4 }
  },
  {
    id: "as_swap",
    get name() { return tr("Swap", "Поменяться") },
    get desc() { return tr("Swap places with an ally.", "Поменяться местами с союзником.") },
    kind: "swap",
    spCost: 150,
    stage: "mvp"
  },
  {
    id: "as_reposition",
    get name() { return tr("Reposition", "Перестановка") },
    get desc() { return tr("Move an ally to the tile behind you.", "Переставить союзника на клетку позади себя.") },
    kind: "reposition",
    spCost: 150,
    stage: "mvp"
  },
  {
    id: "as_drawback",
    get name() { return tr("Drag Back", "Оттащить") },
    get desc() { return tr("Step back one tile and drag an ally along.", "Отступить на клетку назад и утащить союзника за собой.") },
    kind: "drawBack",
    spCost: 150,
    stage: "v1"
  },
  {
    id: "as_pivot",
    get name() { return tr("Pirouette", "Пируэт") },
    get desc() { return tr("Hop to the tile beyond an ally.", "Перепрыгнуть на клетку за союзником.") },
    kind: "pivot",
    spCost: 150,
    stage: "v1"
  },
  {
    id: "as_shove",
    get name() { return tr("Shove", "Толкнуть") },
    get desc() { return tr("Push an ally 1 tile away from you.", "Сдвинуть союзника на 1 клетку от себя.") },
    kind: "shove",
    spCost: 150,
    stage: "v1"
  },
  {
    id: "as_smite",
    get name() { return tr("Kick", "Пнуть") },
    get desc() { return tr("Push an ally 2 tiles away from you.", "Сдвинуть союзника на 2 клетки от себя.") },
    kind: "smite",
    spCost: 150,
    stage: "v1"
  },
  {
    id: "as_heal",
    get name() { return tr("Bandage", "Перевязать") },
    get desc() { return tr("Heal an ally for 5 HP + Mag + staff Mt.", "Вылечить союзника на 5 HP + Mag + Mt посоха.") },
    kind: "heal",
    spCost: 0,
    stage: "mvp",
    heal: 5,
    staffOnly: true
  },
  {
    id: "as_mend",
    get name() { return tr("Lick Wounds", "Зализать") },
    get desc() { return tr("Heal an ally for 7 HP + Mag + staff Mt.", "Вылечить союзника на 7 HP + Mag + Mt посоха.") },
    kind: "heal",
    spCost: 150,
    stage: "v1",
    heal: 7,
    staffOnly: true
  },
  {
    id: "as_recover",
    get name() { return tr("Patch Up", "Залатать") },
    get desc() { return tr("Heal an ally for 15 HP + Mag + staff Mt.", "Вылечить союзника на 15 HP + Mag + Mt посоха.") },
    kind: "heal",
    spCost: 300,
    stage: "v1",
    heal: 15,
    staffOnly: true
  },
  {
    id: "as_dance",
    get name() { return tr("Purr", "Мурлыканье") },
    get desc() { return tr("Dancer class dance: an ally can act again.", "Танец класса Dancer: союзник может действовать ещё раз.") },
    kind: "refresh",
    spCost: 0,
    stage: "v1",
    dancerOnly: true
  },
  {
    id: "as_ardent",
    get name() { return tr("Share a Treat", "Отдать вкусняшку") },
    get desc() { return tr("−10 HP to self, +10 HP to an ally.", "−10 HP себе, +10 HP союзнику.") },
    kind: "sacrifice",
    spCost: 150,
    stage: "v1",
    heal: 10
  },
  {
    id: "as_reciprocal",
    get name() { return tr("Skin Swap", "Поменяться шкурой") },
    get desc() { return tr("Swap HP with an ally.", "Обменяться HP с союзником.") },
    kind: "reciprocal",
    spCost: 150,
    stage: "v1.1"
  }
]

const MAP = new Map(ASSISTS.map(s => [s.id, s]))
export function assistDef(id: string): AssistDef {
  const s = MAP.get(id)
  if (!s) throw new Error(`unknown assist ${id}`)
  return s
}
