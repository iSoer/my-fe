/** Тонкий типизированный адаптер над window.Telegram.WebApp с фолбэком для браузера. */

export interface TgSafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface TelegramWebApp {
  ready(): void;
  expand(): void;
  close(): void;
  requestFullscreen?(): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  isVersionAtLeast(v: string): boolean;
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string | undefined>;
  viewportHeight: number;
  viewportStableHeight: number;
  safeAreaInset?: TgSafeArea;
  contentSafeAreaInset?: TgSafeArea;
  initDataUnsafe: { user?: { id: number; first_name?: string; username?: string } };
  BackButton: { isVisible: boolean; show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  CloudStorage: {
    setItem(key: string, value: string, cb?: (err: Error | null, ok?: boolean) => void): void;
    getItem(key: string, cb: (err: Error | null, value?: string) => void): void;
    getItems(keys: string[], cb: (err: Error | null, values?: Record<string, string>) => void): void;
    removeItem(key: string, cb?: (err: Error | null, ok?: boolean) => void): void;
    removeItems(keys: string[], cb?: (err: Error | null, ok?: boolean) => void): void;
    getKeys(cb: (err: Error | null, keys?: string[]) => void): void;
  };
  onEvent(name: string, cb: () => void): void;
  offEvent(name: string, cb: () => void): void;
  openTelegramLink(url: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const tg: TelegramWebApp | null = typeof window !== 'undefined' ? (window.Telegram?.WebApp ?? null) : null;

export const isTelegram = !!tg && !!tg.initDataUnsafe && typeof tg.version === 'string' && tg.platform !== 'unknown';

export function userNamespace(): string {
  const id = tg?.initDataUnsafe?.user?.id;
  return id ? String(id) : 'local';
}

export function initTelegram(): void {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.();
    if (tg.isVersionAtLeast('8.0') && (tg.platform === 'ios' || tg.platform === 'android')) tg.requestFullscreen?.();
  } catch {
    /* ignore */
  }
  applySafeArea();
  tg.onEvent('safeAreaChanged', applySafeArea);
  tg.onEvent('contentSafeAreaChanged', applySafeArea);
  tg.onEvent('viewportChanged', applySafeArea);
}

function applySafeArea(): void {
  const root = document.documentElement;
  const sa = tg?.safeAreaInset;
  const csa = tg?.contentSafeAreaInset;
  const top = (sa?.top ?? 0) + (csa?.top ?? 0);
  const bottom = sa?.bottom ?? 0;
  root.style.setProperty('--tg-safe-top', `${top}px`);
  root.style.setProperty('--tg-safe-bottom', `${bottom}px`);
  if (tg?.viewportStableHeight) root.style.setProperty('--tg-viewport', `${tg.viewportStableHeight}px`);
  if (tg?.colorScheme) root.dataset['theme'] = tg.colorScheme;
}

let backCb: (() => void) | null = null;
export function setBackButton(visible: boolean, onClick?: () => void): void {
  if (!tg) return;
  if (backCb) tg.BackButton.offClick(backCb);
  backCb = null;
  if (visible && onClick) {
    backCb = onClick;
    tg.BackButton.onClick(onClick);
    tg.BackButton.show();
  } else tg.BackButton.hide();
}

export function setClosingConfirmation(on: boolean): void {
  if (!tg) return;
  try {
    if (on) tg.enableClosingConfirmation();
    else tg.disableClosingConfirmation();
  } catch {
    /* ignore */
  }
}

export function cloudAvailable(): boolean {
  return !!tg && tg.isVersionAtLeast('6.9') && !!tg.CloudStorage;
}

export function cloudGetItems(keys: string[]): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    if (!cloudAvailable() || !tg) return resolve({});
    tg.CloudStorage.getItems(keys, (err, values) => (err ? reject(err) : resolve(values ?? {})));
  });
}

export function cloudSetItem(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!cloudAvailable() || !tg) return resolve();
    tg.CloudStorage.setItem(key, value, (err) => (err ? reject(err) : resolve()));
  });
}

export function cloudRemoveItems(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!cloudAvailable() || !tg || keys.length === 0) return resolve();
    tg.CloudStorage.removeItems(keys, (err) => (err ? reject(err) : resolve()));
  });
}

export function cloudGetKeys(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (!cloudAvailable() || !tg) return resolve([]);
    tg.CloudStorage.getKeys((err, keys) => (err ? reject(err) : resolve(keys ?? [])));
  });
}

export function shareText(text: string, url: string): void {
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg) tg.openTelegramLink(link);
  else window.open(link, '_blank');
}
