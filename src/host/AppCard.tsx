import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button } from '@game/ui/components/Button';
import {
  $installPrompt,
  $isStandalone,
  $online,
  $updateReady,
  applyUpdate,
  installMode,
  promptInstall,
  storageEstimate,
} from './pwa';
import { cloudAvailable, isTelegram } from './telegram';
import { $lang, tr } from '@game/i18n';

function fmtMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} ${tr('MB', 'МБ')}`;
}

/** Секция «Приложение» в Настройках игры: офлайн, облако Telegram, установка и обновление PWA. */
export function AppCard() {
  // installMode() читает атомы — подписываемся, чтобы перерисоваться при их смене.
  useStore($installPrompt);
  // Секция хоста может не перемонтироваться при смене языка — подписываемся сами.
  useStore($lang);
  const standalone = useStore($isStandalone);
  const online = useStore($online);
  const updateReady = useStore($updateReady);
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);
  const [iosHelp, setIosHelp] = useState(false);
  useEffect(() => {
    void storageEstimate().then(setStorage);
  }, []);
  const mode = installMode();
  const offline = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;

  return (
    <div className="card stack pop-in">
      <div className="section-title">📲 {tr('App', 'Приложение')}</div>
      <div className="stats-table">
        <span className="k">{tr('Offline mode', 'Офлайн-режим')}</span>
        <span className="v">{offline ? tr('ready', 'готов') : tr('no', 'нет')}</span>
        <span className="k">{tr('Network', 'Сеть')}</span>
        <span className="v">{online ? tr('online', 'есть') : tr('offline', 'нет')}</span>
        {isTelegram && (
          <>
            <span className="k">{tr('Telegram cloud', 'Облако Telegram')}</span>
            <span className="v">{cloudAvailable() ? tr('save is syncing', 'сейв синхронизируется') : tr('unavailable', 'недоступно')}</span>
          </>
        )}
        {storage && (
          <>
            <span className="k">{tr('Storage used', 'Занято')}</span>
            <span className="v">
              {fmtMb(storage.usage)}
              {storage.persisted ? tr(' · protected', ' · защищено') : ''}
            </span>
          </>
        )}
        {!isTelegram && (
          <>
            <span className="k">{tr('Installed', 'Установлено')}</span>
            <span className="v">{standalone ? tr('yes', 'да') : tr('no', 'нет')}</span>
          </>
        )}
      </div>
      {updateReady && (
        <Button block primary icon="⬆️" onClick={applyUpdate}>
          {tr('Update to the new version', 'Обновить до новой версии')}
        </Button>
      )}
      {mode === 'prompt' && (
        <Button block icon="📲" onClick={() => void promptInstall()}>
          {tr('Install on your phone', 'Установить на телефон')}
        </Button>
      )}
      {mode === 'ios' && (
        <>
          <Button block icon="📲" onClick={() => setIosHelp(!iosHelp)}>
            {tr('How to install on iPhone', 'Как установить на iPhone')}
          </Button>
          {iosHelp && (
            <ol className="pwa-steps muted small">
              <li>{tr('Open the game in Safari.', 'Откройте игру в Safari.')}</li>
              <li>{tr('Tap “Share” (the square with an arrow).', 'Нажмите «Поделиться» (квадрат со стрелкой).')}</li>
              <li>{tr('Choose “Add to Home Screen”.', 'Выберите «На экран „Домой“».')}</li>
            </ol>
          )}
        </>
      )}
    </div>
  );
}
