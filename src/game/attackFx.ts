import type Phaser from 'phaser';
import type { BattleState, UnitInstance, WeaponKind } from '@core/types';
import { weaponDef } from '@content/weapons';
import { TEX } from './textures';
import { floatText, sceneAlive, wait } from './fx';

/**
 * Персональные анимации атак по типу оружия: замах/бросок атакующего, фирменный эффект на защищающемся,
 * «ощутимость» удара (хит-стоп, зум-удар, тряска). Только презентация, без игровой логики.
 */

export type FxTarget = Phaser.GameObjects.Image | Phaser.GameObjects.Container;

export interface AttackFxCtx {
  scene: Phaser.Scene;
  kind: WeaponKind;
  attacker: FxTarget;
  defender: FxTarget;
  /** Центры туловищ (у кинематика origin спрайта в лапах, у карты — центр клетки). */
  atkPos: { x: number; y: number };
  defPos: { x: number; y: number };
  /** Куда вернуть атакующего после удара. */
  home: { x: number; y: number };
  /** +1 — атакующий бьёт вправо, −1 — влево. */
  dir: 1 | -1;
  speed: number;
  special: boolean;
  effective: boolean;
  damage: number;
  /** Высота миниатюры на экране (кинематик) или размер клетки (карта). */
  size: number;
  /** Цвет оружия (hex number). */
  color: number;
  /** Сцена в режиме пропуска — декорации можно сократить. */
  skipped?: boolean;
}

export interface AttackFxResult {
  /** Момент контакта: вызывающий код наносит урон, числа, кровь. */
  impactAt: Promise<void>;
  /** Атакующий вернулся на место, декорации убраны. */
  done: Promise<void>;
}

/* ---------- Оружие ---------- */

export function weaponKindOfUnit(unit: UnitInstance): WeaponKind {
  return weaponDef(unit.skills.weapon).kind;
}

export function weaponKindOf(state: BattleState, unitId: string): WeaponKind {
  const unit = state.roster[unitId];
  return unit ? weaponKindOfUnit(unit) : 'claw';
}

/* ---------- Ощутимость удара ---------- */

export interface ImpactFeel {
  special: boolean;
  effective: boolean;
  damage: number;
  speed: number;
  skipped?: boolean;
  /** Хит-стоп и slow-mo (кинематик). На карте — только зум-удар и тряска. */
  heavy?: boolean;
}

/** Амплитуда тряски в пикселях: 4 обычный, 8 спецприём или эффективность, 10 — и то и другое. */
export function shakePx(special: boolean, effective: boolean): number {
  if (special && effective) return 10;
  if (special || effective) return 8;
  return 4;
}

/** Зум-удар камеры: 1 → amount → 1. Не блокирует. */
export function zoomPunch(scene: Phaser.Scene, amount: number, ms: number): void {
  if (!sceneAlive(scene)) return;
  const cam = scene.cameras.main;
  const base = cam.zoom;
  scene.tweens.add({
    targets: cam,
    zoom: base * amount,
    duration: ms / 2,
    yoyo: true,
    ease: 'Quad.easeOut',
    onComplete: () => {
      if (cam) cam.setZoom(base);
    },
  });
}

/**
 * Кратковременно замедляет твины сцены (хит-стоп / slow-mo) и возвращает прежнюю скорость.
 * Если за это время кто-то изменил timeScale (например, пропуск сцены), не трогаем.
 */
function freezeTweens(scene: Phaser.Scene, factor: number, realMs: number): void {
  if (!sceneAlive(scene)) return;
  const prev = scene.tweens.timeScale;
  if (prev >= 10) return; // режим пропуска
  scene.tweens.timeScale = factor;
  scene.time.delayedCall(realMs, () => {
    if (scene.tweens && scene.tweens.timeScale === factor) scene.tweens.timeScale = prev;
  });
}

/** Полный пакет ощущений удара в момент контакта. Не блокирует. */
export function impactFeel(scene: Phaser.Scene, f: ImpactFeel): void {
  if (!sceneAlive(scene)) return;
  const px = shakePx(f.special, f.effective) + Math.min(4, f.damage / 12);
  scene.cameras.main.shake(140 / f.speed, px / Math.max(1, scene.scale.width));
  zoomPunch(scene, f.special ? 1.07 : 1.05, 160 / f.speed);
  if (f.heavy && !f.skipped && f.damage > 0) {
    if (f.special) {
      // Хит-стоп, затем slow-mo
      freezeTweens(scene, 0.05, 60);
      scene.time.delayedCall(60, () => freezeTweens(scene, 0.6, 180));
    } else freezeTweens(scene, 0.05, 60);
  }
}

/* ---------- Вспомогательные ---------- */

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function tweenP(scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => {
    if (!sceneAlive(scene)) return resolve();
    scene.tweens.add({ ...cfg, onComplete: () => resolve() });
  });
}

function later(scene: Phaser.Scene, ms: number, fn: () => void): void {
  if (!sceneAlive(scene)) return;
  scene.time.delayedCall(Math.max(1, ms), () => {
    if (sceneAlive(scene)) fn();
  });
}

function safeDestroy(o: { destroy(): void; scene?: Phaser.Scene | undefined } | null | undefined): void {
  if (o && (o as { scene?: Phaser.Scene }).scene) o.destroy();
}

function isImage(t: FxTarget): t is Phaser.GameObjects.Image {
  return (t as Phaser.GameObjects.Image).setTint !== undefined && (t as Phaser.GameObjects.Image).texture !== undefined;
}

/** Временный tint на защищающемся (Image). Контейнеры (карта) — без тонирования. */
function tintFor(scene: Phaser.Scene, target: FxTarget, color: number, delayMs: number, ms: number): void {
  if (!isImage(target)) return;
  later(scene, delayMs, () => {
    if (!target.scene) return;
    target.setTint(color);
    later(scene, ms, () => {
      if (target.scene && target.tintTopLeft === color) target.clearTint();
    });
  });
}

/** Кратко сплющить цель по горизонтали (отдача). */
function squash(scene: Phaser.Scene, target: FxTarget, sx: number, ms: number): void {
  if (!target.scene) return;
  const bx = target.scaleX;
  const by = target.scaleY;
  scene.tweens.add({
    targets: target,
    scaleX: bx * sx,
    scaleY: by * (2 - sx) * 0.98,
    duration: ms / 2,
    yoyo: true,
    ease: 'Quad.easeOut',
    onComplete: () => {
      if (target.scene) target.setScale(bx, by);
    },
  });
}

/** Дрожь цели по X. */
function jitter(scene: Phaser.Scene, target: FxTarget, amp: number, ms: number): void {
  if (!target.scene) return;
  const bx = target.x;
  scene.tweens.add({
    targets: target,
    x: bx + amp,
    duration: ms / 8,
    yoyo: true,
    repeat: 3,
    ease: 'Sine.easeInOut',
    onComplete: () => {
      if (target.scene) target.setX(bx);
    },
  });
}

/** Толчок цели от удара и возврат. */
function knockback(scene: Phaser.Scene, target: FxTarget, dx: number, ms: number): void {
  if (!target.scene) return;
  const bx = target.x;
  scene.tweens.add({
    targets: target,
    x: bx + dx,
    duration: ms * 0.4,
    yoyo: true,
    hold: ms * 0.1,
    ease: 'Quad.easeOut',
    onComplete: () => {
      if (target.scene) target.setX(bx);
    },
  });
}

function burst(scene: Phaser.Scene, x: number, y: number, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, count: number, ttl: number, texture: string = TEX.dot): void {
  if (!sceneAlive(scene)) return;
  const e = scene.add.particles(x, y, texture, { ...cfg, emitting: false, quantity: count });
  e.setDepth(24);
  e.explode(count);
  later(scene, ttl, () => safeDestroy(e));
}

function impactStar(scene: Phaser.Scene, x: number, y: number, size: number, color: number, speed: number): void {
  if (!sceneAlive(scene)) return;
  const star = scene.add.image(x, y, TEX.star).setTint(color).setDepth(25).setAlpha(0.95);
  star.setDisplaySize(size * 0.2, size * 0.2);
  const s = star.scaleX;
  scene.tweens.add({ targets: star, scaleX: s * 4, scaleY: s * 4, angle: 45, alpha: 0, duration: 260 / speed, ease: 'Quad.easeOut', onComplete: () => safeDestroy(star) });
}

/* ---------- Фирменные эффекты на цели ---------- */

/** Три диагональных пореза: белая сердцевина с красной кромкой, появляются по очереди. */
function slashMarks(scene: Phaser.Scene, x: number, y: number, size: number, dir: number, speed: number, scale = 1): void {
  if (!sceneAlive(scene)) return;
  const len = size * 0.62 * scale;
  const gap = size * 0.16 * scale;
  const ang = (-38 * dir * Math.PI) / 180;
  for (let i = 0; i < 3; i++) {
    later(scene, (i * 40) / speed, () => {
      const g = scene.add.graphics().setDepth(26);
      const cx = x + (i - 1) * gap * 0.9;
      const cy = y + (i - 1) * gap * 0.35;
      const dx = Math.cos(ang) * len * 0.5;
      const dy = Math.sin(ang) * len * 0.5;
      g.lineStyle(size * 0.05 * scale, 0xd9122b, 0.75);
      g.lineBetween(cx - dx, cy - dy, cx + dx, cy + dy);
      g.lineStyle(size * 0.022 * scale, 0xffffff, 1);
      g.lineBetween(cx - dx, cy - dy, cx + dx, cy + dy);
      g.setScale(0.2, 1);
      scene.tweens.add({ targets: g, scaleX: 1, duration: 70 / speed, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: g, alpha: 0, duration: 300 / speed, delay: 180 / speed, onComplete: () => safeDestroy(g) });
      burst(scene, cx + dx * 0.3, cy + dy * 0.3, { speed: { min: size * 0.4, max: size * 1.2 }, angle: { min: dir > 0 ? -60 : 120, max: dir > 0 ? 60 : 240 }, scale: { start: 0.6 * scale, end: 0.1 }, lifespan: { min: 250, max: 500 }, gravityY: size * 2, tint: [0xd9122b, 0xff2e4a] }, 6, 700);
    });
  }
}

/** Челюсти смыкаются сверху и снизу, остаётся кольцо следов зубов. */
function jawClamp(scene: Phaser.Scene, x: number, y: number, size: number, speed: number, scale = 1): void {
  if (!sceneAlive(scene)) return;
  const h = size * 0.28 * scale;
  const w = size * 0.42 * scale;
  const top = scene.add.graphics().setDepth(26);
  const bot = scene.add.graphics().setDepth(26);
  const teeth = (g: Phaser.GameObjects.Graphics, up: boolean): void => {
    g.fillStyle(0xffffff, 1);
    g.lineStyle(1.5, 0x2e1f33, 1);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const tx = -w / 2 + (i + 0.5) * (w / n);
      const ty = up ? -h : h;
      g.fillTriangle(tx - w / (n * 2), ty, tx + w / (n * 2), ty, tx, 0);
      g.strokeTriangle(tx - w / (n * 2), ty, tx + w / (n * 2), ty, tx, 0);
    }
  };
  teeth(top, true);
  teeth(bot, false);
  top.setPosition(x, y - h * 1.6);
  bot.setPosition(x, y + h * 1.6);
  scene.tweens.add({ targets: top, y: y - h * 0.25, duration: 90 / speed, ease: 'Back.easeIn' });
  scene.tweens.add({ targets: bot, y: y + h * 0.25, duration: 90 / speed, ease: 'Back.easeIn' });
  later(scene, 90 / speed, () => {
    // След от укуса: кольцо маленьких треугольников
    const ring = scene.add.graphics().setDepth(25).setPosition(x, y);
    ring.fillStyle(0x9b0f20, 0.85);
    const r = size * 0.2 * scale;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r * 0.75;
      const t = size * 0.035 * scale;
      ring.fillTriangle(px - t, py - t, px + t, py - t, px, py + t * 1.4);
    }
    scene.tweens.add({ targets: ring, alpha: 0, duration: 450 / speed, delay: 150 / speed, onComplete: () => safeDestroy(ring) });
    scene.tweens.add({ targets: [top, bot], alpha: 0, duration: 140 / speed, delay: 60 / speed, onComplete: () => { safeDestroy(top); safeDestroy(bot); } });
  });
}

/** Дуга замаха палкой. */
function swingArc(scene: Phaser.Scene, x: number, y: number, radius: number, dir: number, speed: number): void {
  if (!sceneAlive(scene)) return;
  const g = scene.add.graphics().setDepth(26).setPosition(x, y);
  const start = dir > 0 ? -2.1 : Math.PI + 2.1;
  const end = dir > 0 ? -0.3 : Math.PI + 0.3;
  g.lineStyle(radius * 0.16, 0xffffff, 0.55);
  g.beginPath();
  g.arc(0, 0, radius, start, end, dir < 0);
  g.strokePath();
  g.lineStyle(radius * 0.06, 0xfff3b0, 0.9);
  g.beginPath();
  g.arc(0, 0, radius * 1.05, start, end, dir < 0);
  g.strokePath();
  scene.tweens.add({ targets: g, alpha: 0, scaleX: 1.15, scaleY: 1.15, duration: 220 / speed, ease: 'Quad.easeOut', onComplete: () => safeDestroy(g) });
}

/** Конус шипения: три расширяющихся красных клина + пламя. Возвращает промис прибытия. */
function hissCone(scene: Phaser.Scene, from: { x: number; y: number }, to: { x: number; y: number }, size: number, dir: number, speed: number, scale = 1): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve();
  const travel = 220 / speed;
  const d = dist(from, to);
  for (let i = 0; i < 3; i++) {
    const g = scene.add.graphics().setDepth(24).setPosition(from.x, from.y);
    const len = d * (0.35 + i * 0.3);
    const half = size * (0.08 + i * 0.07) * scale;
    g.fillStyle(i === 0 ? 0xff4d4d : i === 1 ? 0xe63946 : 0xb3001b, 0.55 - i * 0.12);
    g.fillTriangle(0, 0, dir * len, -half, dir * len, half);
    g.setScale(0.1, 1);
    scene.tweens.add({ targets: g, scaleX: 1, duration: travel * (0.6 + i * 0.2), ease: 'Cubic.easeOut' });
    scene.tweens.add({ targets: g, alpha: 0, duration: 180 / speed, delay: travel, onComplete: () => safeDestroy(g) });
  }
  burst(scene, from.x + dir * size * 0.1, from.y, { moveToX: to.x, moveToY: to.y - size * 0.1, scale: { start: 0.9 * scale, end: 0.2 }, alpha: { start: 1, end: 0.4 }, lifespan: travel, tint: [0xff6b35, 0xff9f1c, 0xe63946, 0xffd166] }, 12, travel + 300);
  return wait(scene, travel);
}

/** Угли поднимаются с цели после шипения. */
function embers(scene: Phaser.Scene, x: number, y: number, size: number): void {
  burst(scene, x, y + size * 0.1, { speed: { min: size * 0.3, max: size * 0.9 }, angle: { min: 240, max: 300 }, scale: { start: 0.6, end: 0 }, alpha: { start: 1, end: 0 }, lifespan: { min: 400, max: 800 }, gravityY: -size * 0.8, tint: [0xff6b35, 0xff9f1c, 0xffd166] }, 10, 1000);
}

/** Три синих кольца летят от головы атакующего к цели. */
function howlRings(scene: Phaser.Scene, from: { x: number; y: number }, to: { x: number; y: number }, size: number, speed: number, scale = 1): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve();
  const travel = 240 / speed;
  for (let i = 0; i < 3; i++) {
    later(scene, (i * 70) / speed, () => {
      const ring = scene.add.image(from.x, from.y - size * 0.1, TEX.ring).setTint(0x3a86ff).setDepth(24).setAlpha(0.9);
      ring.setDisplaySize(size * 0.25 * scale, size * 0.25 * scale);
      const s = ring.scaleX;
      scene.tweens.add({ targets: ring, x: to.x, y: to.y, scaleX: s * 5, scaleY: s * 5, alpha: 0.1, duration: travel, ease: 'Sine.easeIn', onComplete: () => safeDestroy(ring) });
    });
  }
  return wait(scene, travel + 60 / speed);
}

/** Осколки льда разлетаются от цели. */
function iceShards(scene: Phaser.Scene, x: number, y: number, size: number, speed: number, count = 6): void {
  if (!sceneAlive(scene)) return;
  for (let i = 0; i < count; i++) {
    const g = scene.add.graphics().setDepth(26).setPosition(x, y);
    const t = size * 0.07;
    g.fillStyle(0xbfe9ff, 0.95);
    g.lineStyle(1, 0x5fa8ff, 1);
    g.fillTriangle(-t * 0.5, t, t * 0.5, t, 0, -t * 1.6);
    g.strokeTriangle(-t * 0.5, t, t * 0.5, t, 0, -t * 1.6);
    const a = (i / count) * Math.PI * 2 + 0.3;
    const r = size * 0.55;
    scene.tweens.add({ targets: g, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r + size * 0.25, angle: 180 + i * 60, alpha: 0, duration: 420 / speed, ease: 'Quad.easeOut', onComplete: () => safeDestroy(g) });
  }
}

/** Зелёный вихрь вокруг цели + листья. */
function windSwirl(scene: Phaser.Scene, x: number, y: number, size: number, speed: number, ms: number): void {
  if (!sceneAlive(scene)) return;
  const c = scene.add.container(x, y).setDepth(26);
  for (let i = 0; i < 3; i++) {
    const g = scene.add.graphics();
    const r = size * (0.28 + i * 0.1);
    g.lineStyle(size * 0.035, i === 1 ? 0x80ed99 : 0x2ec4b6, 0.85 - i * 0.2);
    g.beginPath();
    g.arc(0, 0, r, (i * Math.PI * 2) / 3, (i * Math.PI * 2) / 3 + Math.PI * 0.9, false);
    g.strokePath();
    g.setScale(1, 0.55);
    c.add(g);
  }
  scene.tweens.add({ targets: c, angle: 540, duration: ms, ease: 'Cubic.easeOut' });
  scene.tweens.add({ targets: c, alpha: 0, duration: ms * 0.4, delay: ms * 0.6, onComplete: () => safeDestroy(c) });
  burst(scene, x, y, { speed: { min: size * 0.5, max: size * 1.3 }, angle: { min: 0, max: 360 }, scale: { start: 0.5, end: 0.1 }, alpha: { start: 1, end: 0 }, lifespan: { min: 350, max: 600 }, rotate: { min: 0, max: 360 }, gravityY: size * 0.5, tint: [0x57cc99, 0x2ec4b6, 0x80ed99, 0x1b998b] }, 12, 800, TEX.square);
}

/** Жёлудь по параболе со следом. Возвращает промис попадания. */
function acornShot(scene: Phaser.Scene, from: { x: number; y: number }, to: { x: number; y: number }, size: number, speed: number, scale = 1): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve();
  const travel = 260 / speed;
  const r = size * 0.07 * scale;
  const acorn = scene.add.container(from.x, from.y).setDepth(25);
  const g = scene.add.graphics();
  g.fillStyle(0xa8763f, 1);
  g.lineStyle(1.5, 0x5a3a24, 1);
  g.fillEllipse(0, r * 0.3, r * 1.6, r * 2);
  g.strokeEllipse(0, r * 0.3, r * 1.6, r * 2);
  g.fillStyle(0x6b4a2c, 1);
  g.fillEllipse(0, -r * 0.6, r * 1.9, r * 1.1);
  g.fillRect(-r * 0.15, -r * 1.5, r * 0.3, r * 0.7);
  acorn.add(g);
  const peak = Math.min(size * 0.6, dist(from, to) * 0.35);
  const prog = { t: 0 };
  let trailTick = 0;
  scene.tweens.add({ targets: acorn, angle: 720, duration: travel, ease: 'Linear' });
  const done = tweenP(scene, {
    targets: prog,
    t: 1,
    duration: travel,
    ease: 'Linear',
    onUpdate: () => {
      const t = prog.t;
      acorn.setPosition(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * peak);
      if (++trailTick % 3 === 0) {
        const d = scene.add.image(acorn.x, acorn.y, TEX.dot).setTint(0xd9b382).setAlpha(0.6).setDepth(24).setScale(r * 0.09);
        scene.tweens.add({ targets: d, alpha: 0, scale: 0, duration: 200 / speed, onComplete: () => safeDestroy(d) });
      }
    },
  });
  return done.then(() => safeDestroy(acorn));
}

/** Веер репейников летит в цель и прилипает. Возвращает промис попадания первого. */
function burrFan(scene: Phaser.Scene, from: { x: number; y: number }, to: { x: number; y: number }, size: number, speed: number, count: number, stick: number, scale = 1): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve();
  const travel = 240 / speed;
  const r = size * 0.05 * scale;
  for (let i = 0; i < count; i++) {
    later(scene, (i * 40) / speed, () => {
      const g = scene.add.graphics().setDepth(25).setPosition(from.x, from.y);
      g.fillStyle(0x7a8a3a, 1);
      g.lineStyle(1.2, 0x4f5c22, 1);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.lineBetween(0, 0, Math.cos(a) * r * 1.9, Math.sin(a) * r * 1.9);
      }
      g.fillCircle(0, 0, r);
      g.strokeCircle(0, 0, r);
      const ox = (i - (count - 1) / 2) * size * 0.14 * scale;
      const oy = ((i % 2) - 0.5) * size * 0.16 * scale;
      scene.tweens.add({ targets: g, x: to.x + ox, y: to.y + oy, angle: 540, duration: travel, ease: 'Quad.easeIn', onComplete: () => {
        scene.tweens.add({ targets: g, alpha: 0, duration: 150 / speed, delay: stick / speed, onComplete: () => safeDestroy(g) });
      } });
    });
  }
  return wait(scene, travel + 10);
}

/** Бинт разматывается волнистой линией от атакующего к цели. Возвращает промис попадания. */
function bandageThrow(scene: Phaser.Scene, from: { x: number; y: number }, to: { x: number; y: number }, size: number, speed: number, scale = 1): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve();
  const travel = 260 / speed;
  const line = scene.add.graphics().setDepth(24);
  const roll = scene.add.graphics().setDepth(25).setPosition(from.x, from.y);
  const rr = size * 0.06 * scale;
  roll.fillStyle(0xffffff, 1);
  roll.lineStyle(1.2, 0xc9c9d1, 1);
  roll.fillRoundedRect(-rr, -rr * 0.8, rr * 2, rr * 1.6, rr * 0.4);
  roll.strokeRoundedRect(-rr, -rr * 0.8, rr * 2, rr * 1.6, rr * 0.4);
  const prog = { t: 0 };
  scene.tweens.add({ targets: roll, angle: 540, duration: travel });
  const done = tweenP(scene, {
    targets: prog,
    t: 1,
    duration: travel,
    ease: 'Sine.easeOut',
    onUpdate: () => {
      const t = prog.t;
      const cx = from.x + (to.x - from.x) * t;
      const cy = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * size * 0.15;
      roll.setPosition(cx, cy);
      line.clear();
      line.lineStyle(size * 0.03 * scale, 0xffffff, 0.95);
      line.beginPath();
      line.moveTo(from.x, from.y);
      const segs = 14;
      for (let i = 1; i <= segs; i++) {
        const u = i / segs;
        const px = from.x + (cx - from.x) * u;
        const py = from.y + (cy - from.y) * u + Math.sin(u * Math.PI * 4 + t * 10) * size * 0.04 * (1 - u);
        line.lineTo(px, py);
      }
      line.strokePath();
    },
  });
  return done.then(() => {
    scene.tweens.add({ targets: [line, roll], alpha: 0, duration: 220 / speed, delay: 120 / speed, onComplete: () => { safeDestroy(line); safeDestroy(roll); } });
  });
}

/** Розовая ударная волна + ноты/сердечки к цели. Возвращает промис попадания. */
function purrWave(scene: Phaser.Scene, from: { x: number; y: number }, to: { x: number; y: number }, size: number, speed: number, scale = 1): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve();
  const travel = 240 / speed;
  const ring = scene.add.image(from.x, from.y, TEX.ring).setTint(0xff6f9c).setDepth(24).setAlpha(0.85);
  ring.setDisplaySize(size * 0.3 * scale, size * 0.3 * scale);
  const s = ring.scaleX;
  scene.tweens.add({ targets: ring, scaleX: s * 4, scaleY: s * 4, alpha: 0, duration: travel, ease: 'Quad.easeOut', onComplete: () => safeDestroy(ring) });
  const glyphs = ['♪', '♥', '♫'];
  glyphs.forEach((gl, i) => {
    later(scene, (i * 50) / speed, () => {
      const t = scene.add.text(from.x, from.y - size * 0.1, gl, { fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(size * 0.16 * scale)}px`, color: i === 1 ? '#ff6f9c' : '#f7a8c4', fontStyle: 'bold', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(26);
      scene.tweens.add({ targets: t, x: to.x, y: to.y - size * (0.25 - i * 0.12), duration: travel, ease: 'Sine.easeInOut', onComplete: () => {
        scene.tweens.add({ targets: t, alpha: 0, y: t.y - size * 0.2, duration: 200 / speed, onComplete: () => safeDestroy(t) });
      } });
    });
  });
  return wait(scene, travel);
}

/* ---------- Движение атакующего (кинематик) ---------- */

interface Motion {
  /** Промис момента контакта. */
  impact: Promise<void>;
  /** Промис возврата на место. */
  settle: Promise<void>;
}

/** Выпад к цели и возврат. frac — доля расстояния до цели. */
function lungeMotion(ctx: AttackFxCtx, frac: number, inMs: number, outMs: number, hold = 0, extra?: () => void): Motion {
  const { scene, attacker, home, dir, speed, atkPos, defPos } = ctx;
  const reach = Math.max(ctx.size * 0.3, (Math.abs(defPos.x - atkPos.x) - ctx.size * 0.35) * frac);
  const target = home.x + dir * reach;
  let resolveImpact: () => void = () => undefined;
  const impact = new Promise<void>((r) => (resolveImpact = r));
  const settle = (async () => {
    await tweenP(scene, { targets: attacker, x: target, duration: inMs / speed, ease: 'Quad.easeIn' });
    extra?.();
    resolveImpact();
    if (hold > 0) await wait(scene, hold / speed);
    await tweenP(scene, { targets: attacker, x: home.x, duration: outMs / speed, ease: 'Quad.easeOut' });
    if (attacker.scene) attacker.setX(home.x);
  })();
  return { impact, settle };
}

/** Небольшой наклон/замах на месте, затем проекция (projectile) и возврат. */
function castMotion(ctx: AttackFxCtx, leanMs: number, project: () => Promise<void>, lean = 10): Motion {
  const { scene, attacker, home, dir, speed } = ctx;
  let resolveImpact: () => void = () => undefined;
  const impact = new Promise<void>((r) => (resolveImpact = r));
  const bx = attacker.scaleX;
  const by = attacker.scaleY;
  const settle = (async () => {
    await tweenP(scene, { targets: attacker, x: home.x - dir * lean, scaleX: bx * 0.94, scaleY: by * 1.04, duration: leanMs / speed, ease: 'Quad.easeOut' });
    scene.tweens.add({ targets: attacker, x: home.x + dir * lean * 1.4, scaleX: bx * 1.06, scaleY: by * 0.97, duration: (leanMs * 0.6) / speed, ease: 'Back.easeOut' });
    await project();
    resolveImpact();
    await tweenP(scene, { targets: attacker, x: home.x, scaleX: bx, scaleY: by, duration: 180 / speed, ease: 'Quad.easeOut' });
    if (attacker.scene) {
      attacker.setX(home.x);
      attacker.setScale(bx, by);
    }
  })();
  return { impact, settle };
}

/* ---------- Кинематик: хореография по оружию ---------- */

export function playAttackFx(ctx: AttackFxCtx): AttackFxResult {
  const { scene, kind, defender, defPos, atkPos, dir, speed, size, color } = ctx;
  if (!sceneAlive(scene)) return { impactAt: Promise.resolve(), done: Promise.resolve() };
  const skipped = ctx.skipped || scene.tweens.timeScale >= 10;
  const deco = !skipped;
  let motion: Motion;

  switch (kind) {
    case 'claw': {
      motion = lungeMotion(ctx, 0.6, 120, 180, 40, () => {
        if (!deco) return;
        slashMarks(scene, defPos.x, defPos.y, size, dir, speed);
        squash(scene, defender, 0.85, 180 / speed);
      });
      break;
    }
    case 'fang': {
      motion = lungeMotion(ctx, 0.7, 130, 200, 90, () => {
        if (!deco) return;
        jawClamp(scene, defPos.x, defPos.y, size, speed);
        later(scene, 90 / speed, () => squash(scene, defender, 0.8, 200 / speed));
      });
      break;
    }
    case 'stick': {
      const { attacker, home } = ctx;
      let resolveImpact: () => void = () => undefined;
      const impact = new Promise<void>((r) => (resolveImpact = r));
      const settle = (async () => {
        // Замах назад
        await tweenP(scene, { targets: attacker, angle: -28 * dir, x: home.x - dir * size * 0.06, duration: 160 / speed, ease: 'Quad.easeOut' });
        // Удар: доворот и выпад
        const reach = Math.max(size * 0.3, (Math.abs(defPos.x - atkPos.x) - size * 0.35) * 0.4);
        await tweenP(scene, { targets: attacker, angle: 40 * dir, x: home.x + dir * reach, duration: 90 / speed, ease: 'Cubic.easeIn' });
        if (deco) {
          swingArc(scene, attacker.x + dir * size * 0.1, atkPos.y, size * 0.55, dir, speed);
          impactStar(scene, defPos.x - dir * size * 0.1, defPos.y - size * 0.05, size, 0xffd166, speed);
          floatText(scene, defPos.x, defPos.y - size * 0.55, 'ХРЯСЬ', '#ffd166', speed, { size: size * 0.16, rise: size * 0.3, stroke: 5, shake: true });
          knockback(scene, defender, dir * size * 0.25, 260 / speed);
        }
        resolveImpact();
        await wait(scene, 70 / speed);
        await tweenP(scene, { targets: attacker, angle: 0, x: home.x, duration: 220 / speed, ease: 'Quad.easeOut' });
        if (attacker.scene) {
          attacker.setAngle(0);
          attacker.setX(home.x);
        }
      })();
      motion = { impact, settle };
      break;
    }
    case 'hiss': {
      motion = castMotion(ctx, 120, async () => {
        const mouth = { x: atkPos.x + dir * size * 0.18, y: atkPos.y - size * 0.05 };
        if (!deco) return wait(scene, 120 / speed);
        await hissCone(scene, mouth, defPos, size, dir, speed);
        tintFor(scene, defender, 0xff6b6b, 80 / speed, 300 / speed);
        embers(scene, defPos.x, defPos.y, size);
      });
      break;
    }
    case 'howl': {
      motion = castMotion(ctx, 140, async () => {
        const head = { x: atkPos.x + dir * size * 0.1, y: atkPos.y - size * 0.15 };
        if (!deco) return wait(scene, 120 / speed);
        await howlRings(scene, head, defPos, size, speed);
        jitter(scene, defender, 4, 240 / speed);
        tintFor(scene, defender, 0xbfe9ff, 80 / speed, 320 / speed);
        iceShards(scene, defPos.x, defPos.y, size, speed);
      }, 14);
      break;
    }
    case 'growl': {
      const { attacker } = ctx;
      motion = castMotion(ctx, 110, async () => {
        if (!deco) return wait(scene, 120 / speed);
        // Рык: присесть и выпрямиться
        const by = attacker.scaleY;
        scene.tweens.add({ targets: attacker, scaleY: by * 1.08, duration: 90 / speed, yoyo: true, onComplete: () => { if (attacker.scene) attacker.setScale(attacker.scaleX, by); } });
        windSwirl(scene, defPos.x, defPos.y, size, speed, 300 / speed);
        await wait(scene, 200 / speed);
        knockback(scene, defender, dir * size * 0.2, 280 / speed);
      });
      break;
    }
    case 'slingshot': {
      motion = castMotion(ctx, 140, async () => {
        const hand = { x: atkPos.x + dir * size * 0.2, y: atkPos.y + size * 0.05 };
        if (!deco) return wait(scene, 140 / speed);
        await acornShot(scene, hand, defPos, size, speed);
        impactStar(scene, defPos.x, defPos.y, size, 0xffd166, speed);
        floatText(scene, defPos.x + dir * size * 0.15, defPos.y - size * 0.5, 'БАМ', '#ffe08a', speed, { size: size * 0.13, rise: size * 0.25, stroke: 4 });
      }, 12);
      break;
    }
    case 'burr': {
      motion = castMotion(ctx, 120, async () => {
        const hand = { x: atkPos.x + dir * size * 0.2, y: atkPos.y };
        if (!deco) return wait(scene, 140 / speed);
        await burrFan(scene, hand, defPos, size, speed, 4, 450);
        jitter(scene, defender, 3, 300 / speed);
        tintFor(scene, defender, 0xc77dff, 80 / speed, 250 / speed);
      });
      break;
    }
    case 'bandage': {
      motion = castMotion(ctx, 120, async () => {
        const hand = { x: atkPos.x + dir * size * 0.2, y: atkPos.y - size * 0.05 };
        if (!deco) return wait(scene, 140 / speed);
        await bandageThrow(scene, hand, defPos, size, speed);
        floatText(scene, defPos.x, defPos.y - size * 0.45, 'шлёп', '#e9ecef', speed, { size: size * 0.1, rise: size * 0.2, stroke: 3 });
        squash(scene, defender, 0.93, 160 / speed);
      }, 8);
      break;
    }
    case 'purr':
    default: {
      motion = castMotion(ctx, 110, async () => {
        const mouth = { x: atkPos.x + dir * size * 0.15, y: atkPos.y };
        if (!deco) return wait(scene, 120 / speed);
        await purrWave(scene, mouth, defPos, size, speed);
        tintFor(scene, defender, 0xffb3c6, 80 / speed, 220 / speed);
        squash(scene, defender, 0.92, 160 / speed);
      }, 6);
      break;
    }
  }
  void color;
  return { impactAt: motion.impact, done: motion.settle };
}

/* ---------- Карта: облегчённые версии у клетки цели ---------- */

export function playQuickAttackFx(ctx: AttackFxCtx): AttackFxResult {
  const { scene, kind, defPos, atkPos, dir, speed, size, defender } = ctx;
  if (!sceneAlive(scene)) return { impactAt: Promise.resolve(), done: Promise.resolve() };
  const s = 0.9;
  let impactAt: Promise<void>;
  switch (kind) {
    case 'claw':
      slashMarks(scene, defPos.x, defPos.y, size, dir, speed, s);
      impactAt = Promise.resolve();
      break;
    case 'fang':
      jawClamp(scene, defPos.x, defPos.y, size, speed, s);
      impactAt = Promise.resolve();
      break;
    case 'stick':
      swingArc(scene, atkPos.x + dir * size * 0.2, atkPos.y, size * 0.5, dir, speed);
      impactStar(scene, defPos.x, defPos.y, size, 0xffd166, speed);
      knockback(scene, defender, dir * size * 0.14, 200 / speed);
      impactAt = Promise.resolve();
      break;
    case 'hiss':
      impactAt = hissCone(scene, { x: atkPos.x + dir * size * 0.25, y: atkPos.y }, defPos, size, dir, speed, 0.8).then(() => embers(scene, defPos.x, defPos.y, size * 0.8));
      break;
    case 'howl':
      impactAt = howlRings(scene, { x: atkPos.x + dir * size * 0.2, y: atkPos.y - size * 0.1 }, defPos, size, speed, 0.8).then(() => iceShards(scene, defPos.x, defPos.y, size * 0.8, speed, 4));
      break;
    case 'growl':
      windSwirl(scene, defPos.x, defPos.y, size * 0.9, speed, 240 / speed);
      impactAt = wait(scene, 120 / speed);
      break;
    case 'slingshot':
      impactAt = acornShot(scene, { x: atkPos.x + dir * size * 0.25, y: atkPos.y }, defPos, size, speed, 0.9).then(() => impactStar(scene, defPos.x, defPos.y, size, 0xffd166, speed));
      break;
    case 'burr':
      impactAt = burrFan(scene, { x: atkPos.x + dir * size * 0.25, y: atkPos.y }, defPos, size, speed, 2, 300, 0.8);
      break;
    case 'bandage':
      impactAt = bandageThrow(scene, { x: atkPos.x + dir * size * 0.25, y: atkPos.y }, defPos, size, speed, 0.8);
      break;
    case 'purr':
    default:
      impactAt = purrWave(scene, { x: atkPos.x + dir * size * 0.2, y: atkPos.y }, defPos, size, speed, 0.8);
      break;
  }
  const done = impactAt.then(() => {
    zoomPunch(scene, 1.04, 140 / speed);
  });
  return { impactAt, done };
}
