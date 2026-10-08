import Phaser from 'phaser';
import type { WeatherDef, WeatherKind } from '@content/biomes';
import { TEX } from './textures';

/**
 * Погодный слой: пул частиц над тайлами и под юнитами. Снег, листья, песок, лепестки, мухи,
 * пылинки, угольки. Всё — презентация: без влияния на игру, без аллокаций в кадре.
 */

const WX = {
  flake: 'wx_flake',
  leaf: 'wx_leaf',
  petal: 'wx_petal',
  streak: 'wx_streak',
} as const;

function ensureWeatherTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(WX.flake)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // Мягкая снежинка/пылинка: круг с ореолом
  g.clear();
  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(8, 8, 8);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(8, 8, 4);
  g.generateTexture(WX.flake, 16, 16);
  // Лист: скруглённый ромб с прожилкой
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(12, 8, 22, 12);
  g.fillStyle(0x000000, 0.18);
  g.fillRect(2, 7, 20, 2);
  g.generateTexture(WX.leaf, 24, 16);
  // Лепесток
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(8, 6, 14, 10);
  g.generateTexture(WX.petal, 16, 12);
  // Песчаная чёрточка
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(0, 0, 24, 3, 1.5);
  g.generateTexture(WX.streak, 24, 3);
  g.destroy();
}

interface Particle {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  /** Фаза синусоиды дрейфа/мерцания. */
  phase: number;
  /** Угловая скорость, град/с. */
  spin: number;
  /** Возраст, с. */
  t: number;
  /** Срок жизни (для угольков/мух-рывков), с. */
  life: number;
  /** Индекс якоря (мухи). */
  anchor: number;
  size: number;
  baseAlpha: number;
}

export interface WeatherOptions {
  depth: number;
  /** Множитель плотности (кинематик — 0.6). */
  densityMul?: number;
  /** Потолок частиц. */
  maxParticles?: number;
  /** Направление ветра для песка: 1 слева направо, −1 справа налево. */
  windDir?: 1 | -1;
  /** Якоря для мух (мировые координаты) и радиус роения. */
  anchors?: { x: number; y: number }[];
  anchorRadius?: number;
}

const KIND_TEX: Record<WeatherKind, string> = {
  none: TEX.dot,
  snow: WX.flake,
  leaves: WX.leaf,
  sand: WX.streak,
  petals: WX.petal,
  flies: TEX.dot,
  motes: WX.flake,
  embers: TEX.dot,
};

export class WeatherLayer {
  private readonly scene: Phaser.Scene;
  private readonly kind: WeatherKind;
  private readonly colors: number[];
  private readonly pool: Particle[] = [];
  private readonly baseCount: number;
  private readonly maxCount: number;
  private readonly depth: number;
  private readonly windDir: 1 | -1;
  private anchors: { x: number; y: number }[];
  private anchorRadius: number;
  private gustUntil = 0;
  private nextGust = 0;
  private paused = false;
  private destroyed = false;
  private elapsed = 0;
  private readonly onVisibility = (): void => {
    this.paused = typeof document !== 'undefined' && document.hidden;
  };

  constructor(scene: Phaser.Scene, def: WeatherDef, opts: WeatherOptions) {
    this.scene = scene;
    this.kind = def.kind;
    this.colors = def.colors.length > 0 ? def.colors : [0xffffff];
    this.depth = opts.depth;
    this.windDir = opts.windDir ?? 1;
    this.anchors = opts.anchors ?? [];
    this.anchorRadius = opts.anchorRadius ?? 40;
    const mul = opts.densityMul ?? 1;
    const cap = opts.maxParticles ?? 40;
    this.baseCount = this.kind === 'none' ? 0 : Math.max(0, Math.min(cap, Math.round(def.density * mul)));
    // Для песка — запас под порыв (×2), остальным хватит базового числа.
    this.maxCount = Math.min(cap, this.kind === 'sand' ? this.baseCount * 2 : this.baseCount);
    if (this.baseCount === 0) return;
    ensureWeatherTextures(scene);
    const tex = KIND_TEX[this.kind];
    for (let i = 0; i < this.maxCount; i++) {
      const img = scene.add.image(0, 0, tex).setDepth(this.depth).setVisible(false);
      const p: Particle = { img, vx: 0, vy: 0, phase: Math.random() * Math.PI * 2, spin: 0, t: 0, life: 0, anchor: i % Math.max(1, this.anchors.length), size: 1, baseAlpha: 1 };
      this.pool.push(p);
      // Стартовое распределение по всему экрану, чтобы погода не «включалась» с края.
      this.respawn(p, true);
      if (i >= this.baseCount) img.setVisible(false);
    }
    this.nextGust = 6 + Math.random() * 4;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Обновить якоря роения мух (например, после перерисовки поля). */
  setAnchors(anchors: { x: number; y: number }[], radius?: number): void {
    this.anchors = anchors;
    if (radius !== undefined) this.anchorRadius = radius;
    this.pool.forEach((p, i) => {
      p.anchor = i % Math.max(1, anchors.length);
    });
  }

  setPaused(on: boolean): void {
    this.paused = on;
  }

  private get w(): number {
    return this.scene.scale.width;
  }

  private get h(): number {
    return this.scene.scale.height;
  }

  private tint(p: Particle): void {
    const c = this.colors[Math.floor(Math.random() * this.colors.length)] ?? 0xffffff;
    p.img.setTint(c);
  }

  /** Поставить частицу в начальное положение. `anywhere` — по всему экрану (старт), иначе — у края входа. */
  private respawn(p: Particle, anywhere: boolean): void {
    const w = this.w;
    const h = this.h;
    const img = p.img;
    img.setVisible(true).setAngle(0);
    p.t = 0;
    p.phase = Math.random() * Math.PI * 2;
    this.tint(p);
    switch (this.kind) {
      case 'snow': {
        p.size = 2 + Math.random() * 3;
        img.setDisplaySize(p.size * 2, p.size * 2);
        p.baseAlpha = 0.7 + Math.random() * 0.25;
        img.setAlpha(p.baseAlpha);
        p.vy = 25 + Math.random() * 20;
        p.vx = 0;
        p.spin = 0;
        img.setPosition(Math.random() * w, anywhere ? Math.random() * h : -10);
        break;
      }
      case 'leaves':
      case 'petals': {
        const leaf = this.kind === 'leaves';
        p.size = leaf ? 8 + Math.random() * 4 : 6 + Math.random() * 3;
        img.setDisplaySize(p.size, p.size * (leaf ? 0.66 : 0.75));
        p.baseAlpha = leaf ? 0.9 : 0.85;
        img.setAlpha(p.baseAlpha);
        p.vy = leaf ? 40 + Math.random() * 30 : 20 + Math.random() * 15;
        p.vx = leaf ? 10 : 6;
        p.spin = (Math.random() < 0.5 ? -1 : 1) * (leaf ? 90 + Math.random() * 90 : 40 + Math.random() * 50);
        img.setAngle(Math.random() * 360);
        img.setPosition(Math.random() * w, anywhere ? Math.random() * h : -12);
        break;
      }
      case 'sand': {
        p.size = 10 + Math.random() * 8;
        img.setDisplaySize(p.size, 2);
        p.baseAlpha = 0.3 + Math.random() * 0.1;
        img.setAlpha(p.baseAlpha);
        p.vx = (220 + Math.random() * 100) * this.windDir;
        p.vy = 0;
        p.spin = 0;
        img.setPosition(anywhere ? Math.random() * w : this.windDir > 0 ? -20 : w + 20, Math.random() * h);
        break;
      }
      case 'flies': {
        p.size = 2 + Math.random();
        img.setDisplaySize(p.size, p.size);
        p.baseAlpha = 0.85;
        img.setAlpha(p.baseAlpha);
        const a = this.anchors[p.anchor] ?? { x: w / 2, y: h / 2 };
        img.setPosition(a.x + (Math.random() - 0.5) * this.anchorRadius, a.y + (Math.random() - 0.5) * this.anchorRadius);
        p.vx = (Math.random() - 0.5) * 40;
        p.vy = (Math.random() - 0.5) * 40;
        p.life = 1 + Math.random() * 2; // до следующего рывка
        p.spin = 0;
        break;
      }
      case 'motes': {
        p.size = 2 + Math.random() * 2;
        img.setDisplaySize(p.size, p.size);
        p.baseAlpha = 0.25 + Math.random() * 0.25;
        img.setAlpha(p.baseAlpha);
        p.vx = (Math.random() - 0.5) * 16;
        p.vy = (Math.random() - 0.5) * 12;
        p.spin = 0;
        img.setPosition(Math.random() * w, Math.random() * h);
        break;
      }
      case 'embers': {
        p.size = 2 + Math.random() * 2;
        img.setDisplaySize(p.size, p.size);
        p.baseAlpha = 0.9;
        img.setAlpha(p.baseAlpha);
        p.vy = -(30 + Math.random() * 30);
        p.vx = 0;
        p.life = 2 + Math.random() * 2;
        p.spin = 0;
        img.setPosition(Math.random() * w, anywhere ? Math.random() * h : h + 6);
        break;
      }
      default:
        img.setVisible(false);
    }
  }

  private update(_time: number, deltaMs: number): void {
    if (this.destroyed || this.paused || this.pool.length === 0) return;
    const dt = Math.min(0.05, deltaMs / 1000);
    this.elapsed += dt;
    const w = this.w;
    const h = this.h;
    // Порывы песка: каждые ~8 с на 1.5 с частиц вдвое больше.
    if (this.kind === 'sand') {
      if (this.elapsed >= this.nextGust) {
        this.gustUntil = this.elapsed + 1.5;
        this.nextGust = this.elapsed + 7 + Math.random() * 3;
      }
    }
    const target = this.kind === 'sand' && this.elapsed < this.gustUntil ? this.maxCount : this.baseCount;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i] as Particle;
      const img = p.img;
      if (!img.visible) {
        // Спящие частицы просыпаются, пока активных меньше цели.
        if (i < target) this.respawn(p, false);
        continue;
      }
      p.t += dt;
      switch (this.kind) {
        case 'snow': {
          img.x += Math.sin(p.phase + p.t * 1.5) * 12 * dt + p.vx * dt;
          img.y += p.vy * dt;
          if (img.y > h + 10) this.recycle(p, i, target);
          break;
        }
        case 'leaves':
        case 'petals': {
          img.x += (p.vx + Math.sin(p.phase + p.t * 2) * (this.kind === 'leaves' ? 30 : 22)) * dt;
          img.y += p.vy * dt;
          img.angle += p.spin * dt;
          if (img.y > h + 14 || img.x > w + 20 || img.x < -20) this.recycle(p, i, target);
          break;
        }
        case 'sand': {
          img.x += p.vx * dt;
          img.y += Math.sin(p.phase + p.t * 4) * 10 * dt;
          if ((this.windDir > 0 && img.x > w + 30) || (this.windDir < 0 && img.x < -30)) this.recycle(p, i, target);
          break;
        }
        case 'flies': {
          const a = this.anchors[p.anchor] ?? { x: w / 2, y: h / 2 };
          // Случайное блуждание с притяжением к якорю и редкими рывками.
          p.vx += (Math.random() - 0.5) * 220 * dt + (a.x - img.x) * 2.5 * dt;
          p.vy += (Math.random() - 0.5) * 220 * dt + (a.y - img.y) * 2.5 * dt;
          const sp = Math.hypot(p.vx, p.vy);
          const cap = p.life < 0.25 ? 160 : 60;
          if (sp > cap) {
            p.vx = (p.vx / sp) * cap;
            p.vy = (p.vy / sp) * cap;
          }
          p.life -= dt;
          if (p.life <= 0) p.life = 1 + Math.random() * 2.5;
          img.x += p.vx * dt;
          img.y += p.vy * dt;
          break;
        }
        case 'motes': {
          img.x += p.vx * dt;
          img.y += p.vy * dt;
          img.setAlpha(p.baseAlpha * (0.7 + 0.3 * Math.sin(p.phase + p.t * 1.2)));
          if (img.x < -6) img.x = w + 6;
          if (img.x > w + 6) img.x = -6;
          if (img.y < -6) img.y = h + 6;
          if (img.y > h + 6) img.y = -6;
          break;
        }
        case 'embers': {
          img.x += Math.sin(p.phase + p.t * 3) * 18 * dt;
          img.y += p.vy * dt;
          img.setAlpha(p.baseAlpha * Math.max(0, 1 - p.t / p.life));
          if (p.t >= p.life || img.y < -8) this.recycle(p, i, target);
          break;
        }
        default:
          break;
      }
    }
  }

  private recycle(p: Particle, index: number, target: number): void {
    if (index < target) this.respawn(p, false);
    else p.img.setVisible(false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.off(Phaser.Scenes.Events.DESTROY, this.destroy, this);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    for (const p of this.pool) p.img.destroy();
    this.pool.length = 0;
  }
}
