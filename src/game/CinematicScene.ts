import Phaser from 'phaser';
import type { BattleEvent, BattleState, BattleUnit, Pos, Side, Strike, UnitInstance } from '@core/types';
import { terrainAt } from '@core/battle/query';
import { biomeDef } from '@content/biomes';
import { classDef } from '@content/classes';
import { KIND_COLOR } from '@content/weapons';
import { specialDef } from '@content/skills/specials';
import { displayName, unitClassName } from '@core/units';
import { haptic } from '@platform/haptics';
import type { Pose } from '@art/index';
import { ensureTextures, TEX } from './textures';
import { FONT, WEAPON_COLOR_HEX, hpColor, textStyle } from './style';
import { bloodBurst, floatText, ghostRise, tween, wait } from './fx';
import { backdropTexKey, ensureBackdropTexture, ensureUnitTextures, hasTexture, unitTexKey, withTimeout } from './svgTextures';
import { FUR_PALETTES } from '@content/appearance';

export const CINEMATIC_SCENE_KEY = 'Cinematic';

export type CombatEvent = Extract<BattleEvent, { type: 'combat' }>;

export interface CinematicData {
  event: CombatEvent;
  before: BattleState;
  after: BattleState;
  speed: number;
  resolve: () => void;
}

/** Пропорция текстуры миниатюры и доля высоты, где лапы. */
const ART_RATIO = 120 / 140;
const FEET_Y = 0.97;
const ART_WAIT_MS = 2500;

interface Fighter {
  id: string;
  unit: UnitInstance;
  side: Side;
  sprite: Phaser.GameObjects.Image;
  /** Есть ли текстуры поз (иначе — плейсхолдер-диск без смены поз). */
  posed: boolean;
  pose: Pose;
  dead: boolean;
  hurtTimer: Phaser.Time.TimerEvent | null;
  weaponColor: number;
  /** Итоговая позиция лап. */
  x: number;
  feetY: number;
  /** Высота миниатюры на экране. */
  height: number;
  hp: number;
  maxHp: number;
  bar: Phaser.GameObjects.Graphics;
  hpText: Phaser.GameObjects.Text;
  barX: number;
  barW: number;
  onLeft: boolean;
}

export class CinematicScene extends Phaser.Scene {
  private cine!: CinematicData;
  private skipped = false;
  private fighters = new Map<string, Fighter>();
  private speed = 1;

  constructor() {
    super(CINEMATIC_SCENE_KEY);
  }

  init(data: CinematicData): void {
    this.cine = data;
    this.skipped = false;
    this.speed = Math.max(0.25, data.speed);
    this.fighters.clear();
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;
  }

  create(): void {
    ensureTextures(this);
    // Во время create() сцена ещё в статусе CREATING и sys.isActive() === false:
    // хелперы tween/wait пропустили бы первое затемнение. Стартуем на следующем тике.
    this.time.delayedCall(0, () => void this.run());
  }

  private skip = (): void => {
    if (this.skipped) return;
    this.skipped = true;
    this.tweens.timeScale = 40;
    this.time.timeScale = 40;
  };

  /** Центр туловища бойца (для чисел урона и крови). */
  private bodyY(f: Fighter): number {
    return f.sprite.y - f.height * 0.45;
  }

  private setPose(f: Fighter, pose: Pose): void {
    if (!this.sys || !f.posed) return;
    if (f.dead && pose !== 'dead') return;
    f.pose = pose;
    const key = unitTexKey(f.unit, pose, 'cine');
    if (hasTexture(this, key)) f.sprite.setTexture(key);
    const h = f.height;
    f.sprite.setDisplaySize(h * ART_RATIO, h);
  }

  private hurt(f: Fighter, ms: number): void {
    f.hurtTimer?.remove(false);
    f.hurtTimer = null;
    if (!f.dead) this.setPose(f, 'hurt');
    f.sprite.setTintFill(0xffffff);
    this.time.delayedCall(Math.min(70, ms), () => {
      if (f.sprite.scene) f.sprite.clearTint();
    });
    f.hurtTimer = this.time.delayedCall(ms, () => {
      f.hurtTimer = null;
      if (!f.dead) this.setPose(f, 'idle');
    });
  }

  private async run(): Promise<void> {
    const { event, before, after } = this.cine;
    const w = this.scale.width;
    const h = this.scale.height;
    const biome = biomeDef(before.map.biomeId);
    const feetY = h * 0.62;
    const size = Math.min(w, h) * 0.6;

    // Подложка с запасом (канвас может изменить размер во время сцены) и чёрное затемнение.
    const groundCol = Phaser.Display.Color.IntegerToColor(biome.colors.plain);
    const groundDark = groundCol.clone().darken(35).color;
    this.add.rectangle(w / 2, h / 2, w * 3, h * 5, groundDark, 1).setDepth(-1);
    const fade = this.add.rectangle(w / 2, h / 2, w * 3, h * 5, 0x000000, 1).setDepth(50);

    const aBu = before.units[event.attackerId];
    const dBu = before.units[event.defenderId];
    const aUnit = after.roster[event.attackerId] ?? before.roster[event.attackerId];
    const dUnit = after.roster[event.defenderId] ?? before.roster[event.defenderId];
    if (!aBu || !dBu || !aUnit || !dUnit) return this.finish();

    const attackerLeft = aBu.side === 'player' || aBu.side === dBu.side;
    const leftPos: Pos = attackerLeft ? event.attackerPos : event.defenderPos;
    const rightPos: Pos = attackerLeft ? event.defenderPos : event.attackerPos;
    const leftTerrain = terrainAt(before, leftPos);
    const rightTerrain = terrainAt(before, rightPos);

    // Фон по клеткам бойцов и текстуры поз — пока экран затемнён.
    const halfW = Math.ceil(w / 2) + 1;
    await withTimeout(
      Promise.all([
        ensureBackdropTexture(this, biome.id, leftTerrain, 'left', halfW, h),
        ensureBackdropTexture(this, biome.id, rightTerrain, 'right', halfW, h),
        ensureUnitTextures(this, aUnit, 'cine'),
        ensureUnitTextures(this, dUnit, 'cine'),
      ]),
      ART_WAIT_MS,
    );
    if (!this.sys || !this.sys.isActive()) return;

    this.drawBackdrop(biome.id, leftTerrain, rightTerrain, w, h, halfW);

    const leftX = w * 0.27;
    const rightX = w * 0.73;
    const mk = (id: string, unit: UnitInstance, bu: BattleUnit, hpBefore: number, onLeft: boolean): Fighter => {
      const x = onLeft ? leftX : rightX;
      const idleKey = unitTexKey(unit, 'idle', 'cine');
      const posed = hasTexture(this, idleKey);
      const sprite = this.add.image(x + (onLeft ? -w : w), feetY, posed ? idleKey : TEX.disc).setDepth(10);
      if (posed) {
        sprite.setOrigin(0.5, FEET_Y);
        sprite.setDisplaySize(size * ART_RATIO, size);
      } else {
        sprite.setOrigin(0.5, 1);
        sprite.setTint(FUR_PALETTES[unit.appearance.furPalette]?.color ?? 0xcccccc);
        sprite.setDisplaySize(size * 0.5, size * 0.5);
      }
      sprite.setFlipX(!onLeft);
      const weaponColor = WEAPON_COLOR_HEX[KIND_COLOR[classDef(unit.classId).weaponKind]];
      const barW = w * 0.42;
      const barX = onLeft ? w * 0.04 : w * 0.54;
      const topY = h * 0.07;
      this.add.text(barX + (onLeft ? 0 : barW), topY - 2, displayName(unit), textStyle(Math.min(16, w * 0.04), '#fff', true, 3)).setOrigin(onLeft ? 0 : 1, 1).setDepth(20);
      this.add.text(barX + (onLeft ? 0 : barW), topY + 26, `${unitClassName(unit)} · ур. ${unit.level}`, textStyle(Math.min(12, w * 0.03), '#d0d0d0', false, 2)).setOrigin(onLeft ? 0 : 1, 0).setDepth(20);
      const bar = this.add.graphics().setDepth(20);
      const hpText = this.add.text(barX + (onLeft ? barW : 0), topY + 11, '', textStyle(13, '#fff', true, 3)).setOrigin(onLeft ? 1 : 0, 0.5).setDepth(21);
      hpText.setX(onLeft ? barX + barW - 4 : barX + 4);
      const f: Fighter = {
        id,
        unit,
        side: bu.side,
        sprite,
        posed,
        pose: 'idle',
        dead: false,
        hurtTimer: null,
        weaponColor,
        x,
        feetY,
        height: size,
        hp: hpBefore,
        maxHp: bu.maxHp,
        bar,
        hpText,
        barX,
        barW,
        onLeft,
      };
      this.drawBar(f, topY);
      return f;
    };
    const topY = h * 0.07;
    const fa = mk(event.attackerId, aUnit, aBu, event.attackerHpBefore, attackerLeft);
    const fd = mk(event.defenderId, dUnit, dBu, event.defenderHpBefore, !attackerLeft);
    this.fighters.set(fa.id, fa);
    this.fighters.set(fd.id, fd);

    // Цветная полоска оружия под именем
    for (const f of [fa, fd]) {
      const g = this.add.graphics().setDepth(20);
      g.fillStyle(f.weaponColor, 1);
      g.fillRect(f.barX, topY + 22, f.barW, 3);
    }
    // Треугольник
    const tri = event.strikes[0]?.triangle ?? 'neutral';
    if (tri !== 'neutral') {
      const sym = tri === 'adv' ? '▲' : '▼';
      this.add.text(w / 2, topY + 8, sym, textStyle(22, tri === 'adv' ? '#2ec4b6' : '#e63946', true, 3)).setOrigin(0.5).setDepth(21);
    }

    this.input.on('pointerdown', this.skip);

    // Въезд
    await tween(this, { targets: fade, alpha: 0, duration: 250 / this.speed });
    this.setPose(fa, 'run');
    this.setPose(fd, 'run');
    await Promise.all([
      tween(this, { targets: fa.sprite, x: fa.x, duration: 200 / this.speed, ease: 'Cubic.easeOut' }),
      tween(this, { targets: fd.sprite, x: fd.x, duration: 200 / this.speed, ease: 'Cubic.easeOut' }),
    ]);
    this.setPose(fa, 'idle');
    this.setPose(fd, 'idle');
    await wait(this, 120 / this.speed);

    for (const strike of event.strikes) {
      const atk = this.fighters.get(strike.attackerId);
      const def = this.fighters.get(strike.defenderId);
      if (!atk || !def) continue;
      await this.playStrike(strike, atk, def, topY);
      if (def.hp <= 0 || atk.hp <= 0) break;
    }

    // Смерть и радость выжившего
    let someoneDied = false;
    for (const f of [fa, fd]) {
      if (f.hp <= 0) {
        someoneDied = true;
        await this.death(f);
      }
    }
    if (someoneDied) {
      for (const f of [fa, fd]) if (f.hp > 0) this.setPose(f, 'happy');
    }
    await wait(this, 300 / this.speed);
    await tween(this, { targets: fade, alpha: 1, duration: 220 / this.speed });
    this.finish();
  }

  /** Две половины фона: слева — клетка левого бойца, справа — правого. */
  private drawBackdrop(biomeId: string, leftTerrain: ReturnType<typeof terrainAt>, rightTerrain: ReturnType<typeof terrainAt>, w: number, h: number, halfW: number): void {
    const biome = biomeDef(biomeId);
    const draw = (terrain: ReturnType<typeof terrainAt>, side: 'left' | 'right', x: number): void => {
      const key = backdropTexKey(biomeId, terrain, side, halfW, Math.round(h));
      if (hasTexture(this, key)) {
        this.add.image(x, 0, key).setOrigin(0, 0).setDisplaySize(halfW, h).setDepth(0);
      } else {
        // Фолбэк: простой градиент биома.
        const g = this.add.graphics().setDepth(0);
        const sky = Phaser.Display.Color.IntegerToColor(biome.bg);
        const dark = sky.clone().darken(45).color;
        g.fillGradientStyle(dark, dark, biome.bg, biome.bg, 1);
        g.fillRect(x, 0, halfW, h * 0.52);
        g.fillStyle(biome.colors[terrain] ?? biome.colors.plain, 1);
        g.fillRect(x, h * 0.52, halfW, h * 0.48);
      }
    };
    draw(leftTerrain, 'left', 0);
    draw(rightTerrain, 'right', Math.floor(w / 2) - 1);
    // Разделитель
    this.add.rectangle(w / 2, h / 2, 2, h, 0x000000, 0.35).setDepth(1);
  }

  private drawBar(f: Fighter, topY: number): void {
    const g = f.bar;
    g.clear();
    const hgt = 12;
    g.fillStyle(0x000000, 0.75);
    g.fillRect(f.barX - 2, topY - 2, f.barW + 4, hgt + 4);
    g.fillStyle(0x333333, 1);
    g.fillRect(f.barX, topY, f.barW, hgt);
    const pct = Math.max(0, Math.min(1, f.hp / f.maxHp));
    g.fillStyle(hpColor(pct), 1);
    if (f.onLeft) g.fillRect(f.barX, topY, f.barW * pct, hgt);
    else g.fillRect(f.barX + f.barW * (1 - pct), topY, f.barW * pct, hgt);
    f.hpText.setText(`${Math.max(0, Math.round(f.hp))}/${f.maxHp}`);
  }

  private async playStrike(strike: Strike, atk: Fighter, def: Fighter, topY: number): Promise<void> {
    const sp = this.speed;
    const dir = def.onLeft ? -1 : 1; // сторона защищающегося
    const w = this.scale.width;
    const defBodyY = this.bodyY(def);
    const atkBodyY = this.bodyY(atk);

    if (strike.special) {
      await this.cutIn(strike.special, atk);
    }
    if (strike.defenseSpecial && !strike.miracle) {
      floatText(this, def.sprite.x, defBodyY - 70, specialDef(strike.defenseSpecial).name, '#8ecae6', sp, { size: 14, rise: 20 });
    }

    // Замах
    this.setPose(atk, 'run');
    await tween(this, { targets: atk.sprite, x: atk.x + dir * 24, duration: 150 / sp, ease: 'Quad.easeIn' });
    // Снаряд для дальней атаки
    if (strike.range === 2) {
      const proj = this.add.circle(atk.sprite.x, atkBodyY, 7, atk.weaponColor).setDepth(15);
      await tween(this, { targets: proj, x: def.sprite.x, y: defBodyY, duration: 220 / sp, ease: 'Quad.easeIn' });
      proj.destroy();
    }
    // Контакт
    const shakePx = strike.special ? 8 : 4;
    this.cameras.main.shake(140 / sp, shakePx / w);
    this.hurt(def, 160 / sp);
    haptic(strike.special ? 'heavy' : 'medium');
    const dmgColor = strike.damage === 0 ? '#bbbbbb' : strike.special ? '#ffd166' : strike.effective ? '#ff6b6b' : '#ffffff';
    const dmgText = strike.damage === 0 ? 'Хлоп!' : String(strike.damage);
    const big = strike.damage >= def.maxHp * 0.5;
    floatText(this, def.sprite.x, defBodyY - 40, dmgText, dmgColor, sp, { size: big ? 34 : strike.special ? 30 : 24, rise: 36, shake: big });
    if (strike.effective) floatText(this, def.sprite.x + 30, defBodyY - 70, '×1.5', '#ff6b6b', sp, { size: 14, rise: 22 });
    if (strike.damage > 0) {
      const count = (strike.special ? 2 : 1) * Phaser.Math.Between(15, 30);
      const angle = dir > 0 ? { min: -45, max: 45 } : { min: 135, max: 225 };
      bloodBurst(this, def.sprite.x, defBodyY, count, angle, 1.4, sp);
      const splat = this.add.image(def.sprite.x + dir * 20, def.feetY - 6, TEX.splat).setTint(0xd9122b).setAlpha(0.8).setDepth(5).setDisplaySize(40, 40);
      splat.setRotation(Phaser.Math.FloatBetween(0, 6.28));
    }
    if (strike.healed > 0) floatText(this, atk.sprite.x, atkBodyY - 50, `+${strike.healed}`, '#80ed99', sp, { size: 20, rise: 28 });
    if (strike.miracle) {
      floatText(this, def.sprite.x, defBodyY - 90, '1 HP!', '#ffd700', sp, { size: 26, rise: 30 });
      this.cameras.main.flash(200 / sp, 255, 215, 0);
    }
    // HP
    def.hp = strike.defenderHpAfter;
    atk.hp = strike.attackerHpAfter;
    const target = { v: def.hp + strike.damage };
    await tween(this, {
      targets: target,
      v: def.hp,
      duration: 250 / sp,
      onUpdate: () => {
        const saved = def.hp;
        def.hp = target.v;
        this.drawBar(def, topY);
        def.hp = saved;
      },
    });
    this.drawBar(def, topY);
    this.drawBar(atk, topY);
    // Отход
    await tween(this, { targets: atk.sprite, x: atk.x, duration: 200 / sp, ease: 'Quad.easeOut' });
    if (!atk.dead) this.setPose(atk, 'idle');
  }

  private async cutIn(specialId: string, atk: Fighter): Promise<void> {
    const sp = this.speed;
    const w = this.scale.width;
    const h = this.scale.height;
    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0).setDepth(40);
    const band = this.add.rectangle(atk.onLeft ? -w : w * 2, h * 0.42, w, h * 0.16, atk.weaponColor, 0.95).setDepth(41);
    const name = specialDef(specialId).name;
    const label = this.add
      .text(band.x, band.y, name, { fontFamily: FONT, fontSize: `${Math.round(Math.min(28, w * 0.07))}px`, color: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(42);
    const portrait = this.add.text(band.x, band.y, atk.side === 'player' ? '🐾' : '💢', textStyle(40, '#fff', false, 0)).setOrigin(0.5).setDepth(42).setAlpha(0.6);
    portrait.setX(band.x + (atk.onLeft ? -w * 0.36 : w * 0.36));
    haptic('heavy');
    this.tweens.add({ targets: overlay, fillAlpha: 0.55, duration: 120 / sp });
    await tween(this, { targets: [band, label], x: w / 2, duration: 160 / sp, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: portrait, x: w / 2 + (atk.onLeft ? -w * 0.36 : w * 0.36), duration: 160 / sp });
    await wait(this, 240 / sp);
    await tween(this, { targets: [band, label, portrait, overlay], alpha: 0, duration: 120 / sp });
    overlay.destroy();
    band.destroy();
    label.destroy();
    portrait.destroy();
  }

  private async death(f: Fighter): Promise<void> {
    const sp = this.speed;
    const unit = this.cine.after.roster[f.id] ?? this.cine.before.roster[f.id];
    const isPlayer = f.side === 'player';
    const size = f.height;
    const bodyY = this.bodyY(f);
    f.hurtTimer?.remove(false);
    f.hurtTimer = null;
    f.dead = false;
    this.setPose(f, 'dead');
    f.dead = true;
    f.sprite.setTintFill(0xffffff);
    this.time.delayedCall(80 / sp, () => {
      if (f.sprite.scene) f.sprite.clearTint();
    });
    this.cameras.main.shake(200 / sp, 0.02);
    bloodBurst(this, f.sprite.x, bodyY, 55, null, 1.8, sp);
    if (isPlayer) haptic('error');
    const pool = this.add.image(f.sprite.x, f.feetY + 4, TEX.pool).setTint(0xd9122b).setAlpha(0).setDepth(6).setDisplaySize(size * 0.9, size * 0.4);
    this.tweens.add({ targets: pool, alpha: 0.9, duration: 400 / sp });
    // Падение: вращение вокруг лап, тело ложится на землю.
    await tween(this, { targets: f.sprite, angle: f.onLeft ? -90 : 90, alpha: 0.85, duration: 450 / sp, ease: 'Bounce.easeOut' });
    const word = isPlayer ? (unit?.gender === 'f' ? 'ПАЛА' : 'ПАЛ') : unit?.gender === 'f' ? 'ГОТОВА' : 'ГОТОВ';
    const w = this.scale.width;
    const stampText = this.add.text(w / 2, this.scale.height * 0.35, word, textStyle(Math.min(48, w * 0.14), isPlayer ? '#ff4d6d' : '#f1f1f1', true, 7)).setOrigin(0.5).setDepth(45).setScale(2.5).setAlpha(0);
    const ghost = ghostRise(this, f.sprite.x, bodyY, size * 0.4, sp);
    await tween(this, { targets: stampText, scale: 1, alpha: 1, duration: 180 / sp, ease: 'Back.easeIn' });
    await ghost;
    await wait(this, (isPlayer ? 500 : 250) / sp);
  }

  private finish(): void {
    this.input.off('pointerdown', this.skip);
    for (const f of this.fighters.values()) f.hurtTimer?.remove(false);
    const resolve = this.cine.resolve;
    this.scene.stop();
    resolve();
  }
}
