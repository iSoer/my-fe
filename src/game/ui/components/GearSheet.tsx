import { useStore } from "@nanostores/react"
import type { UnitInstance } from "@game/core/types"
import { weaponMt, weaponRank } from "@game/core/units"
import { itemCount } from "@game/core/items"
import { WEAPONS, weaponDef, woodWeaponId } from "@game/content/weapons"
import { TALISMANS, talismanDef } from "@game/content/items"
import { SKILL_LABELS, WEAPON_SKILLS, rankIndex } from "@shared/character/skills"
import { skillRank } from "@game/core/units/proficiency"
import { $inventory, equipTalismanAction, equipWeaponAction } from "@game/state/save"
import { haptic } from "@game/platform/haptics"
import { BottomSheet } from "./Sheet"
import { Button } from "./Button"
import { tr } from "@game/i18n"
import { ringSvg, weaponIconSvg } from "@game/art/gear"
import { GearIcon } from "./UnitPanels"

type Toast = (msg: string, error?: boolean) => void

interface GearSheetProps {
  unit: UnitInstance
  open: boolean
  onClose: () => void
  toast: Toast
}

/** Как боец владеет оружием: ранг его навыка против требуемого рангом оружия. */
function rankNote(unit: UnitInstance, weaponId: string): { text: string, short: boolean } {
  const w = weaponDef(weaponId)
  const rank = skillRank(unit, w.kind)
  const short = rankIndex(rank) < rankIndex(w.requiredRank)
  return { text: `${SKILL_LABELS[w.kind]} ${rank}${short ? tr(` · needs ${w.requiredRank}`, ` · нужен ${w.requiredRank}`) : ""}`, short }
}

/** Шторка оружия: в лапах, купленное в инвентаре и бесплатное деревянное любого навыка. */
export function WeaponSheet({ unit, open, onClose, toast }: GearSheetProps) {
  const inventory = useStore($inventory)
  if (!open) return null
  const owned = WEAPONS.filter(w => w.grade !== "wood" && itemCount(inventory, w.id) > 0)
  const equip = (id: string) => {
    const r = equipWeaponAction(unit.id, id)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("select")
    onClose()
  }
  const row = (id: string, right: React.ReactNode, count?: number) => {
    const w = weaponDef(id)
    const note = rankNote(unit, id)
    return (
      <div key={id} className={`skill-item ${id === unit.skills.weapon ? "equipped" : ""}`}>
        <GearIcon svg={weaponIconSvg(w.kind, w.grade, w.variant)} size={40} />
        <div className="txt">
          <div>
            <b>{w.name}</b>
            {count && count > 1 ? <span className="muted">{` ×${count}`}</span> : null}
            {" "}
            <span className={`chip ${note.short ? "red" : ""}`}>{note.text}</span>
          </div>
          <div className="desc">{`Mt ${w.mt}. ${w.desc}`}</div>
        </div>
        {right}
      </div>
    )
  }
  return (
    <BottomSheet open={open} onClose={onClose} title={tr("⚔️ Weapon", "⚔️ Оружие")}>
      <div className="stack">
        {row(unit.skills.weapon, <span className="chip squad">{tr(`In paws · Mt ${weaponMt(unit)}`, `В лапах · Mt ${weaponMt(unit)}`)}</span>)}
        {owned.length > 0 && <b className="small muted">{tr("Inventory", "Инвентарь")}</b>}
        {owned
          .filter(w => w.id !== unit.skills.weapon)
          .map(w => row(w.id, <Button sm primary onClick={() => equip(w.id)}>{tr("Take", "Взять")}</Button>, itemCount(inventory, w.id)))}
        <b className="small muted">{tr("Wooden (free)", "Деревянное (бесплатно)")}</b>
        {WEAPON_SKILLS.map(woodWeaponId)
          .filter(id => id !== unit.skills.weapon)
          .map(id => row(id, <Button sm onClick={() => equip(id)}>{tr("Take", "Взять")}</Button>))}
        <p className="muted small">
          {tr(
            "Any weapon can be used. Skill rank adds Mt; below the required rank the weapon loses Mt. "
            + `Now: ${SKILL_LABELS[unit.weaponSkill]} ${weaponRank(unit)}. New weapons are in the Shop.`,
            "Сражаться можно любым оружием. Ранг навыка добавляет Mt, а ниже требуемого ранга оружие теряет Mt. "
            + `Сейчас: ${SKILL_LABELS[unit.weaponSkill]} ${weaponRank(unit)}. Новое оружие — в Лавке.`
          )}
        </p>
      </div>
    </BottomSheet>
  )
}

/** Шторка талисмана: надетый, талисманы из инвентаря, «Снять». */
export function TalismanSheet({ unit, open, onClose, toast }: GearSheetProps) {
  const inventory = useStore($inventory)
  if (!open) return null
  const owned = TALISMANS.filter(t => itemCount(inventory, t.id) > 0 && t.id !== unit.accessory)
  const put = (id: string | undefined) => {
    const r = equipTalismanAction(unit.id, id)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("select")
    onClose()
  }
  const worn = unit.accessory ? talismanDef(unit.accessory) : undefined
  return (
    <BottomSheet open={open} onClose={onClose} title={tr("🔮 Talisman", "🔮 Талисман")}>
      <div className="stack">
        {worn && (
          <div className="skill-item equipped">
            <GearIcon svg={ringSvg(worn.id)} size={40} />
            <div className="txt">
              <div>
                <b>{worn.name}</b>
                {" "}
                <span className="chip squad">{tr("Worn", "Надет")}</span>
              </div>
              <div className="desc">{worn.desc}</div>
            </div>
            <Button sm ghost onClick={() => put(undefined)}>
              {tr("Remove", "Снять")}
            </Button>
          </div>
        )}
        {owned.map(t => (
          <div key={t.id} className="skill-item">
            <GearIcon svg={ringSvg(t.id)} size={40} />
            <div className="txt">
              <div>
                <b>{t.name}</b>
                {itemCount(inventory, t.id) > 1 && <span className="muted">{` ×${itemCount(inventory, t.id)}`}</span>}
              </div>
              <div className="desc">{t.desc}</div>
            </div>
            <Button sm primary onClick={() => put(t.id)}>
              {tr("Equip", "Надеть")}
            </Button>
          </div>
        ))}
        {!worn && owned.length === 0 && <p className="muted">{tr("No Talismans — check the Shop.", "Талисманов нет — загляните в Лавку.")}</p>}
        <p className="muted small">
          {tr(
            "One Talisman per fighter. The fallen lose it along with their weapon; the released leave it behind.",
            "Один талисман на бойца. Павший теряет его вместе с оружием, отпущенный — оставляет."
          )}
        </p>
      </div>
    </BottomSheet>
  )
}
