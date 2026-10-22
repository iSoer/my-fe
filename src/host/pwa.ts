/** Тонкий адаптер PWA: регистрация Service Worker (Serwist), обновления, установка на устройство. */
import { atom } from 'nanostores';
import type { Serwist } from '@serwist/window';
import { isTelegram } from './telegram';

/** Нестандартное событие Chromium; в lib.dom его нет. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'prompt' | 'ios' | null;

/** Новая версия скачана и ждёт активации. */
export const $updateReady = atom(false);
/** SW впервые установлен — игра целиком в кэше. */
export const $offlineReady = atom(false);
export const $installPrompt = atom<BeforeInstallPromptEvent | null>(null);
export const $isStandalone = atom(false);
export const $online = atom(true);

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** Если новый SW не взял управление (вкладка без контроллера и т.п.) — перезагрузиться всё равно. */
const RELOAD_FALLBACK_MS = 4000;

export interface PwaHooks {
  /** getSerwist из virtual:serwist — передаётся из main.tsx, чтобы модуль не зависел от плагина Vite. */
  getSerwist: () => Promise<Serwist | undefined>;
  /** Сохранить прогресс перед перезагрузкой. */
  beforeReload: () => void;
}

/** iOS/iPadOS Safari: установки через beforeinstallprompt нет, только «Поделиться → На экран Домой». */
export function isIosDevice(ua: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS 13+ притворяется macOS
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

export function installModeFor(env: {
  telegram: boolean;
  standalone: boolean;
  hasPrompt: boolean;
  ios: boolean;
}): InstallMode {
  if (env.telegram || env.standalone) return null;
  if (env.hasPrompt) return 'prompt';
  if (env.ios) return 'ios';
  return null;
}

export function shouldCheckUpdate(now: number, lastCheck: number): boolean {
  return now - lastCheck >= UPDATE_CHECK_INTERVAL_MS;
}

export function installMode(): InstallMode {
  return installModeFor({
    telegram: isTelegram,
    standalone: $isStandalone.get(),
    hasPrompt: !!$installPrompt.get(),
    ios: typeof navigator !== 'undefined' && isIosDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0),
  });
}

function detectStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    nav.standalone === true
  );
}

let sw: Serwist | undefined;
let hooks: PwaHooks | null = null;
let applying = false;
let lastCheck = 0;

export function initPwa(h: PwaHooks): void {
  hooks = h;
  $isStandalone.set(detectStandalone());
  window
    .matchMedia('(display-mode: standalone)')
    .addEventListener('change', () => $isStandalone.set(detectStandalone()));

  $online.set(navigator.onLine);
  window.addEventListener('online', () => $online.set(true));
  window.addEventListener('offline', () => $online.set(false));

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    $installPrompt.set(e as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => {
    $installPrompt.set(null);
    void requestPersistence();
  });

  if ($isStandalone.get()) void requestPersistence();

  if (!('serviceWorker' in navigator)) return;
  // После load — не конкурируем с загрузкой игры.
  const start = (): void => {
    register().catch((err: unknown) => console.warn('[pwa] регистрация SW не удалась', err));
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

async function register(): Promise<void> {
  sw = await hooks?.getSerwist();
  if (!sw) return;
  sw.addEventListener('installed', (e) => {
    if (!e.isUpdate) $offlineReady.set(true);
  });
  sw.addEventListener('waiting', () => $updateReady.set(true));
  sw.addEventListener('controlling', () => {
    if (applying) location.reload();
  });
  await sw.register();
  lastCheck = Date.now();
  // Установленная PWA может жить в фоне сутками — проверяем обновления при возврате и по таймеру.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
}

function checkForUpdate(): void {
  const now = Date.now();
  if (!sw || !$online.get() || !shouldCheckUpdate(now, lastCheck)) return;
  lastCheck = now;
  sw.update().catch(() => undefined);
}

/** Активировать скачанную версию и перезагрузиться. Вызывать только вне боя. */
export function applyUpdate(): void {
  if (!sw || !$updateReady.get() || applying) return;
  applying = true;
  hooks?.beforeReload();
  sw.messageSkipWaiting();
  setTimeout(() => location.reload(), RELOAD_FALLBACK_MS);
}

export async function promptInstall(): Promise<boolean> {
  const e = $installPrompt.get();
  if (!e) return false;
  await e.prompt();
  const { outcome } = await e.userChoice;
  $installPrompt.set(null);
  return outcome === 'accepted';
}

/** Просим браузер не вычищать кэш и localStorage (permadeath-сейв). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{
  usage: number;
  quota: number;
  persisted: boolean;
} | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const [est, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted?.() ?? Promise.resolve(false),
    ]);
    return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted };
  } catch {
    return null;
  }
}
