import type { BuffKind, ChestKind, PickupKind } from "@game/core/types"
import { BUFF } from "./balance"
import { tr } from "@game/i18n"

// Вылазка в чащу: бонусы одиночек, сердечки и клейма сундуков — названия, значки и кому действует бонус.

export interface BuffDef {
  id: BuffKind
  icon: string
  name: string
  desc: string
  /** Кому: подобравшему бойцу или всему отряду. */
  scope: "unit" | "team"
}

const pct = (v: number) => `${Math.round(v * 100)}%`

export const BUFFS: Record<BuffKind, BuffDef> = {
  fury: {
    id: "fury",
    icon: "🔥",
    get name() { return tr("Fury", "Ярость") },
    get desc() { return tr(`+${pct(BUFF.fury)} damage for the fighter who picked it up`, `+${pct(BUFF.fury)} урона подобравшему бойцу`) },
    scope: "unit"
  },
  swift: {
    id: "swift",
    icon: "👟",
    get name() { return tr("Tailwind", "Попутный ветер") },
    get desc() { return tr(`+${BUFF.swift} move for the whole squad`, `+${BUFF.swift} клетки хода всему отряду`) },
    scope: "team"
  },
  aegis: {
    id: "aegis",
    icon: "🛡️",
    get name() { return tr("Ward", "Оберег") },
    get desc() { return tr(`−${pct(BUFF.aegis)} damage taken by the fighter who picked it up`, `−${pct(BUFF.aegis)} урона по подобравшему бойцу`) },
    scope: "unit"
  },
  regen: {
    id: "regen",
    icon: "🌿",
    get name() { return tr("Sap", "Живица") },
    get desc() { return tr(`The squad heals ${pct(BUFF.regen)} HP at the start of each turn`, `Отряд лечит ${pct(BUFF.regen)} HP в начале каждого хода`) },
    scope: "team"
  },
  fortune: {
    id: "fortune",
    icon: "🪙",
    get name() { return tr("Fortune", "Удача") },
    get desc() { return tr(`×${BUFF.fortune} Treats from fallen enemies`, `×${BUFF.fortune} Вкусняшек с павших врагов`) },
    scope: "team"
  }
}

export const BUFF_KINDS = Object.keys(BUFFS) as BuffKind[]

export function pickupIcon(kind: PickupKind): string {
  return kind === "heart" ? "❤️" : BUFFS[kind].icon
}

/** Клеймо на крышке сундука: намёк на категорию, не на сам предмет. */
export const CHEST_MARK: Record<ChestKind, string> = { treats: "🦴", weapon: "⚔️", talisman: "💍" }
