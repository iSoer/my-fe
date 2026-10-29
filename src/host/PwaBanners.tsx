import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { $route } from '@game/state/router';
import { Button } from '@game/ui/components/Button';
import { Toast } from '@game/ui/components/Toast';
import { $offlineReady, $updateReady, applyUpdate, canReloadOn } from './pwa';
import { $lang, tr } from '@game/i18n';

/** Слой поверх экранов игры: «игра работает без сети» и плашка новой версии. */
export function PwaBanners() {
  const route = useStore($route);
  const updateReady = useStore($updateReady);
  const offlineReady = useStore($offlineReady);
  const [later, setLater] = useState(false);
  // Слой хоста не перемонтируется при смене языка — подписываемся сами.
  useStore($lang);
  const showUpdate = updateReady && !later && canReloadOn(route.name);
  return (
    <>
      <Toast
        message={
          offlineReady ? tr('Game cached — works offline', 'Игра сохранена — работает без сети') : undefined
        }
      />
      {showUpdate && (
        <div className="pwa-banner" role="status">
          <span className="msg">{tr('New version available', 'Доступна новая версия')}</span>
          <Button sm ghost onClick={() => setLater(true)}>
            {tr('Later', 'Позже')}
          </Button>
          <Button sm primary onClick={applyUpdate}>
            {tr('Update', 'Обновить')}
          </Button>
        </div>
      )}
    </>
  );
}
