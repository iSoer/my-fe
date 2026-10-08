import { render } from 'preact';
import './ui/styles.css';
import { App } from './ui/App';
import { initTelegram, setBackButton, setClosingConfirmation } from '@platform/telegram';
import { $route, back, initRouter } from '@state/router';
import { $battle, $save, initSave } from '@state/save';
import { $battleUi } from '@state/battleUi';
import { $pauseOpen } from './ui/lib/pause';

function showFatal(message: string, stack: string): void {
  const root = document.getElementById('app');
  if (!root) return;
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'fatal';
  const h = document.createElement('h2');
  h.textContent = 'Что-то пошло не так';
  const p = document.createElement('p');
  p.textContent = message;
  const pre = document.createElement('pre');
  pre.textContent = stack;
  const row = document.createElement('div');
  row.className = 'row';
  const reload = document.createElement('button');
  reload.className = 'btn btn-primary';
  reload.textContent = 'Перезапустить';
  reload.onclick = () => location.reload();
  const copy = document.createElement('button');
  copy.className = 'btn';
  copy.textContent = 'Скопировать ошибку';
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

function syncBackButton(): void {
  const route = $route.get();
  if (route.name === 'menu') setBackButton(false);
  else if (route.name === 'battle') setBackButton(true, () => $pauseOpen.set(!$pauseOpen.get()));
  else if (route.name === 'battleResult') setBackButton(false);
  else setBackButton(true, () => back());
}

async function boot(): Promise<void> {
  initTelegram();
  initRouter();
  const root = document.getElementById('app');
  if (!root) throw new Error('#app не найден');
  // Отладочный хук для смоук-тестов и консоли (игра одиночная, секретов нет).
  (window as unknown as { __pf?: unknown }).__pf = { save: $save, ui: $battleUi };
  render(<App />, root);
  $route.subscribe(syncBackButton);
  $battle.subscribe((b) => setClosingConfirmation(!!b && !b.result));
  await initSave();
}

void boot();
