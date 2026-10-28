import { createRng } from "../rng"
import type { Army, Inventory, ItemCategory, StoreStock, UnitInstance } from "../types"
import { rosterLevel } from "../progression"
import { ITEMS } from "@game/content/balance"
import { STORE } from "@game/content/settlement"
import { TALISMANS, isTalismanId, talismanDef } from "@game/content/items"
import { WEAPONS, gradeWeaponId, isWeaponId, weaponDef } from "@game/content/weapons"
import { WEAPON_SKILLS, type WeaponGrade } from "@shared/character/skills"

/* ---------- Каталог ---------- */

export function itemCategory(id: string): ItemCategory {
  if (isWeaponId(id)) return "weapon"
  if (isTalismanId(id)) return "talisman"
  throw new Error(`unknown item ${id}`)
}

export function isItemId(id: string): boolean {
  return isWeaponId(id) || isTalismanId(id)
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
  const d = talismanDef(id)
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

/** Товары витрины без служебных полей периода. */
export type StoreGoods = Pick<StoreStock, "seed" | "weapons" | "talismans">

/**
 * Ассортимент Лавки (детерминирован по seed): `count` позиций (Слава ≥ 150 — на одну больше) из пулов оружия
 * (железо всех навыков, сталь и серебро по уровню ростера, пара разновидностей) и доступных талисманов; каждая
 * `STORE.talismanEvery`-я позиция — талисман. При том же seed витрина побольше начинается с тех же товаров, поэтому
 * улучшение Лавки только добавляет позиции.
 */
export function generateStore(seed: number, army: Army | undefined, glory: number, count: number = STORE.offers[0]): StoreGoods {
  const rng = createRng(seed).fork("store")
  const level = rosterLevel(army)
  const total = count + (glory >= 150 ? 1 : 0)
  const grade = (g: WeaponGrade, n: number) =>
    rng.shuffle([...WEAPON_SKILLS]).slice(0, n).map(skill => gradeWeaponId(skill, g))
  const pool = WEAPON_SKILLS.map(skill => gradeWeaponId(skill, "iron"))
  if (level >= ITEMS.steelFromLevel) pool.push(...grade("steel", ITEMS.steelOffers))
  if (level >= ITEMS.silverFromLevel) pool.push(...grade("silver", ITEMS.silverOffers))
  pool.push(...rng.shuffle(WEAPONS.filter(w => w.variant !== "basic").map(w => w.id)).slice(0, ITEMS.variantOffers))
  const weaponPool = rng.shuffle(pool)
  const talismanPool = rng.shuffle(TALISMANS.filter(t => available(t, level, glory)).map(t => t.id))
  const weapons: string[] = []
  const talismans: string[] = []
  for (let i = 0; i < total && (weaponPool.length > 0 || talismanPool.length > 0); i++) {
    const wantTalisman = i % STORE.talismanEvery === STORE.talismanEvery - 1
    const fromTalismans = wantTalisman ? talismanPool.length > 0 : weaponPool.length === 0
    if (fromTalismans) talismans.push(talismanPool.shift() as string)
    else weapons.push(weaponPool.shift() as string)
  }
  return { seed, weapons, talismans }
}

export function storeOffers(store: StoreStock, category: ItemCategory): string[] {
  return category === "weapon" ? store.weapons : store.talismans
}

export function inStore(store: StoreStock, id: string): boolean {
  return [...store.weapons, ...store.talismans].includes(id)
}

/** Пустая Лавка: до постройки и до первой генерации. */
export const EMPTY_STORE: StoreStock = { seed: 0, weapons: [], talismans: [], fresh: false, period: 0, salt: 0 }

/* ---------- Враги ---------- */

/** Грейд оружия врага по уровню: новички с деревом, ветераны — с серебром. */
export function enemyWeaponGrade(level: number): WeaponGrade {
  return level < 8 ? "wood" : level < 25 ? "iron" : level < 45 ? "steel" : "silver"
}
