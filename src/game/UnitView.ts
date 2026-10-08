import Phaser from 'phaser';
import type { Side, UnitInstance } from '@core/types';
import { FUR_PALETTES } from '@content/appearance';
import { classDef } from '@content/classes';
import { weaponDef } from '@content/weapons';
import { TEX } from './textures';
import { MOVE_GLYPH, WEAPON_COLOR_HEX, hexCss, hpColor, textStyle } from './style';

export interface UnitViewOptions {
  size: number;
  showHp?: boolean;
  showBadges?: boolean;
}

/** Визуальное представление юнита: диск шерсти, эмодзи вида, кольцо цвета оружия, HP, значки. */
export class UnitView extends Phaser.GameObjects.Container {
  readonly unitId: string;
  readonly side: Side;
  private readonly disc: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Image;
  private readonly emoji: Phaser.GameObjects.Text;
  private readonly moveGlyph: Phaser.GameObjects.Text;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly cdBadge: Phaser.GameObjects.Container;
  private readonly cdBg: Phaser.GameObjects.Image;
  private readonly cdText: Phaser.GameObjects.Text;
  private readonly bossMark: Phaser.GameObjects.Text;
  private size = 48;
  private hp = 1;
  private maxHp = 1;
  private showHp: boolean;
  private showBadges: boolean;
  readonly furColor: number;
  readonly weaponColor: number;
  readonly hasSpecial: boolean;

  constructor(scene: Phaser.Scene, unit: UnitInstance, side: Side, opts: UnitViewOptions) {
    super(scene, 0, 0);
    this.unitId = unit.id;
    this.side = side;
    this.showHp = opts.showHp ?? true;
    this.showBadges = opts.showBadges ?? true;
    const cls = classDef(unit.classId);
    const weapon = weaponDef(unit.skills.weapon);
    this.furColor = FUR_PALETTES[unit.appearance.furPalette]?.color ?? 0xcccccc;
    this.weaponColor = WEAPON_COLOR_HEX[weapon.color];
    this.hasSpecial = !!unit.skills.special;

    this.ring = scene.add.image(0, 0, TEX.ring).setTint(this.weaponColor);
    this.disc = scene.add.image(0, 0, TEX.disc).setTint(this.furColor);
    this.emoji = scene.add.text(0, 0, unit.species === 'cat' ? '🐱' : '🐶', textStyle(24, '#fff', false, 0)).setOrigin(0.5);
    if (side === 'enemy') this.emoji.setScale(-1, 1);
    this.moveGlyph = scene.add.text(0, 0, MOVE_GLYPH[cls.moveType], textStyle(10, hexCss(side === 'player' ? 0x8ecae6 : 0xffb4a2), true, 2)).setOrigin(0.5);
    this.hpBar = scene.add.graphics();
    this.hpText = scene.add.text(0, 0, '', textStyle(9, '#fff', true, 2)).setOrigin(1, 0.5);
    this.cdBg = scene.add.image(0, 0, TEX.disc).setTint(0x222222);
    this.cdText = scene.add.text(0, 0, '', textStyle(9, '#ffd166', true, 2)).setOrigin(0.5);
    this.cdBadge = scene.add.container(0, 0, [this.cdBg, this.cdText]);
    this.bossMark = scene.add.text(0, 0, unit.isBoss ? '👑' : '', textStyle(12, '#fff', false, 0)).setOrigin(0.5);

    this.add([this.ring, this.disc, this.emoji, this.moveGlyph, this.hpBar, this.hpText, this.cdBadge, this.bossMark]);
    scene.add.existing(this);
    this.resize(opts.size);
  }

  resize(size: number): void {
    this.size = size;
    const d = size * 0.72;
    this.ring.setDisplaySize(d * 1.12, d * 1.12);
    this.disc.setDisplaySize(d, d);
    this.emoji.setFontSize(Math.round(size * 0.5));
    this.emoji.setPosition(0, -size * 0.02);
    this.moveGlyph.setFontSize(Math.max(8, Math.round(size * 0.2)));
    this.moveGlyph.setPosition(-size * 0.36, size * 0.3);
    this.hpText.setFontSize(Math.max(8, Math.round(size * 0.18)));
    this.hpText.setPosition(size * 0.42, size * 0.3);
    const badge = size * 0.3;
    this.cdBg.setDisplaySize(badge, badge);
    this.cdText.setFontSize(Math.max(8, Math.round(size * 0.18)));
    this.cdBadge.setPosition(size * 0.34, -size * 0.34);
    this.bossMark.setFontSize(Math.round(size * 0.3));
    this.bossMark.setPosition(-size * 0.3, -size * 0.36);
    this.redrawHp();
    this.hpBar.setVisible(this.showHp);
    this.hpText.setVisible(this.showHp);
    this.cdBadge.setVisible(this.showBadges && this.hasSpecial);
    this.moveGlyph.setVisible(this.showBadges);
  }

  /** Вид уничтожен (Phaser обнуляет scene в destroy). */
  get alive(): boolean {
    return !!this.scene;
  }

  setHp(hp: number, maxHp: number): void {
    this.hp = Math.max(0, hp);
    this.maxHp = Math.max(1, maxHp);
    if (!this.scene) return;
    this.redrawHp();
  }

  getHp(): number {
    return this.hp;
  }

  setCd(cd: number): void {
    if (!this.scene) return;
    this.cdText.setText(String(cd));
    this.cdText.setColor(cd <= 0 ? '#ffd166' : '#ffffff');
    this.cdBg.setTint(cd <= 0 ? 0x7a5c00 : 0x222222);
  }

  setActed(acted: boolean): void {
    this.setAlpha(acted ? 0.45 : 1);
  }

  /** Короткая белая вспышка при попадании. */
  hitFlash(duration: number): void {
    if (!this.scene) return;
    this.disc.setTintFill(0xffffff);
    this.emoji.setAlpha(0.2);
    this.scene.time.delayedCall(duration, () => {
      if (!this.scene) return;
      this.disc.setTint(this.furColor);
      this.emoji.setAlpha(1);
    });
  }

  private redrawHp(): void {
    if (!this.scene) return;
    const g = this.hpBar;
    g.clear();
    if (!this.showHp) return;
    const w = this.size * 0.78;
    const h = Math.max(3, this.size * 0.09);
    const x = -w / 2;
    const y = this.size * 0.36;
    const pct = Math.max(0, Math.min(1, this.hp / this.maxHp));
    g.fillStyle(0x000000, 0.7);
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(0x333333, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(hpColor(pct), 1);
    g.fillRect(x, y, w * pct, h);
    this.hpText.setText(String(this.hp));
  }
}
