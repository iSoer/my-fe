import { useState } from "react"
import { useStore } from "@nanostores/react"
import { $route, type Route } from "@game/state/router"
import { $saveError, $saveNewer, $saveStatus } from "@game/state/save"
import { MenuScreen } from "./screens/MenuScreen"
import { ArmyScreen } from "./screens/ArmyScreen"
import { UnitScreen } from "./screens/UnitScreen"
import { BattleSetupScreen, DifficultyScreen, EnemyTeamScreen } from "./screens/BattleSetupScreen"
import { SquadScreen } from "./screens/SquadScreen"
import { BattleScreen } from "./screens/BattleScreen"
import { BattleResultScreen } from "./screens/BattleResultScreen"
import { MemorialScreen } from "./screens/MemorialScreen"
import { SettingsScreen } from "./screens/SettingsScreen"
import { SettlementScreen } from "./screens/SettlementScreen"
import { StoreScreen } from "./screens/StoreScreen"
import { gameHost } from "@game/platform/host"
import { $lang, tr } from "@game/i18n"

function Splash({ onStart, ready }: { onStart: () => void, ready: boolean }) {
  // Язык приходит из сейва во время загрузки — перерисовываемся при смене
  useStore($lang)
  return (
    <div className="screen splash" onClick={ready ? onStart : undefined}>
      <div className="splash-logo">
        <h1>Cat Emblem</h1>
      </div>
      <p className="splash-hint">{ready ? tr("Tap to start", "Нажмите, чтобы начать") : tr("Loading…", "Загрузка…")}</p>
    </div>
  )
}

function routeKey(r: Route): string {
  return r.name === "unit" ? `unit:${r.unitId}` : r.name
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case "menu":
      return <MenuScreen />
    case "village":
      return <SettlementScreen />
    case "store":
      return <StoreScreen />
    case "army":
      return <ArmyScreen />
    case "armyCreate":
    case "recruit":
      return <ArmyScreen />
    case "unit":
      return <UnitScreen unitId={route.unitId} />
    case "battleSetup":
      return <BattleSetupScreen />
    case "battleDifficulty":
      return <DifficultyScreen />
    case "battleEnemy":
      return <EnemyTeamScreen difficulty={route.difficulty} />
    case "battleSquad":
      return <SquadScreen />
    case "battle":
      return <BattleScreen />
    case "battleResult":
      return <BattleResultScreen />
    case "memorial":
      return <MemorialScreen />
    case "settings":
      return <SettingsScreen />
    case "notFound":
      return <MenuScreen />
  }
}

function Router() {
  const route = useStore($route)
  const lang = useStore($lang)
  // key пересоздаёт контейнер при смене маршрута — проигрывается CSS-переход route-in; смена языка перерисовывает экран
  return (
    <div className="route" key={`${lang}:${routeKey(route)}`}>
      <Screen route={route} />
    </div>
  )
}

export function App() {
  const status = useStore($saveStatus)
  const err = useStore($saveError)
  const newer = useStore($saveNewer)
  const [started, setStarted] = useState(false)
  if (status !== "ready" || !started) {
    return (
      <>
        <Splash ready={status === "ready"} onStart={() => setStarted(true)} />
        {err && (
          <div className="toast toast-error">
            <span className="ico">✕</span>
            <span>
              {newer
                ? tr(`${err}. Update the game to continue.`, `${err}. Обновите игру, чтобы продолжить.`)
                : tr(`Save corrupted: ${err}. Started a new one.`, `Сейв повреждён: ${err}. Начат новый.`)}
            </span>
          </div>
        )}
      </>
    )
  }
  const { Overlay } = gameHost()
  return (
    <>
      <Router />
      {Overlay && <Overlay />}
    </>
  )
}
