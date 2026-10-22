import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { $route } from '@game/state/router';
import { Button } from '@game/ui/components/Button';
import { Toast } from '@game/ui/components/Toast';
import { $offlineReady, $updateReady, applyUpdate } from './pwa';

/** Перезагрузка здесь потеряла бы незавершённые анимации и экран итогов — обновление ждёт выхода. */
const NO_RELOAD_ROUTES = new Set(['battle', 'battleResult']);

/** Слой поверх экранов игры: «игра работает без сети» и плашка новой версии. */
export function PwaBanners() {
  const route = useStore($route);
  const updateReady = useStore($updateReady);
  const offlineReady = useStore($offlineReady);
  const [later, setLater] = useState(false);
  const showUpdate = updateReady && !later && !NO_RELOAD_ROUTES.has(route.name);
  return (
    <>
      <Toast message={offlineReady ? 'Игра сохранена — работает без сети' : undefined} />
      {showUpdate && (
        <div className="pwa-banner" role="status">
          <span className="msg">Доступна новая версия</span>
          <Button sm ghost onClick={() => setLater(true)}>
            Позже
          </Button>
          <Button sm primary onClick={applyUpdate}>
            Обновить
          </Button>
        </div>
      )}
    </>
  );
}
