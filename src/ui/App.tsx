import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { $route, type Route } from '@state/router';
import { $conflict, $saveError, $saveStatus, resolveConflict } from '@state/save';
import { MenuScreen } from './screens/MenuScreen';
import { ArmyCreateScreen } from './screens/ArmyCreateScreen';
import { ArmyScreen } from './screens/ArmyScreen';
import { UnitScreen } from './screens/UnitScreen';
import { BattleSetupScreen } from './screens/BattleSetupScreen';
import { BattleScreen } from './screens/BattleScreen';
import { BattleResultScreen } from './screens/BattleResultScreen';
import { MemorialScreen } from './screens/MemorialScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Button } from './components/Button';
import { fmtDate } from './lib/format';
import { critterSvg, furArt } from '@art/index';

const SPLASH_TRIO = [
  critterSvg({ species: 'cat', fur: furArt(0), iris: '#2ecc71', pattern: 1, eyes: 0, accessory: 1, weapon: 'claw', weaponColor: '#e63946', pose: 'happy' }),
  critterSvg({ species: 'dog', fur: furArt(4), iris: '#8e5a2a', pattern: 0, eyes: 4, accessory: 3, weapon: 'stick', weaponColor: '#2ec4b6', pose: 'happy' }),
  critterSvg({ species: 'mouse', fur: furArt(1), iris: '#3498db', pattern: 0, eyes: 0, accessory: 6, weapon: 'slingshot', weaponColor: '#adb5bd', pose: 'happy' }),
];

function Splash({ onStart, ready }: { onStart: () => void; ready: boolean }) {
  return (
    <div class="screen splash" onClick={ready ? onStart : undefined}>
      <div class="splash-logo">
        <div class="splash-trio" aria-hidden="true">
          {SPLASH_TRIO.map((svg, i) => (
            <div key={i} class="critter-svg critter-svg--lg is-static" dangerouslySetInnerHTML={{ __html: svg }} />
          ))}
        </div>
        <h1>Пушистая Резня</h1>
        <p class="muted">Тактика про котиков, собачек и мышек. Милая и кровавая.</p>
      </div>
      <p class="splash-hint">{ready ? 'Нажмите, чтобы начать' : 'Загрузка…'}</p>
    </div>
  );
}

function ConflictScreen() {
  const c = useStore($conflict);
  if (!c) return null;
  return (
    <div class="screen center">
      <div class="card stack pop-in">
        <h2>Найден прогресс с другого устройства</h2>
        <p class="muted">
          В облаке: {fmtDate(c.cloud.updatedAt)}, бойцов: {c.cloud.army?.units.length ?? 0}, Славы: {c.cloud.profile.glory}.
        </p>
        <p class="muted">
          Здесь: {fmtDate(c.local.updatedAt)}, бойцов: {c.local.army?.units.length ?? 0}, Славы: {c.local.profile.glory}.
        </p>
        <Button primary icon="☁️" onClick={() => resolveConflict('cloud')}>
          Загрузить из облака
        </Button>
        <Button icon="📱" onClick={() => resolveConflict('local')}>
          Оставить этот
        </Button>
      </div>
    </div>
  );
}

function routeKey(r: Route): string {
  return r.name === 'unit' ? `unit:${r.unitId}` : r.name;
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'menu':
      return <MenuScreen />;
    case 'army':
      return <ArmyScreen />;
    case 'armyCreate':
      return <ArmyCreateScreen />;
    case 'recruit':
      return <ArmyScreen />;
    case 'unit':
      return <UnitScreen unitId={route.unitId} />;
    case 'battleSetup':
      return <BattleSetupScreen />;
    case 'battle':
      return <BattleScreen />;
    case 'battleResult':
      return <BattleResultScreen />;
    case 'memorial':
      return <MemorialScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'notFound':
      return <MenuScreen />;
  }
}

function Router() {
  const route = useStore($route);
  // key пересоздаёт контейнер при смене маршрута — проигрывается CSS-переход route-in
  return (
    <div class="route" key={routeKey(route)}>
      <Screen route={route} />
    </div>
  );
}

export function App() {
  const status = useStore($saveStatus);
  const err = useStore($saveError);
  const [started, setStarted] = useState(false);
  if (status === 'conflict') return <ConflictScreen />;
  if (status !== 'ready' || !started) {
    return (
      <>
        <Splash ready={status === 'ready'} onStart={() => setStarted(true)} />
        {err && (
          <div class="toast toast-error">
            <span class="ico">✕</span>
            <span>Сейв повреждён: {err}. Начат новый.</span>
          </div>
        )}
      </>
    );
  }
  return <Router />;
}
