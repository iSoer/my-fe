import { useEffect, useRef, useState } from 'preact/hooks';

export function reducedMotion(): boolean {
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Плавный «набег» числа к целевому значению (easeOutCubic). */
export function useCountUp(target: number, duration = 700, opts: { fromZero?: boolean } = {}): number {
  const [val, setVal] = useState(opts.fromZero ? 0 : target);
  const prev = useRef(opts.fromZero ? 0 : target);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) {
      setVal(target);
      return;
    }
    if (reducedMotion()) {
      setVal(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number): void => {
      const k = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setVal(Math.round(from + (target - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/** Инлайн-задержка для поочерёдного появления элементов списка (шаг 40 мс, не больше 12). */
export function stagger(i: number, step = 40, cap = 12): { animationDelay: string } {
  return { animationDelay: `${Math.min(i, cap) * step}ms` };
}

/** Счётчик для перезапуска CSS-анимации через смену key. */
export function useReplay(): [number, () => void] {
  const [n, setN] = useState(0);
  return [n, () => setN((x) => x + 1)];
}
