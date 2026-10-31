import { createRoot } from 'react-dom/client';
import { getSerwist } from 'virtual:serwist';
import GameRoot from '@game/GameRoot';
import { setGameHost } from '@game/platform/host';
import { setStorageNamespace } from '@game/platform/storage';
import { diagBoot } from '@game/platform/diag';
import { $route, back, navigate } from '@game/state/router';
import { $battle, $save, flushPersist } from '@game/state/save';
import { $pauseOpen } from '@game/ui/lib/pause';
import { $dialogue, skipDialogue } from '@game/state/dialogue';
import '@game/ui/styles.css';
import { initTelegram, setBackButton, setClosingConfirmation, tgHaptic, userNamespace } from '@host/telegram';
import { initPwa, updateAndReload } from '@host/pwa';
import { chooseCloud, reconcileCloudSave, startCloudMirror } from '@host/sync';
import { NewerSaveScreen } from '@host/NewerSaveScreen';
import { PwaBanners } from '@host/PwaBanners';
import { AppCard } from '@host/AppCard';
import { ConflictScreen } from '@host/ConflictScreen';
import '@host/host.css';
import { setLang, tr } from '@game/i18n';

// my-fe — игра (src/game) и её платформа: Telegram Mini App и PWA на GitHub Pages. Игра не знает о хосте;
// платформа подключается здесь через setGameHost и сторы игры.

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

/** `pnpm dev:rich`: столько Вкусняшек держим в сейве, пополняя после каждой траты. */
const RICH_TREATS = 999_999;

/** Режим разработки `rich` (`vite --mode rich`): Вкусняшки всегда на максимуме. В сборку не попадает. */
function keepTreatsMaxed(): void {
  $save.subscribe((s) => {
    if (s.profile.treats < RICH_TREATS) $save.set({ ...s, profile: { ...s.profile, treats: RICH_TREATS } });
  });
}

/** Кнопка «Назад» Telegram: в бою — пауза, из деревни — в главное меню, на меню и итогах скрыта. */
function syncBackButton(): void {
  const route = $route.get();
  if (route.name === 'menu' || route.name === 'battleResult') setBackButton(false);
  else if (route.name === 'battle') setBackButton(true, () => $pauseOpen.set(!$pauseOpen.get()));
  // В поселении «Назад» сперва закрывает разговор с жителем
  else if (route.name === 'village')
    setBackButton(true, () => ($dialogue.get() ? skipDialogue() : navigate('/')));
  else setBackButton(true, () => back());
}

async function boot(): Promise<void> {
  // Скрытая диагностика: отметка запуска (и незакрытого экрана боя/поселения — признак выгрузки страницы iOS)
  diagBoot();
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
    if (import.meta.env.DEV && import.meta.env.MODE === 'rich') keepTreatsMaxed();
  };

  const reconciled = await reconcileCloudSave();
  if (reconciled.kind === 'ok') return start();
  // Сейв от более новой версии игры: не запускаем игру и не зеркалим в облако, чтобы не обрезать его
  if (reconciled.kind === 'newer') {
    root.render(<NewerSaveScreen onReload={() => void updateAndReload()} />);
    return;
  }
  const { conflict } = reconciled;
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
