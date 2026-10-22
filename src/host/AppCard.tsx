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

function fmtMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** Секция «Приложение» в Настройках игры: офлайн, облако Telegram, установка и обновление PWA. */
export function AppCard() {
  // installMode() читает атомы — подписываемся, чтобы перерисоваться при их смене.
  useStore($installPrompt);
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
      <div className="section-title">📲 Приложение</div>
      <div className="stats-table">
        <span className="k">Офлайн-режим</span>
        <span className="v">{offline ? 'готов' : 'нет'}</span>
        <span className="k">Сеть</span>
        <span className="v">{online ? 'есть' : 'нет'}</span>
        {isTelegram && (
          <>
            <span className="k">Облако Telegram</span>
            <span className="v">{cloudAvailable() ? 'сейв синхронизируется' : 'недоступно'}</span>
          </>
        )}
        {storage && (
          <>
            <span className="k">Занято</span>
            <span className="v">
              {fmtMb(storage.usage)}
              {storage.persisted ? ' · защищено' : ''}
            </span>
          </>
        )}
        {!isTelegram && (
          <>
            <span className="k">Установлено</span>
            <span className="v">{standalone ? 'да' : 'нет'}</span>
          </>
        )}
      </div>
      {updateReady && (
        <Button block primary icon="⬆️" onClick={applyUpdate}>
          Обновить до новой версии
        </Button>
      )}
      {mode === 'prompt' && (
        <Button block icon="📲" onClick={() => void promptInstall()}>
          Установить на телефон
        </Button>
      )}
      {mode === 'ios' && (
        <>
          <Button block icon="📲" onClick={() => setIosHelp(!iosHelp)}>
            Как установить на iPhone
          </Button>
          {iosHelp && (
            <ol className="pwa-steps muted small">
              <li>Откройте игру в Safari.</li>
              <li>Нажмите «Поделиться» (квадрат со стрелкой).</li>
              <li>Выберите «На экран „Домой“».</li>
            </ol>
          )}
        </>
      )}
    </div>
  );
}
