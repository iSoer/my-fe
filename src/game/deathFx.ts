import Phaser from 'phaser';
import type { MoveType, Side, UnitInstance, WeaponKind } from '@core/types';
import { CRITTER_PART_ANCHORS, type CritterPart } from '@art/index';
import { FUR_PALETTES } from '@content/appearance';
import { TEX } from './textures';
import { BLOOD_COLORS, textStyle } from './style';
import { bloodBurst, dustPuff, sceneAlive, tween, wait } from './fx';
import { UnitView } from './UnitView';
import { ensureUnitPartTextures, hasTexture, withTimeout, type UnitTexSize } from './svgTextures';

/**
 * Варианты гибели: милые и кровавые. Выбираются детерминированно по seed (юнит + ход),
 * с уклоном под оружие убийцы, чтобы карта и кинематик показывали одно и то же.
 */
export type DeathVariant = 'fall' | 'gibs' | 'explode' | 'flatten' | 'launch' | 'dissolve' | 'drill' | 'crumble' | 'electro' | 'ragdoll' | 'sink';

export const DEATH_VARIANTS: readonly DeathVariant[] = ['fall', 'gibs', 'explode', 'flatten', 'launch', 'dissolve', 'drill', 'crumble', 'electro', 'ragdoll', 'sink'];

const BASE_WEIGHTS: Record<DeathVariant, number> = {
  fall: 3,
  gibs: 2,
  explode: 2,
  flatten: 1,
  launch: 2,
  dissolve: 1,
  drill: 1,
  crumble: 1,
  electro: 1,
  ragdoll: 2,
  sink: 1,
};

/** Уклон по оружию убийцы (добавка к базовому весу). */
const WEAPON_BIAS: Record<WeaponKind, Partial<Record<DeathVariant, number>>> = {
  claw: { gibs: 4, launch: 2, ragdoll: 2 },
  fang: { gibs: 5, ragdoll: 2, launch: 1 },
  stick: { launch: 4, flatten: 4, ragdoll: 3 },
  hiss: { explode: 4, dissolve: 3, electro: 3 },
  howl: { electro: 4, crumble: 4, dissolve: 2 },
  growl: { launch: 4, ragdoll: 3, explode: 2 },
  slingshot: { launch: 4, flatten: 3 },
  burr: { explode: 4, dissolve: 3 },
  bandage: { fall: 3, sink: 3, dissolve: 2 },
  purr: { fall: 3, sink: 3, dissolve: 2 },
};

const MOVE_BIAS: Record<MoveType, Partial<Record<DeathVariant, number>>> = {
  infantry: {},
  armor: { crumble: 2, flatten: 1 },
  cavalry: { launch: 1, ragdoll: 1 },
  flier: { launch: 2, dissolve: 1 },
};

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seed гибели: один и тот же для карты и кинематика. */
export function deathSeed(unitId: string, turn: number): number {
  return hash(`${unitId}:${turn}`);
}

/** Отладочное принуждение варианта: `window.__pfDeathOverride = 'gibs'`. */
function readOverride(): DeathVariant | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __pfDeathOverride?: unknown }).__pfDeathOverride;
  return typeof v === 'string' && (DEATH_VARIANTS as readonly string[]).includes(v) ? (v as DeathVariant) : null;
}

export function pickDeathVariant(seed: number, killerKind: WeaponKind | undefined, moveType: MoveType): DeathVariant {
  const forced = readOverride();
  if (forced) return forced;
  const weights: Record<DeathVariant, number> = { ...BASE_WEIGHTS };
  const addAll = (bias: Partial<Record<DeathVariant, number>>): void => {
    for (const [k, v] of Object.entries(bias) as [DeathVariant, number][]) weights[k] += v;
  };
  if (killerKind) addAll(WEAPON_BIAS[killerKind]);
  addAll(MOVE_BIAS[moveType]);
  let total = 0;
  for (const v of DEATH_VARIANTS) total += weights[v];
  let r = ((seed % 100000) / 100000) * total;
  for (const v of DEATH_VARIANTS) {
    r -= weights[v];
    if (r < 0) return v;
  }
  return 'fall';
}

/** Детерминированный ГПСЧ (LCG) для разброса частей и обломков. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Подгрузить части тела с потолком по времени; undefined — не успели (вариант откатится к безопасному). */
export async function preloadDeathParts(scene: Phaser.Scene, unit: UnitInstance, size: UnitTexSize, ms: number): Promise<Record<CritterPart, string> | undefined> {
  const r = await withTimeout(ensureUnitPartTextures(scene, unit, size), ms);
  return r ?? undefined;
}

/* ---------- Контекст и «тело» ---------- */

export interface DeathCtx {
  scene: Phaser.Scene;
  variant: DeathVariant;
  /** Спрайт кинематика (Image, origin 0.5/0.97) или вид юнита на карте. */
  sprite: Phaser.GameObjects.Image | UnitView;
  unit: UnitInstance;
  /** Ключи текстур частей тела (если успели загрузиться). */
  parts?: Record<CritterPart, string>;
  /** Мировая позиция лап. */
  x: number;
  y: number;
  /** Высота миниатюры (кинематик) или размер клетки (карта). */
  size: number;
  /** Направление удара: куда летит тело. */
  dir: 1 | -1;
  speed: number;
  side: Side;
  /** Вызвать, когда пора положить лужу (каждый вариант — в свой момент). */
  onPool?: () => void;
  killerKind?: WeaponKind;
}

type Mode = 'cine' | 'map';

interface Body {
  scene: Phaser.Scene;
  mode: Mode;
  /** Объект для твинов положения/поворота/масштаба (Image в кинематике, контейнер тела на карте). */
  t: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image | null;
  x0: number;
  y0: number;
  /** Локальный сдвиг лап относительно `t` — чтобы масштабировать «от лап». */
  feetOffset: number;
  /** Мировой прямоугольник спрайта. */
  w: number;
  h: number;
  left: number;
  top: number;
  flipX: boolean;
  depth: number;
  furColor: number;
  /** Временные объекты карты — уничтожаем после анимации. */
  temps: Phaser.GameObjects.GameObject[];
}

const ART_RATIO = 120 / 140;

function makeBody(ctx: DeathCtx, mode: Mode): Body {
  const furColor = FUR_PALETTES[ctx.unit.appearance.furPalette]?.color ?? 0xcccccc;
  if (ctx.sprite instanceof UnitView) {
    const view = ctx.sprite;
    const rig = view.bodyRig();
    const img = view.bodyImage();
    let w = ctx.size * 1.05 * ART_RATIO;
    let h = ctx.size * 1.05;
    let left = ctx.x - w / 2;
    let top = ctx.y - h * 0.97;
    let flipX = false;
    if (img) {
      const m = img.getWorldTransformMatrix();
      w = Math.abs(img.width * m.scaleX);
      h = Math.abs(img.height * m.scaleY);
      left = m.tx - img.originX * w;
      top = m.ty - img.originY * h;
      flipX = img.flipX;
    }
    return { scene: ctx.scene, mode, t: rig, img, x0: rig.x, y0: rig.y, feetOffset: view.feetLocalY(), w, h, left, top, flipX, depth: 11, furColor, temps: [] };
  }
  const img = ctx.sprite;
  const w = img.displayWidth;
  const h = img.displayHeight;
  return {
    scene: ctx.scene,
    mode,
    t: img,
    img,
    x0: img.x,
    y0: img.y,
    feetOffset: 0,
    w,
    h,
    left: img.x - img.originX * w,
    top: img.y - img.originY * h,
    flipX: img.flipX,
    depth: 10,
    furColor,
    temps: [],
  };
}

/* ---------- Общие помощники ---------- */

function alive(b: Body): boolean {
  return sceneAlive(b.scene) && !!(b.t as { scene?: Phaser.Scene }).scene;
}

function flash(b: Body, ms: number): void {
  if (!b.img || !b.img.scene) return;
  b.img.setTintFill(0xffffff);
  b.scene.time.delayedCall(ms, () => {
    if (b.img?.scene) b.img.clearTint();
  });
}

function lerpColor(from: number, to: number, k: number): number {
  const a = Phaser.Display.Color.IntegerToColor(from);
  const c = Phaser.Display.Color.IntegerToColor(to);
  const o = Phaser.Display.Color.Interpolate.ColorWithColor(a, c, 100, Math.round(Math.max(0, Math.min(1, k)) * 100));
  return Phaser.Display.Color.GetColor(o.r, o.g, o.b);
}

/** Плавная подкраска спрайта (мультипликативный tint). */
function tintRamp(b: Body, to: number, ms: number): Promise<void> {
  if (!b.img) return wait(b.scene, ms);
  const proxy = { k: 0 };
  return tween(b.scene, {
    targets: proxy,
    k: 1,
    duration: ms,
    onUpdate: () => {
      if (b.img?.scene) b.img.setTint(lerpColor(0xffffff, to, proxy.k));
    },
  });
}

/** Масштаб «от лап»: на карте компенсируем сдвиг контейнера, в кинематике origin и так у лап. */
function scaleFromFeet(b: Body, sx: number, sy: number, ms: number, ease = 'Quad.easeIn'): Promise<void> {
  return tween(b.scene, { targets: b.t, scaleX: sx, scaleY: sy, y: b.y0 + b.feetOffset * (1 - sy), duration: ms, ease });
}

function hideBody(b: Body): void {
  if ((b.t as { scene?: Phaser.Scene }).scene) b.t.setVisible(false);
}

/** Крупный «удар» текстом (ШМЯК!, БАМ!). Не блокирует. */
function punchText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size: number, speed: number): void {
  if (!sceneAlive(scene)) return;
  const t = scene.add.text(x, y, text, textStyle(size, color, true, Math.max(3, size * 0.14))).setOrigin(0.5).setDepth(27).setScale(2.2).setAlpha(0).setAngle(-8);
  scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 140 / speed, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, alpha: 0, y: y - size * 0.6, duration: 420 / speed, delay: 320 / speed, onComplete: () => t.destroy() });
}

/** Кровавый шлепок на земле. Не блокирует. */
function splatAt(b: Body, x: number, y: number, scale: number, seed: number): void {
  if (!sceneAlive(b.scene)) return;
  const img = b.scene.add.image(x, y, TEX.splat).setTint(BLOOD_COLORS[seed % BLOOD_COLORS.length] ?? 0xd9122b).setAlpha(0.8);
  img.setDisplaySize(scale, scale).setRotation((seed * 1.7) % 6.28).setDepth(b.mode === 'cine' ? 5 : 1.5);
  b.temps.push(img);
}

/** Облако частиц произвольного цвета. Не блокирует. */
function puff(scene: Phaser.Scene, x: number, y: number, tex: string, tints: number[], opts: { count: number; speed: [number, number]; angle?: { min: number; max: number }; gravity?: number; scale?: [number, number]; life?: [number, number]; depth?: number; rotate?: boolean; area?: { w: number; h: number } }): void {
  if (!sceneAlive(scene)) return;
  const cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
    speed: { min: opts.speed[0], max: opts.speed[1] },
    angle: opts.angle ?? { min: 0, max: 360 },
    scale: { start: opts.scale?.[0] ?? 0.8, end: opts.scale?.[1] ?? 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: opts.life?.[0] ?? 400, max: opts.life?.[1] ?? 800 },
    gravityY: opts.gravity ?? 0,
    tint: tints,
    emitting: false,
    quantity: opts.count,
  };
  if (opts.rotate) cfg.rotate = { min: 0, max: 360 };
  if (opts.area) {
    cfg.x = { min: -opts.area.w / 2, max: opts.area.w / 2 };
    cfg.y = { min: -opts.area.h / 2, max: opts.area.h / 2 };
  }
  const e = scene.add.particles(x, y, tex, cfg);
  e.setDepth(opts.depth ?? 24);
  e.explode(opts.count);
  scene.time.delayedCall((opts.life?.[1] ?? 800) + 200, () => e.destroy());
}

/** Расширяющееся кольцо. Не блокирует. */
function shockRing(scene: Phaser.Scene, x: number, y: number, size: number, color: number, ms: number): void {
  if (!sceneAlive(scene)) return;
  const ring = scene.add.image(x, y, TEX.ring).setTint(color).setDepth(25).setAlpha(0.9);
  ring.setDisplaySize(size * 0.3, size * 0.3);
  scene.tweens.add({ targets: ring, displayWidth: size * 2.2, displayHeight: size * 2.2, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
}

/** Картинка части тела поверх спрайта 1:1, с pivot в её якоре. */
function partImage(b: Body, key: string, part: CritterPart): Phaser.GameObjects.Image | null {
  if (!sceneAlive(b.scene) || !hasTexture(b.scene, key)) return null;
  const a = CRITTER_PART_ANCHORS[part];
  const ox = b.flipX ? 1 - a.x : a.x;
  const img = b.scene.add.image(b.left + ox * b.w, b.top + a.y * b.h, key).setOrigin(ox, a.y).setDepth(b.depth);
  img.setDisplaySize(b.w, b.h);
  img.setFlipX(b.flipX);
  b.temps.push(img);
  return img;
}

/**
 * Полёт объекта с гравитацией и отскоками. vx/vy в px/с, g в px/с², spin в °/с.
 * Твины идут через сцену, так что ускорение «пропустить» (timeScale) их тоже ускоряет.
 */
async function fly(
  scene: Phaser.Scene,
  obj: Phaser.GameObjects.Image,
  vx: number,
  vy: number,
  g: number,
  groundY: number,
  spin: number,
  speed: number,
  bounces: number,
  onLand?: (x: number, y: number, n: number) => void,
): Promise<void> {
  let x = obj.x;
  let y = obj.y;
  let angle = obj.angle;
  let vxx = vx;
  let vyy = vy;
  let sp = spin;
  for (let n = 0; n <= bounces; n++) {
    if (!obj.scene) return;
    const a = 0.5 * g;
    const c = y - groundY;
    const disc = vyy * vyy - 4 * a * c;
    let t = disc >= 0 && a > 0 ? (-vyy + Math.sqrt(disc)) / (2 * a) : 0.35;
    if (!isFinite(t) || t <= 0.02) t = 0.35;
    const start = { x, y, vx: vxx, vy: vyy, angle };
    const proxy = { k: 0 };
    await tween(scene, {
      targets: proxy,
      k: 1,
      duration: Math.max(16, (t * 1000) / speed),
      ease: 'Linear',
      onUpdate: () => {
        if (!obj.scene) return;
        const tt = t * proxy.k;
        obj.x = start.x + start.vx * tt;
        obj.y = start.y + start.vy * tt + 0.5 * g * tt * tt;
        obj.angle = start.angle + sp * tt;
      },
    });
    if (!obj.scene) return;
    x = obj.x;
    y = groundY;
    obj.y = groundY;
    angle = obj.angle;
    onLand?.(x, groundY, n);
    const vLand = Math.abs(vyy + g * t);
    vyy = -vLand * 0.35;
    vxx *= 0.55;
    sp *= 0.5;
    if (vLand * 0.35 < g * 0.06) break;
  }
}

/* ---------- Варианты ---------- */

type VariantFn = (ctx: DeathCtx, b: Body, rng: () => number) => Promise<void>;

const fall: VariantFn = async (ctx, b) => {
  const sp = ctx.speed;
  flash(b, 80 / sp);
  b.scene.cameras.main.shake(200 / sp, b.mode === 'cine' ? 0.02 : 0.012);
  bloodBurst(b.scene, ctx.x, ctx.y - b.h * 0.45, b.mode === 'cine' ? 55 : 50, null, b.mode === 'cine' ? 1.8 : 1.1, sp);
  ctx.onPool?.();
  await tween(b.scene, {
    targets: b.t,
    angle: ctx.dir > 0 ? 90 : -90,
    y: b.y0 + (b.mode === 'map' ? ctx.size * 0.2 : 0),
    alpha: 0.85,
    duration: 450 / sp,
    ease: 'Bounce.easeOut',
  });
};

const gibs: VariantFn = async (ctx, b, rng) => {
  const sp = ctx.speed;
  const parts = ctx.parts;
  if (!parts) return explode(ctx, b, rng);
  flash(b, 60 / sp);
  await wait(b.scene, 70 / sp);
  if (!alive(b)) return;
  b.scene.cameras.main.shake(220 / sp, b.mode === 'cine' ? 0.025 : 0.014);
  hideBody(b);
  const s = b.h;
  const g = s * 3.2;
  const dir = ctx.dir;
  const spec: Record<CritterPart, { vx: [number, number]; vy: [number, number]; side: number }> = {
    head: { vx: [0.3, 0.7], vy: [1.1, 1.5], side: dir },
    body: { vx: [0.5, 0.9], vy: [0.6, 0.95], side: dir },
    tail: { vx: [0.3, 0.6], vy: [0.9, 1.3], side: -dir },
    legFront: { vx: [0.3, 0.7], vy: [0.7, 1.1], side: dir },
    legBack: { vx: [0.3, 0.7], vy: [0.7, 1.1], side: -dir },
  };
  bloodBurst(b.scene, ctx.x, ctx.y - s * 0.5, b.mode === 'cine' ? 50 : 40, { min: 230, max: 310 }, b.mode === 'cine' ? 2 : 1.2, sp);
  puff(b.scene, ctx.x, ctx.y - s * 0.5, TEX.dot, [b.furColor, 0xffffff], { count: 10, speed: [s * 0.4, s * 1.2], gravity: s * 2, scale: [0.6, 0], life: [400, 700] });
  // Полувысота части (в долях высоты миниатюры): часть ложится на землю нижним краем, а не центром.
  const halfH: Record<CritterPart, number> = { head: 0.24, body: 0.13, tail: 0.09, legFront: 0.045, legBack: 0.045 };
  const flights: Promise<void>[] = [];
  let seed = 0;
  for (const part of Object.keys(spec) as CritterPart[]) {
    const key = parts[part];
    const img = key ? partImage(b, key, part) : null;
    if (!img) continue;
    const p = spec[part];
    const vx = p.side * s * (p.vx[0] + rng() * (p.vx[1] - p.vx[0]));
    const vy = -s * (p.vy[0] + rng() * (p.vy[1] - p.vy[0]));
    const spin = (rng() < 0.5 ? -1 : 1) * (360 + rng() * 360);
    const partSeed = seed++;
    flights.push(
      fly(b.scene, img, vx, vy, g, ctx.y - halfH[part] * s, spin, sp, 1, (x, y, n) => {
        splatAt(b, x, ctx.y + 2, s * (n === 0 ? 0.22 : 0.14), partSeed * 3 + n);
        if (n === 0) bloodBurst(b.scene, x, y, 6, { min: 220, max: 320 }, 0.6, sp);
      }),
    );
  }
  ctx.onPool?.();
  await Promise.race([Promise.all(flights), wait(b.scene, 1400 / sp)]);
};

const explode: VariantFn = async (ctx, b) => {
  const sp = ctx.speed;
  const s = b.h;
  // Дрожь и раздувание с покраснением
  const shakeTw = b.scene.tweens.add({ targets: b.t, x: b.x0 + 3, duration: 45 / sp, yoyo: true, repeat: 5 });
  await Promise.all([scaleFromFeet(b, 1.35, 1.35, 240 / sp, 'Quad.easeIn'), tintRamp(b, 0xff3b3b, 240 / sp)]);
  shakeTw.stop();
  if (!alive(b)) return;
  b.t.setX(b.x0);
  flash(b, 60 / sp);
  await wait(b.scene, 60 / sp);
  if (!alive(b)) return;
  hideBody(b);
  const cx = ctx.x;
  const cy = ctx.y - s * 0.5;
  b.scene.cameras.main.shake(260 / sp, b.mode === 'cine' ? 0.03 : 0.016);
  bloodBurst(b.scene, cx, cy, b.mode === 'cine' ? 60 : 45, null, b.mode === 'cine' ? 2.2 : 1.3, sp);
  puff(b.scene, cx, cy, TEX.dot, [b.furColor, Phaser.Display.Color.IntegerToColor(b.furColor).lighten(20).color], { count: 12, speed: [s * 0.6, s * 1.6], gravity: s * 2.5, scale: [0.9, 0.1], life: [500, 900] });
  shockRing(b.scene, cx, cy, s, 0xffffff, 380 / sp);
  shockRing(b.scene, cx, cy, s * 0.8, 0xff6b6b, 300 / sp);
  // Дым
  for (let i = 0; i < 5; i++) {
    const sm = b.scene.add.image(cx + (i - 2) * s * 0.12, cy + s * 0.1, TEX.disc).setTint(0x6b6b6b).setAlpha(0.45).setDepth(23);
    sm.setDisplaySize(s * 0.25, s * 0.25);
    b.scene.tweens.add({ targets: sm, y: cy - s * 0.5 - i * s * 0.05, displayWidth: s * 0.7, displayHeight: s * 0.7, alpha: 0, duration: (600 + i * 80) / sp, ease: 'Quad.easeOut', onComplete: () => sm.destroy() });
  }
  // Подпалина
  const scorch = b.scene.add.image(ctx.x, ctx.y, TEX.disc).setTint(0x1a1210).setAlpha(0).setDepth(b.mode === 'cine' ? 4 : 1.2);
  scorch.setDisplaySize(s * 0.9, s * 0.35);
  b.scene.tweens.add({ targets: scorch, alpha: 0.5, duration: 200 / sp });
  b.temps.push(scorch);
  ctx.onPool?.();
  await wait(b.scene, 450 / sp);
};

const flatten: VariantFn = async (ctx, b) => {
  const sp = ctx.speed;
  const s = b.h;
  // Предчувствие: чуть вытянуться вверх
  await scaleFromFeet(b, 0.94, 1.08, 90 / sp, 'Quad.easeOut');
  if (!alive(b)) return;
  await scaleFromFeet(b, 1.7, 0.08, 120 / sp, 'Quad.easeIn');
  if (!alive(b)) return;
  b.scene.cameras.main.shake(180 / sp, b.mode === 'cine' ? 0.028 : 0.015);
  punchText(b.scene, ctx.x, ctx.y - s * 0.5, 'ШМЯК!', '#ffd166', b.mode === 'cine' ? 40 : ctx.size * 0.42, sp);
  bloodBurst(b.scene, ctx.x, ctx.y - s * 0.03, b.mode === 'cine' ? 22 : 14, { min: 150, max: 210 }, b.mode === 'cine' ? 1.6 : 1, sp);
  bloodBurst(b.scene, ctx.x, ctx.y - s * 0.03, b.mode === 'cine' ? 22 : 14, { min: -30, max: 30 }, b.mode === 'cine' ? 1.6 : 1, sp);
  dustPuff(b.scene, ctx.x, ctx.y, s * 0.5, 10);
  ctx.onPool?.();
  const pool = b.scene.add.image(ctx.x, ctx.y + 2, TEX.pool).setTint(0xd9122b).setAlpha(0).setDepth(b.mode === 'cine' ? 6 : 1.4);
  pool.setDisplaySize(s * 0.4, s * 0.15);
  b.temps.push(pool);
  b.scene.tweens.add({ targets: pool, displayWidth: s * 1.5, displayHeight: s * 0.5, alpha: 0.9, duration: 500 / sp, ease: 'Quad.easeOut' });
  await wait(b.scene, 250 / sp);
  await tween(b.scene, { targets: b.t, alpha: 0, duration: 400 / sp });
};

const launch: VariantFn = async (ctx, b) => {
  const sp = ctx.speed;
  const s = b.h;
  flash(b, 60 / sp);
  b.scene.cameras.main.shake(160 / sp, b.mode === 'cine' ? 0.02 : 0.012);
  bloodBurst(b.scene, ctx.x, ctx.y - s * 0.45, b.mode === 'cine' ? 30 : 20, ctx.dir > 0 ? { min: -60, max: 30 } : { min: 150, max: 240 }, b.mode === 'cine' ? 1.6 : 1, sp);
  ctx.onPool?.();
  const dist = b.mode === 'cine' ? b.scene.scale.width * 0.9 : ctx.size * 2.1;
  const up = b.mode === 'cine' ? s * 0.6 : ctx.size * 0.8;
  const dur = 650 / sp;
  const proxy = { k: 0 };
  const startX = b.t.x;
  const startY = b.t.y;
  // Кровавый след
  let trail = 0;
  const trailTimer = b.scene.time.addEvent({
    delay: 70 / sp,
    loop: true,
    callback: () => {
      if (!alive(b) || trail++ > 7) return;
      const pt = b.mode === 'map' ? (b.t as Phaser.GameObjects.Container).getWorldTransformMatrix() : null;
      const wx = pt ? pt.tx : b.t.x;
      const wy = pt ? pt.ty - s * 0.45 : b.t.y - s * 0.45;
      bloodBurst(b.scene, wx, wy, 4, { min: 60, max: 120 }, 0.5, sp);
    },
  });
  await tween(b.scene, {
    targets: proxy,
    k: 1,
    duration: dur,
    ease: 'Linear',
    onUpdate: () => {
      if (!alive(b)) return;
      const k = proxy.k;
      b.t.x = startX + ctx.dir * dist * k;
      b.t.y = startY - up * 4 * k * (1 - k) + (b.mode === 'cine' ? 0 : ctx.size * 0.1 * k);
      b.t.angle = ctx.dir * 560 * k;
      if (b.mode === 'map' && k > 0.72) b.t.setAlpha(Math.max(0, 1 - (k - 0.72) / 0.28));
    },
  });
  trailTimer.remove(false);
  if (!alive(b)) return;
  const pt = b.mode === 'map' ? (b.t as Phaser.GameObjects.Container).getWorldTransformMatrix() : null;
  const ex = pt ? pt.tx : b.t.x;
  const ey = pt ? pt.ty - s * 0.3 : b.t.y - s * 0.3;
  hideBody(b);
  // Блик «✦» на выходе
  const star = b.scene.add.text(ex, ey, '✦', textStyle(b.mode === 'cine' ? 36 : ctx.size * 0.5, '#fff6d0', true, 3)).setOrigin(0.5).setDepth(27).setScale(0.3);
  b.scene.tweens.add({ targets: star, scale: 1.4, alpha: 0, duration: 420 / sp, ease: 'Quad.easeOut', onComplete: () => star.destroy() });
  if (b.mode === 'map') splatAt(b, ex, ctx.y + 2, s * 0.3, 11);
  await wait(b.scene, 200 / sp);
};

const dissolve: VariantFn = async (ctx, b) => {
  const sp = ctx.speed;
  const s = b.h;
  await tintRamp(b, 0xff5a5a, 220 / sp);
  if (!alive(b)) return;
  const cx = b.left + b.w / 2;
  const cy = b.top + b.h * 0.5;
  const fur = b.furColor;
  const light = Phaser.Display.Color.IntegerToColor(fur).lighten(25).color;
  for (let i = 0; i < 3; i++) {
    b.scene.time.delayedCall((i * 160) / sp, () => {
      if (!alive(b)) return;
      puff(b.scene, cx, cy, TEX.dot, [fur, light, 0xff6b6b], { count: 14, speed: [s * 0.15, s * 0.5], angle: { min: 240, max: 300 }, gravity: -s * 0.6, scale: [0.7, 0], life: [600, 1000], area: { w: b.w * 0.8, h: b.h * 0.9 } });
    });
  }
  // Тёмный силуэт остаётся ненадолго
  const sil = b.scene.add.image(cx, cy, TEX.disc).setTint(0x000000).setAlpha(0).setDepth(b.depth - 0.5);
  sil.setDisplaySize(b.w * 0.75, b.h * 0.9);
  b.temps.push(sil);
  b.scene.tweens.add({ targets: sil, alpha: 0.35, duration: 300 / sp, yoyo: true, hold: 500 / sp, onComplete: () => sil.destroy() });
  ctx.onPool?.();
  await tween(b.scene, { targets: b.t, alpha: 0, y: b.y0 - s * 0.15, duration: 700 / sp, ease: 'Quad.easeIn' });
  hideBody(b);
};

const drill: VariantFn = async (ctx, b) => {
  const sp = ctx.speed;
  const s = b.h;
  flash(b, 60 / sp);
  const dustTimer = b.scene.time.addEvent({ delay: 180 / sp, repeat: 3, callback: () => dustPuff(b.scene, ctx.x, ctx.y, s * 0.4, 6) });
  bloodBurst(b.scene, ctx.x, ctx.y - s * 0.4, b.mode === 'cine' ? 20 : 12, { min: 220, max: 320 }, 1, sp);
  await Promise.all([
    tween(b.scene, { targets: b.t, angle: 1800, duration: 820 / sp, ease: 'Quad.easeIn' }),
    scaleFromFeet(b, 0.45, 0.1, 820 / sp, 'Quad.easeIn'),
  ]);
  dustTimer.remove(false);
  if (!alive(b)) return;
  hideBody(b);
  const hole = b.scene.add.image(ctx.x, ctx.y, TEX.disc).setTint(0x15100e).setAlpha(0.85).setDepth(b.mode === 'cine' ? 5 : 1.3);
  hole.setDisplaySize(s * 0.5, s * 0.2);
  b.temps.push(hole);
  shockRing(b.scene, ctx.x, ctx.y, s * 0.6, 0xbdb7a8, 300 / sp);
  ctx.onPool?.();
  await wait(b.scene, 250 / sp);
};

const crumble: VariantFn = async (ctx, b, rng) => {
  const sp = ctx.speed;
  const s = b.h;
  const frozen = ctx.killerKind === 'howl';
  const stone = frozen ? 0xa8dcff : 0x9e9e9e;
  await tintRamp(b, stone, 220 / sp);
  if (!alive(b)) return;
  if (b.img?.scene) b.img.setTintFill(stone);
  // Трещины
  const g = b.scene.add.graphics().setDepth(b.depth + 0.5).setAlpha(0);
  g.lineStyle(Math.max(1.5, s * 0.012), frozen ? 0x3f7fb5 : 0x2b2b2b, 1);
  for (let i = 0; i < 3; i++) {
    let x = b.left + b.w * (0.3 + rng() * 0.4);
    let y = b.top + b.h * 0.1;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rng() - 0.5) * b.w * 0.25;
      y += b.h * 0.14;
      g.lineTo(x, y);
    }
    g.strokePath();
  }
  b.temps.push(g);
  await tween(b.scene, { targets: g, alpha: 1, duration: 260 / sp });
  if (!alive(b)) return;
  b.scene.cameras.main.shake(120 / sp, 0.01);
  await wait(b.scene, 140 / sp);
  if (!alive(b)) return;
  hideBody(b);
  g.destroy();
  // Осколки
  const groundY = ctx.y;
  const flights: Promise<void>[] = [];
  for (let i = 0; i < 10; i++) {
    const w = b.w * (0.12 + rng() * 0.1);
    const chunk = b.scene.add.image(b.left + b.w * (0.2 + rng() * 0.6), b.top + b.h * (0.15 + rng() * 0.7), TEX.square).setTint(stone).setDepth(b.depth);
    chunk.setDisplaySize(w, w * (0.7 + rng() * 0.6)).setAngle(rng() * 90);
    b.temps.push(chunk);
    const vx = (rng() - 0.5) * s * 0.9;
    const vy = -s * (0.2 + rng() * 0.6);
    flights.push(fly(b.scene, chunk, vx, vy, s * 3.5, groundY, (rng() - 0.5) * 400, sp, 1));
  }
  dustPuff(b.scene, ctx.x, ctx.y, s * 0.6, 12);
  puff(b.scene, ctx.x, ctx.y - s * 0.4, TEX.dot, frozen ? [0xdff3ff, 0xa8dcff, 0xffffff] : [0xbdbdbd, 0x8a8a8a, 0xe0e0e0], { count: 18, speed: [s * 0.3, s * 1], gravity: s * 2, scale: [0.6, 0], life: [400, 800] });
  ctx.onPool?.();
  await Promise.race([Promise.all(flights), wait(b.scene, 1200 / sp)]);
};

const electro: VariantFn = async (ctx, b, rng) => {
  const sp = ctx.speed;
  const s = b.h;
  const cx = b.left + b.w / 2;
  const topY = b.top;
  // Молнии
  const bolts = b.scene.add.graphics().setDepth(b.depth + 1);
  const drawBolts = (): void => {
    bolts.clear();
    bolts.lineStyle(Math.max(2, s * 0.014), 0xfff3b0, 1);
    for (let i = 0; i < 3; i++) {
      let x = cx + (rng() - 0.5) * b.w * 0.8;
      let y = topY - s * 0.35;
      bolts.beginPath();
      bolts.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rng() - 0.5) * b.w * 0.35;
        y += s * 0.16;
        bolts.lineTo(x, y);
      }
      bolts.strokePath();
    }
  };
  b.temps.push(bolts);
  for (let i = 0; i < 6; i++) {
    if (!alive(b)) return;
    const on = i % 2 === 0;
    if (b.img?.scene) {
      if (on) b.img.setTintFill(0xffffff);
      else b.img.clearTint();
    }
    if (on) {
      drawBolts();
      puff(b.scene, cx, topY + b.h * 0.5, TEX.star, [0xffd166, 0xfff3b0, 0xffffff], { count: 6, speed: [s * 0.4, s * 1.1], gravity: s * 1.5, scale: [0.9, 0], life: [250, 450], rotate: true, area: { w: b.w * 0.7, h: b.h * 0.7 } });
    } else bolts.clear();
    b.t.setX(b.x0 + (on ? 3 : -3));
    await wait(b.scene, 60 / sp);
  }
  bolts.destroy();
  if (!alive(b)) return;
  b.t.setX(b.x0);
  if (b.img?.scene) b.img.clearTint();
  // Дым и падение на спину
  puff(b.scene, cx, topY + b.h * 0.3, TEX.disc, [0x5a5a5a, 0x8a8a8a], { count: 5, speed: [s * 0.1, s * 0.3], angle: { min: 250, max: 290 }, gravity: -s * 0.4, scale: [0.5, 1.2], life: [600, 900] });
  bloodBurst(b.scene, ctx.x, ctx.y - s * 0.45, b.mode === 'cine' ? 18 : 10, null, 0.9, sp);
  ctx.onPool?.();
  await tween(b.scene, { targets: b.t, angle: ctx.dir > 0 ? -95 : 95, y: b.y0 + (b.mode === 'map' ? ctx.size * 0.15 : 0), alpha: 0.9, duration: 420 / sp, ease: 'Bounce.easeOut' });
};

const ragdoll: VariantFn = async (ctx, b) => {
  const sp = ctx.speed;
  const s = b.h;
  flash(b, 60 / sp);
  bloodBurst(b.scene, ctx.x, ctx.y - s * 0.45, b.mode === 'cine' ? 25 : 15, null, 1.2, sp);
  ctx.onPool?.();
  const hops: { dx: number; up: number; rot: number }[] = [
    { dx: 0.55, up: 0.9, rot: 180 },
    { dx: 0.35, up: 0.5, rot: 150 },
    { dx: 0.2, up: 0.25, rot: 120 },
  ];
  const unit = b.mode === 'cine' ? s : ctx.size;
  let x = b.t.x;
  let angle = b.t.angle;
  let seed = 0;
  for (const hop of hops) {
    if (!alive(b)) return;
    const nx = x + ctx.dir * unit * hop.dx;
    const na = angle + ctx.dir * hop.rot;
    const tUp = 170 / sp;
    const tDown = 150 / sp;
    await Promise.all([
      tween(b.scene, { targets: b.t, x: (x + nx) / 2, y: b.y0 - unit * hop.up, duration: tUp, ease: 'Quad.easeOut' }),
      tween(b.scene, { targets: b.t, angle: angle + ctx.dir * hop.rot * 0.5, duration: tUp, ease: 'Linear' }),
    ]);
    if (!alive(b)) return;
    await Promise.all([
      tween(b.scene, { targets: b.t, x: nx, y: b.y0, duration: tDown, ease: 'Quad.easeIn' }),
      tween(b.scene, { targets: b.t, angle: na, duration: tDown, ease: 'Linear' }),
    ]);
    if (!alive(b)) return;
    x = nx;
    angle = na;
    const pt = b.mode === 'map' ? (b.t as Phaser.GameObjects.Container).getWorldTransformMatrix() : null;
    const wx = pt ? pt.tx : b.t.x;
    splatAt(b, wx, ctx.y + 2, s * (0.3 - seed * 0.06), 5 + seed);
    bloodBurst(b.scene, wx, ctx.y, 8, { min: 220, max: 320 }, 0.7, sp);
    dustPuff(b.scene, wx, ctx.y, s * 0.35, 5);
    b.scene.cameras.main.shake(80 / sp, 0.006);
    seed++;
  }
  // Лечь набок
  const lying = ctx.dir > 0 ? 90 : -90;
  const turns = Math.round((angle - lying) / 360);
  await tween(b.scene, { targets: b.t, angle: lying + turns * 360, alpha: 0.9, duration: 160 / sp, ease: 'Quad.easeOut' });
};

const sink: VariantFn = async (ctx, b) => {
  const sp = ctx.speed;
  const s = b.h;
  flash(b, 60 / sp);
  ctx.onPool?.();
  const pool = b.scene.add.image(ctx.x, ctx.y + 2, TEX.pool).setTint(0xd9122b).setAlpha(0).setDepth(b.mode === 'cine' ? 6 : 1.4);
  pool.setDisplaySize(s * 0.2, s * 0.08);
  b.temps.push(pool);
  await tween(b.scene, { targets: pool, displayWidth: s * 1.6, displayHeight: s * 0.55, alpha: 0.92, duration: 320 / sp, ease: 'Quad.easeOut' });
  if (!alive(b)) return;
  // Пузыри
  puff(b.scene, ctx.x, ctx.y, TEX.ring, [0xff6b6b, 0xd9122b], { count: 6, speed: [s * 0.05, s * 0.2], angle: { min: 260, max: 280 }, gravity: -s * 0.3, scale: [0.15, 0.45], life: [500, 900] });
  const tailKey = ctx.parts?.tail;
  const tailImg = tailKey ? partImage(b, tailKey, 'tail') : null;
  await Promise.all([
    tween(b.scene, { targets: b.t, y: b.y0 + s * 0.9, alpha: 0.15, scaleX: (b.t.scaleX || 1) * 0.8, duration: 620 / sp, ease: 'Quad.easeIn' }),
    tailImg
      ? tween(b.scene, { targets: tailImg, y: ctx.y + s * 0.02, x: ctx.x + ctx.dir * s * 0.1, angle: -20, duration: 620 / sp, ease: 'Quad.easeIn' })
      : wait(b.scene, 620 / sp),
  ]);
  if (!alive(b)) return;
  hideBody(b);
  if (tailImg?.scene) {
    tailImg.setDepth(b.mode === 'cine' ? 7 : 1.6);
    await tween(b.scene, { targets: tailImg, angle: 20, duration: 160 / sp, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
  }
  await wait(b.scene, 120 / sp);
};

const VARIANTS: Record<DeathVariant, VariantFn> = { fall, gibs, explode, flatten, launch, dissolve, drill, crumble, electro, ragdoll, sink };

/* ---------- Входные точки ---------- */

async function playDeath(ctx: DeathCtx, mode: Mode): Promise<void> {
  if (!sceneAlive(ctx.scene)) return;
  const b = makeBody(ctx, mode);
  let variant = ctx.variant;
  if (variant === 'gibs' && !ctx.parts) variant = 'explode';
  const rng = makeRng(hash(`${ctx.unit.id}:${variant}:${ctx.unit.seed}`));
  try {
    await VARIANTS[variant](ctx, b, rng);
  } catch (e) {
    console.error('deathFx', variant, e);
  }
  if (mode === 'map' && sceneAlive(ctx.scene)) {
    // Карта: части и обломки растворяются, чтобы не захламлять поле.
    const temps = b.temps.filter((o) => (o as { scene?: Phaser.Scene }).scene);
    if (temps.length > 0) {
      ctx.scene.time.delayedCall(700 / ctx.speed, () => {
        if (!sceneAlive(ctx.scene)) return;
        ctx.scene.tweens.add({ targets: temps, alpha: 0, duration: 350 / ctx.speed, onComplete: () => temps.forEach((o) => o.destroy()) });
      });
    }
  }
}

/** Гибель в кинематике: спрайт-Image, крупные эффекты, части остаются лежать. */
export function playDeathCine(ctx: DeathCtx): Promise<void> {
  return playDeath(ctx, 'cine');
}

/** Гибель на карте: вид юнита, компактные эффекты, временные объекты растворяются. */
export function playDeathMap(ctx: DeathCtx): Promise<void> {
  return playDeath(ctx, 'map');
}
