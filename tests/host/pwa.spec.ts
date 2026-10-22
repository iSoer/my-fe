import { describe, expect, it } from 'vitest';
import { installModeFor, isIosDevice, shouldCheckUpdate, UPDATE_CHECK_INTERVAL_MS } from '@host/pwa';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

describe('pwa', () => {
  it('распознаёт iPhone и iPadOS, но не Mac и Android', () => {
    expect(isIosDevice(IPHONE, 5)).toBe(true);
    expect(isIosDevice(IPAD_DESKTOP_UA, 5)).toBe(true);
    expect(isIosDevice(IPAD_DESKTOP_UA, 0)).toBe(false);
    expect(isIosDevice(ANDROID, 5)).toBe(false);
  });

  it('кнопка установки скрыта в Telegram и в установленном приложении', () => {
    const base = { telegram: false, standalone: false, hasPrompt: true, ios: false };
    expect(installModeFor(base)).toBe('prompt');
    expect(installModeFor({ ...base, telegram: true })).toBeNull();
    expect(installModeFor({ ...base, standalone: true })).toBeNull();
  });

  it('iOS без beforeinstallprompt — инструкция, прочие без промпта — ничего', () => {
    expect(installModeFor({ telegram: false, standalone: false, hasPrompt: false, ios: true })).toBe('ios');
    expect(installModeFor({ telegram: false, standalone: false, hasPrompt: false, ios: false })).toBeNull();
  });

  it('обновления проверяются не чаще раза в интервал', () => {
    expect(shouldCheckUpdate(1000, 0)).toBe(false);
    expect(shouldCheckUpdate(UPDATE_CHECK_INTERVAL_MS, 0)).toBe(true);
    expect(shouldCheckUpdate(UPDATE_CHECK_INTERVAL_MS + 5, 10)).toBe(false);
  });
});
