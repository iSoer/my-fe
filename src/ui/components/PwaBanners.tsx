import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { $route } from '@state/router';
import { $offlineReady, $updateReady, applyUpdate } from '@platform/pwa';
import { Button } from './Button';
import { Toast } from './Toast';

/** Перезагрузка здесь потеряла бы незавершённые анимации/экран итогов — обновление ждёт выхода. */
const NO_RELOAD_ROUTES = new Set(['battle', 'battleResult']);

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
        <div class="pwa-banner" role="status">
          <span class="msg">Доступна новая версия</span>
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
