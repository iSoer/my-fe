import { useStore } from "@nanostores/react"
import type { UnitInstance } from "@game/core/types"
import { weaponMt, weaponRank } from "@game/core/units"
import { itemCount } from "@game/core/items"
import { WEAPONS, weaponDef, woodWeaponId } from "@game/content/weapons"
import { TALISMANS, talismanDef } from "@game/content/items"
import { SKILL_LABELS, WEAPON_SKILLS, rankAtLevel, rankIndex } from "@shared/character/skills"
import { $inventory, equipTalismanAction, equipWeaponAction } from "@game/state/save"
import { haptic } from "@game/platform/haptics"
import { BottomSheet } from "./Sheet"
import { Button } from "./Button"

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
  const rank = rankAtLevel(unit.aptitudes[w.kind], unit.level)
  const short = rankIndex(rank) < rankIndex(w.requiredRank)
  return { text: `${SKILL_LABELS[w.kind]} ${rank}${short ? ` · нужен ${w.requiredRank}` : ""}`, short }
}

/** Шторка оружия: в лапах, купленное в инвентаре и бесплатное деревянное любого навыка. */
export function WeaponSheet({ unit, open, onClose, toast }: GearSheetProps) {
  const inventory = useStore($inventory)
  if (!open) return null
  const owned = WEAPONS.filter(w => w.grade !== "wood" && itemCount(inventory, w.id) > 0)
  const equip = (id: string) => {
    const r = equipWeaponAction(unit.id, id)
    if (!r.ok) return toast(r.error ?? "Ошибка", true)
    haptic("select")
    onClose()
  }
  const row = (id: string, right: React.ReactNode, count?: number) => {
    const w = weaponDef(id)
    const note = rankNote(unit, id)
    return (
      <div key={id} className={`skill-item ${id === unit.skills.weapon ? "equipped" : ""}`}>
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
    <BottomSheet open={open} onClose={onClose} title="⚔️ Оружие">
      <div className="stack">
        {row(unit.skills.weapon, <span className="chip squad">{`В лапах · Mt ${weaponMt(unit)}`}</span>)}
        {owned.length > 0 && <b className="small muted">Инвентарь</b>}
        {owned
          .filter(w => w.id !== unit.skills.weapon)
          .map(w => row(w.id, <Button sm primary onClick={() => equip(w.id)}>Взять</Button>, itemCount(inventory, w.id)))}
        <b className="small muted">Деревянное (бесплатно)</b>
        {WEAPON_SKILLS.map(woodWeaponId)
          .filter(id => id !== unit.skills.weapon)
          .map(id => row(id, <Button sm onClick={() => equip(id)}>Взять</Button>))}
        <p className="muted small">
          {"Сражаться можно любым оружием. Ранг навыка добавляет Mt, а ниже требуемого ранга оружие теряет Mt. "
            + `Сейчас: ${SKILL_LABELS[unit.weaponSkill]} ${weaponRank(unit)}. Новое оружие — в Лавке.`}
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
    if (!r.ok) return toast(r.error ?? "Ошибка", true)
    haptic("select")
    onClose()
  }
  const worn = unit.accessory ? talismanDef(unit.accessory) : undefined
  return (
    <BottomSheet open={open} onClose={onClose} title="🔮 Талисман">
      <div className="stack">
        {worn && (
          <div className="skill-item equipped">
            <div className="txt">
              <div>
                <b>{`${worn.icon} ${worn.name}`}</b>
                {" "}
                <span className="chip squad">Надет</span>
              </div>
              <div className="desc">{worn.desc}</div>
            </div>
            <Button sm ghost onClick={() => put(undefined)}>
              Снять
            </Button>
          </div>
        )}
        {owned.map(t => (
          <div key={t.id} className="skill-item">
            <div className="txt">
              <div>
                <b>{`${t.icon} ${t.name}`}</b>
                {itemCount(inventory, t.id) > 1 && <span className="muted">{` ×${itemCount(inventory, t.id)}`}</span>}
              </div>
              <div className="desc">{t.desc}</div>
            </div>
            <Button sm primary onClick={() => put(t.id)}>
              Надеть
            </Button>
          </div>
        ))}
        {!worn && owned.length === 0 && <p className="muted">Талисманов нет — загляните в Лавку.</p>}
        <p className="muted small">Один талисман на бойца. Павший теряет его вместе с оружием, отпущенный — оставляет.</p>
      </div>
    </BottomSheet>
  )
}
