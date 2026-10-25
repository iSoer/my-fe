import { createRoot } from 'react-dom/client';
import { getSerwist } from 'virtual:serwist';
import GameRoot from '@game/GameRoot';
import { setGameHost } from '@game/platform/host';
import { setStorageNamespace } from '@game/platform/storage';
import { $route, back, navigate } from '@game/state/router';
import { $battle, flushPersist } from '@game/state/save';
import { $pauseOpen } from '@game/ui/lib/pause';
import '@game/ui/styles.css';
import { initTelegram, setBackButton, setClosingConfirmation, tgHaptic, userNamespace } from '@host/telegram';
import { initPwa } from '@host/pwa';
import { chooseCloud, reconcileCloudSave, startCloudMirror } from '@host/sync';
import { PwaBanners } from '@host/PwaBanners';
import { AppCard } from '@host/AppCard';
import { ConflictScreen } from '@host/ConflictScreen';
import '@host/host.css';
import { setLang, tr } from '@game/i18n';

// my-fe — хост игры: Telegram Mini App и PWA на GitHub Pages. Сама игра (src/game) синхронизируется из next-instapok
// (tools/sync-game.mjs) и одинакова в обоих проектах; платформа подключается здесь через setGameHost и сторы игры.

function showFatal(message: string, stack: string): void {
  const root = document.getElementById('app');
  if (!root) return;
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'fatal';
  const h = document.createElement('h2');
  h.textContent = tr('Something went wrong', 'Что-то пошло не так');
  const p = document.createElement('p');
  p.textContent = message;
  const pre = document.createElement('pre');
  pre.textContent = stack;
  const row = document.createElement('div');
  row.className = 'row';
  const reload = document.createElement('button');
  reload.className = 'btn btn-primary';
  reload.textContent = tr('Restart', 'Перезапустить');
  reload.onclick = () => location.reload();
  const copy = document.createElement('button');
  copy.className = 'btn';
  copy.textContent = tr('Copy error', 'Скопировать ошибку');
  copy.onclick = () => void navigator.clipboard?.writeText(`${message}\n${stack}`).catch(() => undefined);
  row.append(reload, copy);
  box.append(h, p, pre, row);
  root.append(box);
}

window.addEventListener('error', (e) => {
  showFatal(e.message, e.error instanceof Error ? (e.error.stack ?? '') : '');
});
window.addEventListener('unhandledrejection', (e) => {
  const r: unknown = e.reason;
  showFatal(r instanceof Error ? r.message : String(r), r instanceof Error ? (r.stack ?? '') : '');
});

/** Кнопка «Назад» Telegram: в бою — пауза, из деревни — в главное меню, на меню и итогах скрыта. */
function syncBackButton(): void {
  const route = $route.get();
  if (route.name === 'menu' || route.name === 'battleResult') setBackButton(false);
  else if (route.name === 'battle') setBackButton(true, () => $pauseOpen.set(!$pauseOpen.get()));
  else if (route.name === 'village') setBackButton(true, () => navigate('/'));
  else setBackButton(true, () => back());
}

async function boot(): Promise<void> {
  initTelegram();
  // Сейвы разных пользователей Telegram на одном устройстве не смешиваются
  setStorageNamespace(userNamespace());
  if (import.meta.env.PROD) initPwa({ getSerwist, beforeReload: flushPersist });
  setGameHost({ Overlay: PwaBanners, SettingsSection: AppCard, haptic: tgHaptic });

  const el = document.getElementById('app');
  if (!el) throw new Error('#app не найден');
  const root = createRoot(el);

  const start = (): void => {
    root.render(<GameRoot />);
    startCloudMirror();
    $route.subscribe(syncBackButton);
    $battle.subscribe((b) => setClosingConfirmation(!!b && !b.result));
  };

  const conflict = await reconcileCloudSave();
  if (!conflict) return start();
  // Сейв ещё не загружен в игру — экран выбора показываем на языке локального сейва
  setLang(conflict.local.settings.lang);
  root.render(
    <ConflictScreen
      conflict={conflict}
      onPick={(choice) => {
        if (choice === 'cloud') chooseCloud(conflict);
        start();
      }}
    />,
  );
}

void boot();
