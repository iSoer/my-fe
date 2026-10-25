import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import { BUILDINGS, type BuildingId } from "@game/content/buildings"
import { $save, tickSettlementNow } from "@game/state/save"
import { $pendingBuild } from "@game/state/village"
import { navigate } from "@game/state/router"
import type { TrainingLevelUp } from "@game/core/settlement"
import { haptic } from "@game/platform/haptics"
import { TopBar } from "../components/TopBar"
import { ResourceBar } from "../components/ResourceBar"
import { BottomSheet } from "../components/Sheet"
import { LevelUpModal } from "../components/LevelUpModal"
import { useToast } from "../components/Toast"
import { BuildingCard, CanteenPanel, FieldsPanel, HospitalPanel, TrainingPanel, useNow } from "../components/BuildingPanels"
import { tr } from "@game/i18n"
import "../village.css"

/** Поселение (Ратуша Старосты Уса): здания, их уровни и механики. */
export function SettlementScreen() {
  const save = useStore($save)
  const now = useNow()
  const [open, setOpen] = useState<BuildingId | null>(null)
  const [levelUps, setLevelUps] = useState<TrainingLevelUp[]>([])
  const [toastEl, toast] = useToast()
  useEffect(() => {
    tickSettlementNow()
  }, [now])

  // Новое здание ставится в лагере: экран уходит на карту с призраком постройки
  const onBuild = (id: BuildingId) => {
    haptic("select")
    $pendingBuild.set({ mode: "place", kind: id })
    navigate("/village")
  }
  const onOpen = (id: BuildingId) => {
    haptic("select")
    if (id === "barracks") return navigate("/army")
    if (id === "market") return navigate("/store")
    setOpen(id)
  }
  const def = open ? BUILDINGS.find(b => b.id === open) : undefined
  const shown = levelUps[0]

  return (
    <div className="screen">
      <TopBar title={tr("Settlement", "Поселение")} right={<ResourceBar />} onBack={() => navigate("/village", true)} />
      <div className="screen-body">
        <p className="muted small">
          {tr(
            "Build and upgrade the camp: every building opens a new mechanic, every level makes it stronger. New buildings are placed on the camp map.",
            "Стройте и улучшайте лагерь: каждое здание открывает новую механику, каждый уровень её усиливает. Новое здание ставится на карту лагеря."
          )}
        </p>
        <div className="stack">
          {BUILDINGS.map((b, i) => <BuildingCard key={b.id} def={b} index={i} now={now} onOpen={onOpen} onBuild={onBuild} toast={toast} />)}
        </div>
        {!save.army && <p className="muted small hint-line">{tr("No roster yet — visit the Barracks.", "Ростера нет — загляните в Казарму.")}</p>}
      </div>
      <BottomSheet open={!!def} onClose={() => setOpen(null)} title={def ? `${def.icon} ${def.name}` : undefined}>
        {open === "training" && <TrainingPanel now={now} toast={toast} onLevelUps={setLevelUps} />}
        {open === "hospital" && <HospitalPanel toast={toast} />}
        {open === "fields" && <FieldsPanel now={now} toast={toast} />}
        {open === "canteen" && <CanteenPanel />}
      </BottomSheet>
      <LevelUpModal
        view={shown ? { unit: shown.unit, from: shown.from, to: shown.to } : null}
        closeLabel={levelUps.length > 1 ? tr("Next", "Дальше") : undefined}
        onClose={() => setLevelUps(l => l.slice(1))}
      />
      {toastEl}
    </div>
  )
}
