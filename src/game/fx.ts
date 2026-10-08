import Phaser from 'phaser';
import { TEX } from './textures';
import { BLOOD_COLORS, FONT, textStyle } from './style';

/** Сцена пригодна для твинов/таймеров: создаётся или работает. */
export function sceneAlive(scene: Phaser.Scene): boolean {
  if (!scene.sys) return false;
  const status = scene.sys.settings.status;
  return scene.sys.isActive() || status === Phaser.Scenes.CREATING || status === Phaser.Scenes.START || status === Phaser.Scenes.INIT;
}

export function wait(scene: Phaser.Scene, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || !sceneAlive(scene)) return resolve();
    scene.time.delayedCall(Math.max(1, Math.round(ms)), () => resolve());
  });
}

export function tween(scene: Phaser.Scene, config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => {
    if (!sceneAlive(scene)) return resolve();
    scene.tweens.add({ ...config, onComplete: () => resolve() });
  });
}

export interface FloatTextOptions {
  size?: number;
  rise?: number;
  duration?: number;
  stroke?: number;
  shake?: boolean;
}

/** Всплывающий текст (урон, лечение, статусы). Не блокирует. */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, speed: number, opts: FloatTextOptions = {}): void {
  if (!sceneAlive(scene)) return;
  const t = scene.add.text(x, y, text, textStyle(opts.size ?? 18, color, true, opts.stroke ?? 4)).setOrigin(0.5).setDepth(25);
  const dur = (opts.duration ?? 700) / speed;
  t.setScale(0.6);
  scene.tweens.add({ targets: t, scale: 1, duration: 120 / speed, ease: 'Back.easeOut' });
  if (opts.shake) scene.tweens.add({ targets: t, x: x + 3, duration: 40 / speed, yoyo: true, repeat: 3 });
  scene.tweens.add({
    targets: t,
    y: y - (opts.rise ?? 28),
    alpha: 0,
    duration: dur,
    delay: 180 / speed,
    ease: 'Quad.easeOut',
    onComplete: () => t.destroy(),
  });
}

/** Брызги крови. angle — направление разлёта в градусах (Phaser: 0 вправо, 90 вниз). */
export function bloodBurst(scene: Phaser.Scene, x: number, y: number, count: number, angle: { min: number; max: number } | null, scale = 1, speedMul = 1): void {
  if (!sceneAlive(scene)) return;
  const emitter = scene.add.particles(x, y, TEX.dot, {
    speed: { min: 80 * scale, max: 240 * scale },
    angle: angle ?? { min: 0, max: 360 },
    scale: { start: 0.9 * scale, end: 0.1 },
    alpha: { start: 1, end: 0.6 },
    lifespan: { min: 300, max: 650 },
    gravityY: 500,
    tint: BLOOD_COLORS,
    emitting: false,
    quantity: count,
  });
  emitter.setDepth(24);
  emitter.explode(count);
  scene.time.delayedCall(800 / speedMul + 100, () => emitter.destroy());
}

/** Облачко пыли при приземлении (шлепок на клетку). Не блокирует. */
export function dustPuff(scene: Phaser.Scene, x: number, y: number, size: number, count = 8): void {
  if (!sceneAlive(scene)) return;
  const emitter = scene.add.particles(x, y, TEX.dot, {
    speed: { min: size * 0.6, max: size * 1.8 },
    angle: { min: 200, max: 340 },
    scale: { start: 0.55, end: 0 },
    alpha: { start: 0.85, end: 0 },
    lifespan: { min: 280, max: 480 },
    gravityY: size * 4,
    tint: [0xbdb7a8, 0xd9d2c3, 0x9e978a, 0xe8e2d4],
    emitting: false,
    quantity: count,
  });
  emitter.setDepth(24);
  emitter.explode(count);
  scene.time.delayedCall(700, () => emitter.destroy());
}

/** Кровавый декаль на земле. */
export function bloodDecal(scene: Phaser.Scene, x: number, y: number, size: number, kind: 'splat' | 'pool', seed = 0): Phaser.GameObjects.Image {
  const key = kind === 'pool' ? TEX.pool : TEX.splat;
  const img = scene.add.image(x, y, key).setTint(BLOOD_COLORS[seed % BLOOD_COLORS.length] ?? 0xd9122b);
  const s = kind === 'pool' ? size * 0.95 : size * 0.5;
  img.setDisplaySize(s, kind === 'pool' ? s * 0.75 : s);
  img.setRotation(((seed * 37) % 360) * (Math.PI / 180));
  img.setAlpha(kind === 'pool' ? 0.85 : 0.7);
  img.setDepth(1);
  return img;
}

/** Милый призрак улетает вверх. */
export function ghostRise(scene: Phaser.Scene, x: number, y: number, size: number, speed: number): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve();
  const ghost = scene.add.text(x, y, '👻', textStyle(size * 0.6, '#fff', false, 0)).setOrigin(0.5).setDepth(26).setAlpha(0.95);
  const halo = scene.add.text(x, y - size * 0.4, '✨', textStyle(size * 0.3, '#fff', false, 0)).setOrigin(0.5).setDepth(26);
  scene.tweens.add({ targets: halo, y: y - size * 1.4, alpha: 0, duration: 600 / speed });
  return tween(scene, { targets: ghost, y: y - size * 1.2, alpha: 0, duration: 600 / speed, ease: 'Sine.easeOut' }).then(() => {
    ghost.destroy();
    halo.destroy();
  });
}

export interface BannerOptions {
  /** Диагональный светлый «слэш», пролетающий за текстом. */
  slash?: boolean;
  /** Брызги крови вдоль плашки (фаза врага). */
  blood?: boolean;
}

/** Полноэкранная плашка «ВАША ФАЗА» и т. п. */
export async function banner(scene: Phaser.Scene, text: string, color: number, speed: number, hold = 450, opts: BannerOptions = {}): Promise<void> {
  if (!sceneAlive(scene)) return;
  const w = scene.scale.width;
  const h = scene.scale.height;
  const bandH = Math.min(72, h * 0.12);
  const skew = bandH * 0.45;
  const cy = h / 2;
  // Плашка в духе Persona: чернильный параллелограмм с цветной кромкой и белой тонкой полосой.
  const band = scene.add.graphics().setDepth(30);
  const bw = w + skew * 2;
  band.fillStyle(0x0d0b10, 0.96);
  band.fillPoints([
    { x: skew, y: -bandH / 2 },
    { x: bw, y: -bandH / 2 },
    { x: bw - skew, y: bandH / 2 },
    { x: 0, y: bandH / 2 },
  ], true);
  band.fillStyle(color, 1);
  band.fillPoints([
    { x: skew, y: bandH / 2 - 6 },
    { x: bw - 6, y: bandH / 2 - 6 },
    { x: bw - skew, y: bandH / 2 },
    { x: 0, y: bandH / 2 },
  ], true);
  band.fillStyle(0xffffff, 0.9);
  band.fillPoints([
    { x: skew + 2, y: -bandH / 2 },
    { x: bw, y: -bandH / 2 },
    { x: bw - 2, y: -bandH / 2 + 3 },
    { x: skew + 3, y: -bandH / 2 + 3 },
  ], true);
  band.setPosition(-bw - w / 2, cy);
  const upper = text.toUpperCase();
  const fontSize = Math.round(bandH * 0.4);
  const shadow = scene.add
    .text(-w / 2 + 3, cy + 3, upper, { fontFamily: FONT, fontSize: `${fontSize}px`, color: Phaser.Display.Color.IntegerToColor(color).rgba, fontStyle: 'bold italic' })
    .setOrigin(0.5)
    .setDepth(31);
  const label = scene.add
    .text(-w / 2, cy, upper, { fontFamily: FONT, fontSize: `${fontSize}px`, color: '#ffffff', fontStyle: 'bold italic' })
    .setOrigin(0.5)
    .setDepth(31);
  let slash: Phaser.GameObjects.Rectangle | null = null;
  if (opts.slash) {
    slash = scene.add.rectangle(-w, cy, w * 0.3, bandH * 2.8, 0xffffff, 0.18).setDepth(29).setAngle(-18);
    scene.tweens.add({ targets: slash, x: w * 2, duration: (220 + hold * 0.5) / speed, ease: 'Cubic.easeOut' });
  }
  await Promise.all([
    tween(scene, { targets: band, x: -skew, duration: 200 / speed, ease: 'Cubic.easeOut' }),
    tween(scene, { targets: [label, shadow], x: w / 2, duration: 200 / speed, ease: 'Cubic.easeOut' }),
  ]);
  if (sceneAlive(scene)) shadow.setX(w / 2 + 3);
  if (opts.blood) {
    for (let i = 0; i < 4; i++) {
      bloodBurst(scene, w * (0.15 + i * 0.23), cy + bandH * 0.45, 8, { min: 40, max: 140 }, 0.6, speed);
    }
  }
  await wait(scene, hold / speed);
  await Promise.all([
    tween(scene, { targets: band, x: w * 1.5, duration: 200 / speed, ease: 'Cubic.easeIn' }),
    tween(scene, { targets: [label, shadow], x: w * 1.6, duration: 200 / speed, ease: 'Cubic.easeIn' }),
  ]);
  band.destroy();
  label.destroy();
  shadow.destroy();
  slash?.destroy();
}

export async function stamp(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size: number, speed: number, hold = 500): Promise<void> {
  if (!sceneAlive(scene)) return;
  const style = { ...textStyle(size, color, true, 6), fontStyle: 'bold italic' };
  const back = scene.add.text(x + 3, y + 3, text, { ...style, color: '#e63946', stroke: '#e63946', strokeThickness: 2 }).setOrigin(0.5).setDepth(31).setScale(2.2).setAlpha(0).setAngle(-6);
  const t = scene.add.text(x, y, text, style).setOrigin(0.5).setDepth(32).setScale(2.2).setAlpha(0).setAngle(-6);
  await tween(scene, { targets: [back, t], scale: 1, alpha: 1, duration: 160 / speed, ease: 'Back.easeIn' });
  scene.cameras.main.shake(120 / speed, 0.01);
  await wait(scene, hold / speed);
  await tween(scene, { targets: [back, t], alpha: 0, duration: 200 / speed });
  back.destroy();
  t.destroy();
}

/* ---------- Дополнительные эффекты (полировка поля) ---------- */

/** Зелёные искры лечения + два поднимающихся сердечка. Не блокирует. */
export function healSparkles(scene: Phaser.Scene, x: number, y: number, size: number, speed: number): void {
  if (!sceneAlive(scene)) return;
  const emitter = scene.add.particles(x, y + size * 0.1, TEX.star, {
    speed: { min: size * 0.4, max: size * 1.1 },
    angle: { min: 220, max: 320 },
    scale: { start: 0.9, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: 400, max: 700 },
    gravityY: -size * 0.6,
    rotate: { min: 0, max: 180 },
    tint: [0x80ed99, 0xb7f7c6, 0x57cc99, 0xffffff],
    emitting: false,
    quantity: 10,
  });
  emitter.setDepth(24);
  emitter.explode(10);
  scene.time.delayedCall(900 / speed + 100, () => emitter.destroy());
  floatText(scene, x - size * 0.22, y - size * 0.1, '♥', '#ff6f9c', speed, { size: size * 0.3, rise: size * 0.7, duration: 700, stroke: 2 });
  scene.time.delayedCall(140 / speed, () => floatText(scene, x + size * 0.22, y - size * 0.25, '♥', '#80ed99', speed, { size: size * 0.24, rise: size * 0.6, duration: 650, stroke: 2 }));
}

/** Кольцо статуса: бафф — расширяется зелёным, дебафф — сжимается фиолетовым. Не блокирует. */
export function statusRing(scene: Phaser.Scene, x: number, y: number, size: number, kind: 'buff' | 'debuff', speed: number): void {
  if (!sceneAlive(scene)) return;
  const ring = scene.add.image(x, y, TEX.ring).setDepth(23);
  const color = kind === 'buff' ? 0x80ed99 : 0xc77dff;
  ring.setTint(color).setDisplaySize(size, size);
  if (kind === 'buff') {
    ring.setScale(ring.scaleX * 0.3, ring.scaleY * 0.3).setAlpha(0.9);
    scene.tweens.add({ targets: ring, scaleX: ring.scaleX / 0.3 * 1.1, scaleY: ring.scaleY / 0.3 * 1.1, alpha: 0, duration: 350 / speed, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
  } else {
    const sx = ring.scaleX;
    const sy = ring.scaleY;
    ring.setScale(sx * 1.2, sy * 1.2).setAlpha(0.9);
    scene.tweens.add({ targets: ring, scaleX: sx * 0.4, scaleY: sy * 0.4, alpha: 0, duration: 350 / speed, ease: 'Quad.easeIn', onComplete: () => ring.destroy() });
  }
}

/** Обломки стены (коричневые щепки/крошка). Не блокирует. */
export function debrisBurst(scene: Phaser.Scene, x: number, y: number, size: number, count: number, speed: number): void {
  if (!sceneAlive(scene)) return;
  const emitter = scene.add.particles(x, y, TEX.square, {
    speed: { min: size * 0.8, max: size * 2.4 },
    angle: { min: 200, max: 340 },
    scale: { start: 0.18, end: 0.04 },
    alpha: { start: 1, end: 0.3 },
    lifespan: { min: 350, max: 650 },
    gravityY: size * 9,
    rotate: { min: 0, max: 360 },
    tint: [0x8d6e63, 0x6d4c41, 0xa1887f, 0x5d4037, 0xbcaaa4],
    emitting: false,
    quantity: count,
  });
  emitter.setDepth(24);
  emitter.explode(count);
  scene.time.delayedCall(800 / speed + 100, () => emitter.destroy());
}

/** Золотой звёздный взрыв (повышение уровня). Не блокирует. */
export function starBurst(scene: Phaser.Scene, x: number, y: number, size: number, count = 8, speed = 1): void {
  if (!sceneAlive(scene)) return;
  const emitter = scene.add.particles(x, y, TEX.star, {
    speed: { min: size * 1.2, max: size * 2.2 },
    angle: { min: 0, max: 360 },
    scale: { start: 1.1, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: 450, max: 750 },
    rotate: { min: 0, max: 360 },
    tint: [0xffd166, 0xfff3b0, 0xffb703, 0xffffff],
    emitting: false,
    quantity: count,
  });
  emitter.setDepth(26);
  emitter.explode(count);
  scene.time.delayedCall(900 / speed + 100, () => emitter.destroy());
}

/** Белое кольцо-вспышка под юнитом: «сейчас ходит этот». Не блокирует. */
export function actorFlash(scene: Phaser.Scene, x: number, y: number, size: number, speed: number): void {
  if (!sceneAlive(scene)) return;
  const ring = scene.add.image(x, y, TEX.ring).setDepth(8).setTint(0xffffff).setAlpha(0.9);
  ring.setDisplaySize(size * 0.6, size * 0.6);
  const sx = ring.scaleX;
  const sy = ring.scaleY;
  scene.tweens.add({ targets: ring, scaleX: sx * 2.2, scaleY: sy * 2.2, alpha: 0, duration: 300 / speed, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
}

/** Конфетти сверху (победа). Не блокирует. */
export function confettiRain(scene: Phaser.Scene, count: number, speed: number): void {
  if (!sceneAlive(scene)) return;
  const w = scene.scale.width;
  const emitter = scene.add.particles(0, -10, TEX.square, {
    x: { min: 0, max: w },
    speedY: { min: 120, max: 260 },
    speedX: { min: -60, max: 60 },
    scale: { start: 0.35, end: 0.2 },
    alpha: { start: 1, end: 0.8 },
    lifespan: { min: 1400, max: 2200 },
    gravityY: 120,
    rotate: { min: 0, max: 360 },
    tint: [0xe63946, 0x3a86ff, 0x2ec4b6, 0xffd166, 0xff6f9c, 0xffffff],
    emitting: false,
    quantity: count,
  });
  emitter.setDepth(61);
  emitter.explode(count);
  scene.time.delayedCall(2500 / speed + 100, () => emitter.destroy());
}
