import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import type { ItemCategory, UnitInstance } from "@game/core/types"
import { itemCount, itemInfo, storeOffers } from "@game/core/items"
import { weaponDef } from "@game/content/weapons"
import { ITEMS } from "@game/content/balance"
import { SKILL_LABELS, rankAtLevel, rankIndex } from "@shared/character/skills"
import { $save, buyItemAction, ensureRoster, markStoreSeen } from "@game/state/save"
import { navigate } from "@game/state/router"
import { haptic } from "@game/platform/haptics"
import { Button } from "../components/Button"
import { TopBar } from "../components/TopBar"
import { ResourceBar } from "../components/ResourceBar"
import { useToast } from "../components/Toast"
import { stagger } from "../lib/animate"
import { tr } from "@game/i18n"
import "../village.css"

const TABS: { id: ItemCategory, readonly label: string, readonly hint: string }[] = [
  {
    id: "weapon",
    get label() { return tr("Weapons", "Оружие") },
    get hint() { return tr("Any fighter can use any weapon; skill rank decides how well.", "Любой боец сражается любым оружием; ранг навыка решает, насколько хорошо.") }
  },
  {
    id: "consumable",
    get label() { return tr("Healing", "Лечение") },
    get hint() {
      return tr(
        `Packed for a sortie (up to ${ITEMS.packSize}); using one costs the fighter’s action.`,
        `Берутся в рюкзак вылазки (до ${ITEMS.packSize}) и тратят действие бойца.`
      )
    }
  },
  {
    id: "talisman",
    get label() { return tr("Talismans", "Талисманы") },
    get hint() { return tr("One talisman per fighter; its effects are always on.", "Один талисман на бойца, свойства действуют всегда.") }
  }
]

/** Кто в ростере владеет оружием без штрафа (ранг навыка ≥ требуемого). */
function wielders(units: UnitInstance[], weaponId: string): number {
  const w = weaponDef(weaponId)
  return units.filter(u => rankIndex(rankAtLevel(u.aptitudes[w.kind], u.level)) >= rankIndex(w.requiredRank)).length
}

/** Лавка Тётушки Сырницы: вкладки оружия, расходников и талисманов; ассортимент обновляется после боя. */
export function StoreScreen() {
  const save = useStore($save)
  const [tab, setTab] = useState<ItemCategory>("weapon")
  const [toastEl, toast] = useToast()
  useEffect(() => {
    ensureRoster()
    markStoreSeen()
  }, [])

  const units = save.army?.units ?? []
  const offers = storeOffers(save.store, tab)
  const buy = (id: string) => {
    const r = buyItemAction(id)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("success")
    toast(`${tr("Bought", "Куплено")}: ${itemInfo(id).name}`)
  }

  return (
    <div className="screen">
      <TopBar title={tr("Shop", "Лавка")} right={<ResourceBar />} onBack={() => navigate("/village", true)} />
      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="screen-body">
        <p className="muted small">{TABS.find(t => t.id === tab)?.hint}</p>
        <div className="stack">
          {offers.map((id, i) => {
            const info = itemInfo(id)
            const owned = itemCount(save.inventory, id)
            const w = tab === "weapon" ? weaponDef(id) : undefined
            return (
              <div key={id} className="card store-item pop-in" style={stagger(i, 40)}>
                <span className="store-ico" aria-hidden="true">{info.icon}</span>
                <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <b>{info.name}</b>
                    {owned > 0 && <span className="chip squad">{`${tr("have", "есть")} ×${owned}`}</span>}
                  </div>
                  <div className="muted small">
                    {w ? `Mt ${w.mt} · ${tr("needs", "нужен")} ${SKILL_LABELS[w.kind]} ${w.requiredRank}. ${info.desc}` : info.desc}
                  </div>
                  {w && <div className="muted small">{tr(`Can wield without penalty: ${wielders(units, id)} of ${units.length}`, `Владеют без штрафа: ${wielders(units, id)} из ${units.length}`)}</div>}
                </div>
                <Button sm primary icon="🦴" disabled={save.profile.treats < info.price} onClick={() => buy(id)}>
                  {info.price}
                </Button>
              </div>
            )
          })}
          {offers.length === 0 && <p className="muted">{tr("Empty — check back after the next sortie.", "Пусто — загляните после следующей вылазки.")}</p>}
        </div>
        <p className="muted small hint-line">{tr("Stock refreshes after every battle. Purchases go to the army’s inventory.", "Ассортимент обновляется после каждого боя. Купленное лежит в инвентаре армии.")}</p>
      </div>
      {toastEl}
    </div>
  )
}
