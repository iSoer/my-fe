/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheableResponsePlugin, ExpirationPlugin, Serwist, StaleWhileRevalidate } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** Тот же URL, что в index.html. */
const TG_SDK_URL = 'https://telegram.org/js/telegram-web-app.js?58';
const TG_SDK_CACHE = 'pawfield-tg-sdk';

const serwist = new Serwist({
  // Все Pages пользователя делят origin *.github.io — префикс, чтобы не пересекаться с чужими кэшами.
  cacheId: 'pawfield',
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    // Старые кэши удаляются при активации новой версии. Открытые вкладки старой версии после этого не догрузят
    // свои ленивые чанки — их переводит на новую версию host/pwa.ts (controllerchange, vite:preloadError).
    cleanupOutdatedCaches: true,
    // Hash-роутинг: любая навигация в scope отдаётся index.html из precache.
    navigateFallback: new URL('index.html', self.registration.scope).href,
    // Telegram дописывает к URL Mini App свои параметры — для precache они не важны.
    ignoreURLParametersMatching: [/^tgWebApp/, /^utm_/],
  },
  // Новая версия активируется только по команде клиента (SKIP_WAITING) — не посреди боя.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => url.origin === 'https://telegram.org' && url.pathname.startsWith('/js/'),
      handler: new StaleWhileRevalidate({
        cacheName: TG_SDK_CACHE,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },
  ],
});

// При первом визите SDK грузится раньше, чем SW берёт управление, — кладём его в кэш сами,
// иначе первый же офлайн-запуск останется без window.Telegram. Ошибка сети установку не валит.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(TG_SDK_CACHE)
      .then((cache) => cache.add(new Request(TG_SDK_URL, { mode: 'cors' })))
      .catch(() => undefined),
  );
});

serwist.addEventListeners();
