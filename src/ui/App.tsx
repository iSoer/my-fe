import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { $route } from '@state/router';
import { $conflict, $saveError, $saveStatus, resolveConflict } from '@state/save';
import { MenuScreen } from './screens/MenuScreen';
import { ArmyCreateScreen } from './screens/ArmyCreateScreen';
import { ArmyScreen } from './screens/ArmyScreen';
import { UnitScreen } from './screens/UnitScreen';
import { RecruitScreen } from './screens/RecruitScreen';
import { BattleSetupScreen } from './screens/BattleSetupScreen';
import { BattleScreen } from './screens/BattleScreen';
import { BattleResultScreen } from './screens/BattleResultScreen';
import { MemorialScreen } from './screens/MemorialScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Button } from './components/Button';
import { fmtDate } from './lib/format';

function Splash({ onStart, ready }: { onStart: () => void; ready: boolean }) {
  return (
    <div class="screen splash" onClick={ready ? onStart : undefined}>
      <div class="splash-logo">
        <div class="splash-emoji">🐱🩸🐶</div>
        <h1>Пушистая Резня</h1>
        <p class="muted">Тактика про котиков и собачек. Милая и кровавая.</p>
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
      <div class="card stack">
        <h2>Найден прогресс с другого устройства</h2>
        <p class="muted">
          В облаке: {fmtDate(c.cloud.updatedAt)}, бойцов: {c.cloud.army?.units.length ?? 0}, Славы: {c.cloud.profile.glory}.
        </p>
        <p class="muted">
          Здесь: {fmtDate(c.local.updatedAt)}, бойцов: {c.local.army?.units.length ?? 0}, Славы: {c.local.profile.glory}.
        </p>
        <Button primary onClick={() => resolveConflict('cloud')}>
          Загрузить из облака
        </Button>
        <Button onClick={() => resolveConflict('local')}>Оставить этот</Button>
      </div>
    </div>
  );
}

function Router() {
  const route = useStore($route);
  switch (route.name) {
    case 'menu':
      return <MenuScreen />;
    case 'army':
      return <ArmyScreen />;
    case 'armyCreate':
      return <ArmyCreateScreen />;
    case 'recruit':
      return <RecruitScreen />;
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

export function App() {
  const status = useStore($saveStatus);
  const err = useStore($saveError);
  const [started, setStarted] = useState(false);
  if (status === 'conflict') return <ConflictScreen />;
  if (status !== 'ready' || !started) {
    return (
      <>
        <Splash ready={status === 'ready'} onStart={() => setStarted(true)} />
        {err && <div class="toast toast-error">Сейв повреждён: {err}. Начат новый.</div>}
      </>
    );
  }
  return <Router />;
}
