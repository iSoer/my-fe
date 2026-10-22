import { createRng } from "../rng"
import type { Army, Inventory, ItemCategory, StoreStock, UnitInstance } from "../types"
import { rosterLevel } from "../progression"
import { ITEMS } from "@game/content/balance"
import { CONSUMABLES, TALISMANS, consumableDef, isConsumableId, isTalismanId, talismanDef } from "@game/content/items"
import { WEAPONS, gradeWeaponId, isWeaponId, weaponDef } from "@game/content/weapons"
import { WEAPON_SKILLS, type WeaponGrade } from "@shared/character/skills"

/* ---------- Каталог ---------- */

export function itemCategory(id: string): ItemCategory {
  if (isWeaponId(id)) return "weapon"
  if (isConsumableId(id)) return "consumable"
  if (isTalismanId(id)) return "talisman"
  throw new Error(`unknown item ${id}`)
}

export function isItemId(id: string): boolean {
  return isWeaponId(id) || isConsumableId(id) || isTalismanId(id)
}

export interface ItemInfo {
  id: string
  category: ItemCategory
  name: string
  icon: string
  desc: string
  price: number
}

const WEAPON_ICON = "🗡️"

export function itemInfo(id: string): ItemInfo {
  const category = itemCategory(id)
  if (category === "weapon") {
    const w = weaponDef(id)
    return { id, category, name: w.name, icon: WEAPON_ICON, desc: w.desc, price: w.price }
  }
  const d = category === "consumable" ? consumableDef(id) : talismanDef(id)
  return { id, category, name: d.name, icon: d.icon, desc: d.desc, price: d.price }
}

export function itemPrice(id: string): number {
  return itemInfo(id).price
}

/** Деревянное оружие бесплатно у каждого и в инвентаре не хранится. */
export function isWoodWeapon(id: string): boolean {
  return isWeaponId(id) && weaponDef(id).grade === "wood"
}

/* ---------- Инвентарь (чистые операции) ---------- */

export function itemCount(inv: Inventory, id: string): number {
  return inv[id] ?? 0
}

export function addItem(inv: Inventory, id: string, n = 1): Inventory {
  if (n <= 0 || isWoodWeapon(id)) return inv
  return { ...inv, [id]: Math.min(ITEMS.stackCap, itemCount(inv, id) + n) }
}

export function removeItem(inv: Inventory, id: string, n = 1): Inventory {
  const have = itemCount(inv, id)
  if (have < n) throw new Error("нет предмета")
  const next = { ...inv }
  if (have === n) delete next[id]
  else next[id] = have - n
  return next
}

export function addAll(inv: Inventory, items: Inventory): Inventory {
  let next = inv
  for (const [id, n] of Object.entries(items)) next = addItem(next, id, n)
  return next
}

export function totalCount(inv: Inventory): number {
  return Object.values(inv).reduce((a, n) => a + n, 0)
}

/** Снаряжение бойца, которое возвращается в инвентарь при отпускании: купленное оружие и талисман. */
export function unitGear(unit: UnitInstance): Inventory {
  const gear: Inventory = {}
  if (!isWoodWeapon(unit.skills.weapon)) gear[unit.skills.weapon] = 1
  if (unit.accessory) gear[unit.accessory] = (gear[unit.accessory] ?? 0) + 1
  return gear
}

/* ---------- Лавка ---------- */

function available(def: { minRosterLevel?: number, minGlory?: number }, level: number, glory: number): boolean {
  return (def.minRosterLevel ?? 0) <= level && (def.minGlory ?? 0) <= glory
}

/**
 * Ассортимент Лавки (детерминирован по seed): железное оружие всех навыков, сталь и серебро по уровню ростера,
 * пара разновидностей, все доступные расходники и несколько талисманов; Слава ≥ 150 — на позицию больше.
 */
export function generateStore(seed: number, army: Army | undefined, glory: number): StoreStock {
  const rng = createRng(seed).fork("store")
  const level = rosterLevel(army)
  const extra = glory >= 150 ? 1 : 0
  const grade = (g: WeaponGrade, count: number) =>
    rng.shuffle([...WEAPON_SKILLS]).slice(0, count).map(skill => gradeWeaponId(skill, g))
  const weapons = WEAPON_SKILLS.map(skill => gradeWeaponId(skill, "iron"))
  if (level >= ITEMS.steelFromLevel) weapons.push(...grade("steel", ITEMS.steelOffers))
  if (level >= ITEMS.silverFromLevel) weapons.push(...grade("silver", ITEMS.silverOffers))
  const variants = rng.shuffle(WEAPONS.filter(w => w.variant !== "basic").map(w => w.id))
  weapons.push(...variants.slice(0, ITEMS.variantOffers + extra))
  const consumables = CONSUMABLES.filter(c => available(c, level, glory)).map(c => c.id)
  const talismans = rng
    .shuffle(TALISMANS.filter(t => available(t, level, glory)).map(t => t.id))
    .slice(0, ITEMS.talismanOffers + extra)
  return { seed, weapons, consumables, talismans, fresh: true }
}

export function storeOffers(store: StoreStock, category: ItemCategory): string[] {
  return category === "weapon" ? store.weapons : category === "consumable" ? store.consumables : store.talismans
}

export function inStore(store: StoreStock, id: string): boolean {
  return [...store.weapons, ...store.consumables, ...store.talismans].includes(id)
}

/** Пустая Лавка до первой генерации (новый сейв). */
export const EMPTY_STORE: StoreStock = { seed: 0, weapons: [], consumables: [], talismans: [], fresh: false }

/* ---------- Враги ---------- */

/** Грейд оружия врага по уровню: новички с деревом, ветераны — с серебром. */
export function enemyWeaponGrade(level: number): WeaponGrade {
  return level < 8 ? "wood" : level < 25 ? "iron" : level < 45 ? "steel" : "silver"
}
