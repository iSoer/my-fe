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

/** Полноэкранная плашка «ВАША ФАЗА» и т. п. */
export async function banner(scene: Phaser.Scene, text: string, color: number, speed: number, hold = 450): Promise<void> {
  if (!sceneAlive(scene)) return;
  const w = scene.scale.width;
  const h = scene.scale.height;
  const bandH = Math.min(72, h * 0.12);
  const band = scene.add.rectangle(-w / 2, h / 2, w, bandH, color, 0.92).setDepth(30);
  const label = scene.add
    .text(-w / 2, h / 2, text, { fontFamily: FONT, fontSize: `${Math.round(bandH * 0.42)}px`, color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 })
    .setOrigin(0.5)
    .setDepth(31);
  await tween(scene, { targets: [band, label], x: w / 2, duration: 220 / speed, ease: 'Cubic.easeOut' });
  await wait(scene, hold / speed);
  await tween(scene, { targets: [band, label], x: w * 1.5, duration: 220 / speed, ease: 'Cubic.easeIn' });
  band.destroy();
  label.destroy();
}

/** «Штамп» — текст с ударом (ПАЛ, ПОБЕДА...). */
export async function stamp(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size: number, speed: number, hold = 500): Promise<void> {
  if (!sceneAlive(scene)) return;
  const t = scene.add.text(x, y, text, textStyle(size, color, true, 6)).setOrigin(0.5).setDepth(32).setScale(2.2).setAlpha(0);
  await tween(scene, { targets: t, scale: 1, alpha: 1, duration: 160 / speed, ease: 'Back.easeIn' });
  scene.cameras.main.shake(120 / speed, 0.01);
  await wait(scene, hold / speed);
  await tween(scene, { targets: t, alpha: 0, duration: 200 / speed });
  t.destroy();
}
