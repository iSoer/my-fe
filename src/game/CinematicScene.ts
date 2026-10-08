import Phaser from 'phaser';
import type { BattleEvent, BattleState, Strike } from '@core/types';
import { biomeDef } from '@content/biomes';
import { specialDef } from '@content/skills/specials';
import { displayName, unitClassName } from '@core/units';
import { haptic } from '@platform/haptics';
import { ensureTextures } from './textures';
import { FONT, hpColor, textStyle } from './style';
import { UnitView } from './UnitView';
import { bloodBurst, floatText, ghostRise, tween, wait } from './fx';

export const CINEMATIC_SCENE_KEY = 'Cinematic';

export type CombatEvent = Extract<BattleEvent, { type: 'combat' }>;

export interface CinematicData {
  event: CombatEvent;
  before: BattleState;
  after: BattleState;
  speed: number;
  resolve: () => void;
}

interface Fighter {
  id: string;
  view: UnitView;
  x: number;
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

  private async run(): Promise<void> {
    const { event, before, after } = this.cine;
    const w = this.scale.width;
    const h = this.scale.height;
    const biome = biomeDef(before.map.biomeId);
    const groundY = h * 0.6;
    const size = Math.min(w, h) * 0.24;

    // Фон
    // Фон рисуем с большим запасом: канвас может изменить размер во время сцены
    // (нижняя DOM-панель меняет высоту), и карта не должна просвечивать.
    const bg = this.add.graphics().setDepth(0);
    const sky = Phaser.Display.Color.IntegerToColor(biome.bg);
    const dark = sky.clone().darken(45).color;
    const groundCol = Phaser.Display.Color.IntegerToColor(biome.colors.plain);
    const groundDark = groundCol.clone().darken(35).color;
    bg.fillStyle(dark, 1);
    bg.fillRect(-w, -h * 2, w * 3, h * 2 + h * 0.18);
    bg.fillGradientStyle(dark, dark, biome.bg, biome.bg, 1);
    bg.fillRect(-w, h * 0.18, w * 3, groundY - h * 0.18);
    bg.fillStyle(biome.colors.plain, 1);
    bg.fillRect(-w, groundY, w * 3, h * 0.2);
    bg.fillGradientStyle(biome.colors.plain, biome.colors.plain, groundDark, groundDark, 1);
    bg.fillRect(-w, groundY + h * 0.2, w * 3, h * 2);
    const fade = this.add.rectangle(w / 2, h / 2, w * 3, h * 5, 0x000000, 1).setDepth(50);

    const aBu = before.units[event.attackerId];
    const dBu = before.units[event.defenderId];
    const aUnit = after.roster[event.attackerId] ?? before.roster[event.attackerId];
    const dUnit = after.roster[event.defenderId] ?? before.roster[event.defenderId];
    if (!aBu || !dBu || !aUnit || !dUnit) return this.finish();

    const attackerLeft = aBu.side === 'player' || (aBu.side === dBu.side && true);
    const leftX = w * 0.27;
    const rightX = w * 0.73;

    const mk = (id: string, unit: typeof aUnit, bu: typeof aBu, hpBefore: number, onLeft: boolean): Fighter => {
      const view = new UnitView(this, unit, bu.side, { size, showHp: false, showBadges: false });
      const x = onLeft ? leftX : rightX;
      view.setPosition(x + (onLeft ? -w : w), groundY - size * 0.3).setDepth(10);
      const barW = w * 0.42;
      const barX = onLeft ? w * 0.04 : w * 0.54;
      const topY = h * 0.07;
      this.add.text(barX + (onLeft ? 0 : barW), topY - 2, displayName(unit), textStyle(Math.min(16, w * 0.04), '#fff', true, 3)).setOrigin(onLeft ? 0 : 1, 1).setDepth(20);
      this.add.text(barX + (onLeft ? 0 : barW), topY + 26, `${unitClassName(unit)} · ур. ${unit.level}`, textStyle(Math.min(12, w * 0.03), '#d0d0d0', false, 2)).setOrigin(onLeft ? 0 : 1, 0).setDepth(20);
      const bar = this.add.graphics().setDepth(20);
      const hpText = this.add.text(barX + (onLeft ? barW : 0), topY + 11, '', textStyle(13, '#fff', true, 3)).setOrigin(onLeft ? 1 : 0, 0.5).setDepth(21);
      hpText.setX(onLeft ? barX + barW - 4 : barX + 4);
      const f: Fighter = { id, view, x, hp: hpBefore, maxHp: bu.maxHp, bar, hpText, barX, barW, onLeft };
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
      g.fillStyle(f.view.weaponColor, 1);
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
    await Promise.all([
      tween(this, { targets: fa.view, x: fa.x, duration: 200 / this.speed, ease: 'Cubic.easeOut' }),
      tween(this, { targets: fd.view, x: fd.x, duration: 200 / this.speed, ease: 'Cubic.easeOut' }),
    ]);
    await wait(this, 120 / this.speed);

    for (const strike of event.strikes) {
      const atk = this.fighters.get(strike.attackerId);
      const def = this.fighters.get(strike.defenderId);
      if (!atk || !def) continue;
      await this.playStrike(strike, atk, def, topY);
      if (def.hp <= 0 || atk.hp <= 0) break;
    }

    // Смерть
    for (const f of [fa, fd]) {
      if (f.hp <= 0) await this.death(f, size);
    }
    await wait(this, 300 / this.speed);
    await tween(this, { targets: fade, alpha: 1, duration: 220 / this.speed });
    this.finish();
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

    if (strike.special) {
      await this.cutIn(strike.special, atk);
    }
    if (strike.defenseSpecial && !strike.miracle) {
      floatText(this, def.view.x, def.view.y - 70, specialDef(strike.defenseSpecial).name, '#8ecae6', sp, { size: 14, rise: 20 });
    }

    // Замах
    await tween(this, { targets: atk.view, x: atk.x + dir * 24, duration: 150 / sp, ease: 'Quad.easeIn' });
    // Снаряд для дальней атаки
    if (strike.range === 2) {
      const proj = this.add.circle(atk.view.x, atk.view.y, 7, atk.view.weaponColor).setDepth(15);
      await tween(this, { targets: proj, x: def.view.x, y: def.view.y, duration: 220 / sp, ease: 'Quad.easeIn' });
      proj.destroy();
    }
    // Контакт
    const shakePx = strike.special ? 8 : 4;
    this.cameras.main.shake(140 / sp, shakePx / w);
    def.view.hitFlash(100 / sp);
    haptic(strike.special ? 'heavy' : 'medium');
    const dmgColor = strike.damage === 0 ? '#bbbbbb' : strike.special ? '#ffd166' : strike.effective ? '#ff6b6b' : '#ffffff';
    const dmgText = strike.damage === 0 ? 'Хлоп!' : String(strike.damage);
    const big = strike.damage >= def.maxHp * 0.5;
    floatText(this, def.view.x, def.view.y - 40, dmgText, dmgColor, sp, { size: big ? 34 : strike.special ? 30 : 24, rise: 36, shake: big });
    if (strike.effective) floatText(this, def.view.x + 30, def.view.y - 70, '×1.5', '#ff6b6b', sp, { size: 14, rise: 22 });
    if (strike.damage > 0) {
      const count = (strike.special ? 2 : 1) * Phaser.Math.Between(15, 30);
      const angle = dir > 0 ? { min: -45, max: 45 } : { min: 135, max: 225 };
      bloodBurst(this, def.view.x, def.view.y, count, angle, 1.4, sp);
      const splat = this.add.image(def.view.x + dir * 20, def.view.y + 30, 'tex_splat').setTint(0xd9122b).setAlpha(0.8).setDepth(5).setDisplaySize(40, 40);
      splat.setRotation(Phaser.Math.FloatBetween(0, 6.28));
      void splat;
    }
    if (strike.healed > 0) floatText(this, atk.view.x, atk.view.y - 50, `+${strike.healed}`, '#80ed99', sp, { size: 20, rise: 28 });
    if (strike.miracle) {
      floatText(this, def.view.x, def.view.y - 90, '1 HP!', '#ffd700', sp, { size: 26, rise: 30 });
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
    await tween(this, { targets: atk.view, x: atk.x, duration: 200 / sp, ease: 'Quad.easeOut' });
  }

  private async cutIn(specialId: string, atk: Fighter): Promise<void> {
    const sp = this.speed;
    const w = this.scale.width;
    const h = this.scale.height;
    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0).setDepth(40);
    const band = this.add.rectangle(atk.onLeft ? -w : w * 2, h * 0.42, w, h * 0.16, atk.view.weaponColor, 0.95).setDepth(41);
    const name = specialDef(specialId).name;
    const label = this.add
      .text(band.x, band.y, name, { fontFamily: FONT, fontSize: `${Math.round(Math.min(28, w * 0.07))}px`, color: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(42);
    const portrait = this.add.text(band.x, band.y, atk.view.side === 'player' ? '🐾' : '💢', textStyle(40, '#fff', false, 0)).setOrigin(0.5).setDepth(42).setAlpha(0.6);
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

  private async death(f: Fighter, size: number): Promise<void> {
    const sp = this.speed;
    const unit = this.cine.after.roster[f.id] ?? this.cine.before.roster[f.id];
    const isPlayer = f.view.side === 'player';
    f.view.hitFlash(100 / sp);
    this.cameras.main.shake(200 / sp, 0.02);
    bloodBurst(this, f.view.x, f.view.y, 55, null, 1.8, sp);
    if (isPlayer) haptic('error');
    const pool = this.add.image(f.view.x, f.view.y + size * 0.35, 'tex_pool').setTint(0xd9122b).setAlpha(0).setDepth(6).setDisplaySize(size * 1.3, size * 0.6);
    this.tweens.add({ targets: pool, alpha: 0.9, duration: 400 / sp });
    await tween(this, { targets: f.view, angle: f.onLeft ? -90 : 90, y: f.view.y + size * 0.25, alpha: 0.85, duration: 450 / sp, ease: 'Bounce.easeOut' });
    const word = isPlayer ? (unit?.gender === 'f' ? 'ПАЛА' : 'ПАЛ') : unit?.gender === 'f' ? 'ГОТОВА' : 'ГОТОВ';
    const w = this.scale.width;
    const stampText = this.add.text(w / 2, this.scale.height * 0.35, word, textStyle(Math.min(48, w * 0.14), isPlayer ? '#ff4d6d' : '#f1f1f1', true, 7)).setOrigin(0.5).setDepth(45).setScale(2.5).setAlpha(0);
    const ghost = ghostRise(this, f.view.x, f.view.y - size * 0.3, size, sp);
    await tween(this, { targets: stampText, scale: 1, alpha: 1, duration: 180 / sp, ease: 'Back.easeIn' });
    await ghost;
    await wait(this, (isPlayer ? 500 : 250) / sp);
  }

  private finish(): void {
    this.input.off('pointerdown', this.skip);
    const resolve = this.cine.resolve;
    this.scene.stop();
    resolve();
  }
}
