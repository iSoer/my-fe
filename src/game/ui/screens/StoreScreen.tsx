import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import type { ItemCategory, UnitInstance } from "@game/core/types"
import { itemCount, itemInfo, storeOffers } from "@game/core/items"
import { weaponDef } from "@game/content/weapons"
import { SKILL_LABELS, rankAtLevel, rankIndex } from "@shared/character/skills"
import { $save, buyItemAction, ensureRoster, ensureStore, markStoreSeen } from "@game/state/save"
import { buildingLevel, msToMarketRefresh } from "@game/core/settlement"
import { MAX_BUILDING_LEVEL } from "@game/content/buildings"
import { navigate } from "@game/state/router"
import { haptic } from "@game/platform/haptics"
import { Button } from "../components/Button"
import { TopBar } from "../components/TopBar"
import { ResourceBar } from "../components/ResourceBar"
import { useToast } from "../components/Toast"
import { stagger } from "../lib/animate"
import { ringSvg, weaponIconSvg } from "@game/art/gear"
import { GearIcon } from "../components/UnitPanels"
import { tr } from "@game/i18n"
import "../village.css"

const TABS: { id: ItemCategory, readonly label: string, readonly hint: string }[] = [
  {
    id: "weapon",
    get label() { return tr("Weapons", "Оружие") },
    get hint() { return tr("Any fighter can use any weapon; skill rank decides how well.", "Любой боец сражается любым оружием; ранг навыка решает, насколько хорошо.") }
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

/** Минуты и секунды до обновления витрины. */
function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** Торговая площадка (Лавка Тётушки Сырницы): вкладки оружия и талисманов; витрина обновляется каждый час. */
export function StoreScreen() {
  const save = useStore($save)
  const [tab, setTab] = useState<ItemCategory>("weapon")
  const [now, setNow] = useState(() => Date.now())
  const [toastEl, toast] = useToast()
  useEffect(() => {
    ensureRoster()
    ensureStore()
    markStoreSeen()
    const t = window.setInterval(() => {
      setNow(Date.now())
      // Граница часа — новая витрина прямо на экране
      ensureStore()
      markStoreSeen()
    }, 1000)
    return () => window.clearInterval(t)
  }, [])
  const marketLevel = Math.max(1, buildingLevel(save, "market"))

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
      <TopBar title={tr("Market", "Лавка")} right={<ResourceBar />} onBack={() => navigate("/village", true)} />
      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="screen-body">
        <div className="row between small">
          <span className="chip">{`🛒 ${tr("Market Lv.", "Площадка ур.")} ${marketLevel}/${MAX_BUILDING_LEVEL}`}</span>
          <span className="muted">{`⏳ ${tr("new stock in", "новый товар через")} ${countdown(msToMarketRefresh(now))}`}</span>
        </div>
        <p className="muted small">{TABS.find(t => t.id === tab)?.hint}</p>
        <div className="stack">
          {offers.map((id, i) => {
            const info = itemInfo(id)
            const owned = itemCount(save.inventory, id)
            const w = tab === "weapon" ? weaponDef(id) : undefined
            return (
              <div key={id} className="card store-item pop-in" style={stagger(i, 40)}>
                {w
                  ? <GearIcon svg={weaponIconSvg(w.kind, w.grade, w.variant)} size={44} />
                  : tab === "talisman"
                    ? <GearIcon svg={ringSvg(id)} size={44} />
                    : <span className="store-ico" aria-hidden="true">{info.icon}</span>}
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
          {offers.length === 0 && <p className="muted">{tr("Empty — check back next hour.", "Пусто — загляните в следующем часу.")}</p>}
        </div>
        <p className="muted small hint-line">
          {tr(
            "Stock refreshes every real hour. Upgrade the Market in the Settlement for more goods and upgraded weapons. Purchases go to the army’s inventory.",
            "Товар обновляется каждый реальный час. Улучшайте площадку в Поселении — товаров больше, чаще усиленное оружие. Купленное лежит в инвентаре армии."
          )}
        </p>
      </div>
      {toastEl}
    </div>
  )
}
