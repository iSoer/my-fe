import { atom } from 'nanostores';

export type Route =
  | { name: 'menu' }
  | { name: 'army' }
  | { name: 'armyCreate' }
  | { name: 'recruit' }
  | { name: 'unit'; unitId: string }
  | { name: 'battleSetup' }
  | { name: 'battle' }
  | { name: 'battleResult' }
  | { name: 'memorial' }
  | { name: 'settings' }
  | { name: 'notFound'; path: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean);
  const [a, b] = parts;
  if (!a) return { name: 'menu' };
  if (a === 'army') {
    if (!b) return { name: 'army' };
    if (b === 'create') return { name: 'armyCreate' };
    if (b === 'recruit') return { name: 'recruit' };
    return { name: 'unit', unitId: b };
  }
  if (a === 'battle') {
    if (!b) return { name: 'battle' };
    if (b === 'setup') return { name: 'battleSetup' };
    if (b === 'result') return { name: 'battleResult' };
  }
  if (a === 'memorial') return { name: 'memorial' };
  if (a === 'settings') return { name: 'settings' };
  return { name: 'notFound', path };
}

export function routePath(r: Route): string {
  switch (r.name) {
    case 'menu':
      return '/';
    case 'army':
      return '/army';
    case 'armyCreate':
      return '/army/create';
    case 'recruit':
      return '/army/recruit';
    case 'unit':
      return `/army/${r.unitId}`;
    case 'battleSetup':
      return '/battle/setup';
    case 'battle':
      return '/battle';
    case 'battleResult':
      return '/battle/result';
    case 'memorial':
      return '/memorial';
    case 'settings':
      return '/settings';
    case 'notFound':
      return `/${r.path}`;
  }
}

const currentHash = (): string => (typeof location !== 'undefined' ? location.hash : '');

export const $route = atom<Route>(parseRoute(currentHash()));

let depth = 0;

export function navigate(path: string, replace = false): void {
  const target = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (typeof location === 'undefined') {
    $route.set(parseRoute(target));
    return;
  }
  if (location.hash === target) return;
  if (replace) history.replaceState(null, '', target);
  else {
    history.pushState(null, '', target);
    depth++;
  }
  $route.set(parseRoute(target));
}

export function go(r: Route, replace = false): void {
  navigate(routePath(r), replace);
}

/** Назад: по истории, если она наша; иначе — в меню. */
export function back(): void {
  if (depth > 0) {
    depth--;
    history.back();
  } else navigate('/', true);
}

export function parentRoute(r: Route): Route {
  switch (r.name) {
    case 'unit':
    case 'armyCreate':
    case 'recruit':
      return { name: 'army' };
    case 'battleSetup':
    case 'battleResult':
    case 'army':
    case 'memorial':
    case 'settings':
    case 'battle':
    default:
      return { name: 'menu' };
  }
}

export function initRouter(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('popstate', () => $route.set(parseRoute(location.hash)));
  window.addEventListener('hashchange', () => $route.set(parseRoute(location.hash)));
}
