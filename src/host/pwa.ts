/** Тонкий адаптер PWA: регистрация Service Worker (Serwist), обновления, установка на устройство. */
import { atom } from 'nanostores';
import type { Serwist } from '@serwist/window';
import { $route } from '@game/state/router';
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

/** Перезагрузка в бою и на итогах потеряла бы незавершённые анимации и экран итогов — там страница не перезагружается. */
const NO_RELOAD_ROUTES = new Set(['battle', 'battleResult']);

export function canReloadOn(routeName: string): boolean {
  return !NO_RELOAD_ROUTES.has(routeName);
}

/** Не перезагружаться по ошибке загрузки чанка чаще, чем раз в это время (защита от цикла перезагрузок). */
export const CHUNK_RELOAD_GUARD_MS = 15_000;

export function chunkReloadAllowed(now: number, lastReloadAt: number | null): boolean {
  return lastReloadAt === null || now - lastReloadAt >= CHUNK_RELOAD_GUARD_MS;
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
let reloadPending = false;
const CHUNK_RELOAD_KEY = 'pawfield:chunk-reload-at';

function reloadNow(): void {
  hooks?.beforeReload();
  location.reload();
}

/**
 * Страница должна перезагрузиться (версия сменилась под ногами): сразу, если можно, иначе — как только игрок
 * уйдёт с боя и итогов.
 */
function reloadWhenSafe(): void {
  if (canReloadOn($route.get().name)) return reloadNow();
  if (reloadPending) return;
  reloadPending = true;
  $route.listen((r) => {
    if (canReloadOn(r.name)) reloadNow();
  });
}

function readChunkReloadAt(): number | null {
  try {
    const v = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

/**
 * Ленивый чанк (Phaser, сцена поселения) не загрузился: после деплоя старой вкладке его файлов уже нет ни на сервере,
 * ни в кэше SW. Перезагрузиться на новую версию — вне боя и итогов, не чаще раза в CHUNK_RELOAD_GUARD_MS.
 */
function onPreloadError(e: Event): void {
  const now = Date.now();
  if (!chunkReloadAllowed(now, readChunkReloadAt())) return;
  if (!canReloadOn($route.get().name)) return reloadWhenSafe();
  e.preventDefault();
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    /* ignore */
  }
  reloadNow();
}

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
  window.addEventListener('vite:preloadError', onPreloadError);

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
  // Новый SW взял управление. Если это мы нажали «Обновить» — перезагрузка. Если обновление активировала другая
  // вкладка, старые кэши уже удалены (cleanupOutdatedCaches): эта вкладка тоже переходит на новую версию, но не
  // посреди боя и не на итогах. Первый захват страницы при установке SW (clientsClaim) — не обновление.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) return location.reload();
    if (!hadController) {
      hadController = true;
      return;
    }
    reloadWhenSafe();
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

/**
 * Сейв записан более новой версией игры: подтянуть новый SW (если он уже скачан — активировать) и перезагрузиться.
 * Боя здесь нет — игра с таким сейвом не стартует.
 */
export async function updateAndReload(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    const next = reg?.waiting ?? reg?.installing;
    if (next) {
      applying = true;
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
      next.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => location.reload(), RELOAD_FALLBACK_MS);
      return;
    }
  } catch {
    /* без SW — обычная перезагрузка */
  }
  location.reload();
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
