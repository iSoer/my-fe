import { useEffect, useRef, useState } from "react"
import { useStore } from "@nanostores/react"
import type { ItemCategory, UnitInstance } from "@game/core/types"
import { itemCount, itemInfo, storeOffers } from "@game/core/items"
import { buildingLevel, nextStoreRefresh, storeDiscount, storePrice } from "@game/core/settlement"
import { tickSettlement } from "@game/state/settlement"
import { weaponDef } from "@game/content/weapons"
import { SKILL_LABELS, rankAtLevel, rankIndex } from "@shared/character/skills"
import { $save, buyItemAction, markStoreSeen } from "@game/state/save"
import { navigate } from "@game/state/router"
import { haptic } from "@game/platform/haptics"
import { Button } from "../components/Button"
import { TopBar } from "../components/TopBar"
import { ResourceBar } from "../components/ResourceBar"
import { useToast } from "../components/Toast"
import { stagger } from "../lib/animate"
import { ringSvg, weaponIconSvg } from "@game/art/gear"
import { GearIcon } from "../components/UnitPanels"
import { useNow } from "../settlement/BuildingPanel"
import { fmtDuration } from "../lib/format"
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

/**
 * Торговая лавка: вкладки оружия и талисманов. Витрина меняется по времени (раз в `STORE.refreshHours`), её размер
 * и скидка — по уровню Лавки. Покупка идёт по той витрине, которую видит игрок: сменилась — покупка отклоняется.
 */
export function StoreScreen() {
  const save = useStore($save)
  const [tab, setTab] = useState<ItemCategory>("weapon")
  const [toastEl, toast] = useToast()
  const now = useNow(1000)
  const level = buildingLevel(save, "store")
  const refreshAt = nextStoreRefresh(save.store)
  const mounted = useRef(false)
  const expired = level > 0 && now >= refreshAt
  // Период кончился, пока Лавка открыта, — выложить новую витрину (при входе — молча)
  useEffect(() => {
    if (!expired) return
    tickSettlement(now)
    markStoreSeen()
    if (mounted.current) toast(tr("New goods have arrived!", "Привезли новый товар!"))
  }, [expired])
  useEffect(() => {
    tickSettlement()
    markStoreSeen()
    mounted.current = true
  }, [])

  const back = () => navigate("/village", true)
  if (level === 0) {
    return (
      <div className="screen">
        <TopBar title={tr("Shop", "Лавка")} right={<ResourceBar />} onBack={back} />
        <div className="screen-body">
          <div className="empty">
            <div className="big">🛒</div>
            <h3>{tr("Not built yet", "Лавка ещё не построена")}</h3>
            <p>{tr("Build the Trading Post in the settlement to buy weapons and talismans.", "Постройте Торговую лавку в поселении, чтобы покупать оружие и талисманы.")}</p>
          </div>
        </div>
      </div>
    )
  }

  const units = save.army?.units ?? []
  const offers = storeOffers(save.store, tab)
  const discount = storeDiscount(save)
  const buy = (id: string) => {
    const r = buyItemAction(id, save.store.period)
    if (!r.ok) {
      if (r.restocked) markStoreSeen()
      return toast(r.error ?? tr("Error", "Ошибка"), true)
    }
    haptic("success")
    toast(`${tr("Bought", "Куплено")}: ${itemInfo(id).name}`)
  }

  return (
    <div className="screen">
      <TopBar title={tr("Shop", "Лавка")} right={<ResourceBar />} onBack={back} />
      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="screen-body">
        <p className="small">
          {tr(`Level ${level} · discount ${Math.round(discount * 100)}% · new goods in ${fmtDuration(refreshAt - now)}`, `Уровень ${level} · скидка ${Math.round(discount * 100)}% · новый завоз через ${fmtDuration(refreshAt - now)}`)}
        </p>
        <p className="muted small">{TABS.find(t => t.id === tab)?.hint}</p>
        <div className="stack">
          {offers.map((id, i) => {
            const info = itemInfo(id)
            const price = storePrice(save, id)
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
                <Button sm primary icon="🦴" disabled={save.profile.treats < price} onClick={() => buy(id)}>
                  {price < info.price && <span className="store-price-old">{info.price}</span>}
                  {price}
                </Button>
              </div>
            )
          })}
          {offers.length === 0 && <p className="muted">{tr("Nothing of this kind today — check back after the next delivery.", "Сегодня такого нет — загляните после следующего завоза.")}</p>}
        </div>
        <p className="muted small hint-line">{tr("Upgrade the Trading Post for more goods and lower prices. Purchases go to the army’s inventory.", "Улучшайте Лавку: товаров станет больше, а цены ниже. Купленное лежит в инвентаре армии.")}</p>
      </div>
      {toastEl}
    </div>
  )
}
