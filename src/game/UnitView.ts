import Phaser from 'phaser';
import type { Side, UnitInstance } from '@core/types';
import type { Pose } from '@art/index';
import { FUR_PALETTES } from '@content/appearance';
import { classDef } from '@content/classes';
import { weaponDef } from '@content/weapons';
import { TEX } from './textures';
import { MOVE_GLYPH, WEAPON_COLOR_HEX, hexCss, hpColor, textStyle } from './style';
import { ensureUnitTexture, ensureUnitTextures, hasTexture, unitTexKey } from './svgTextures';

export interface UnitViewOptions {
  size: number;
  showHp?: boolean;
  showBadges?: boolean;
}

/** Пропорция текстуры миниатюры (VIEW 120×140). */
const ART_RATIO = 120 / 140;
/** Доля высоты текстуры, где у миниатюры лапы. */
const FEET_Y = 0.97;
const RUN_FRAME_MS = 110;

/**
 * Визуальное представление юнита на карте: SVG-миниатюра (кот/пёс/мышь) с позами,
 * тень цвета оружия, HP, значок спецприёма и глиф движения. До загрузки текстуры — плейсхолдер.
 */
export class UnitView extends Phaser.GameObjects.Container {
  readonly unitId: string;
  readonly side: Side;
  readonly furColor: number;
  readonly weaponColor: number;
  readonly hasSpecial: boolean;

  private readonly unit: UnitInstance;
  private readonly shadow: Phaser.GameObjects.Image;
  private sprite: Phaser.GameObjects.Image | null = null;
  private disc: Phaser.GameObjects.Image | null = null;
  private emoji: Phaser.GameObjects.Text | null = null;
  private readonly moveGlyph: Phaser.GameObjects.Text;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly cdBadge: Phaser.GameObjects.Container;
  private readonly cdBg: Phaser.GameObjects.Image;
  private readonly cdText: Phaser.GameObjects.Text;
  private size = 48;
  private hp = 1;
  private maxHp = 1;
  private showHp: boolean;
  private showBadges: boolean;
  private pose: Pose = 'idle';
  private facing: 1 | -1;
  private dead = false;
  private runTimer: Phaser.Time.TimerEvent | null = null;
  private runFrame = 0;
  private hurtTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, unit: UnitInstance, side: Side, opts: UnitViewOptions) {
    super(scene, 0, 0);
    this.unit = unit;
    this.unitId = unit.id;
    this.side = side;
    this.showHp = opts.showHp ?? true;
    this.showBadges = opts.showBadges ?? true;
    this.facing = side === 'enemy' ? -1 : 1;
    const cls = classDef(unit.classId);
    const weapon = weaponDef(unit.skills.weapon);
    this.furColor = FUR_PALETTES[unit.appearance.furPalette]?.color ?? 0xcccccc;
    this.weaponColor = WEAPON_COLOR_HEX[weapon.color];
    this.hasSpecial = !!unit.skills.special;

    this.shadow = scene.add.image(0, 0, TEX.disc).setTint(this.weaponColor).setAlpha(0.55);
    this.add(this.shadow);

    const idleKey = unitTexKey(unit, 'idle', 'map');
    if (hasTexture(scene, idleKey)) this.attachSprite(idleKey);
    else {
      this.disc = scene.add.image(0, 0, TEX.disc).setTint(this.furColor);
      this.emoji = scene.add.text(0, 0, unit.species === 'cat' ? '🐱' : unit.species === 'dog' ? '🐶' : '🐭', textStyle(24, '#fff', false, 0)).setOrigin(0.5);
      this.add([this.disc, this.emoji]);
      void ensureUnitTextures(scene, unit, 'map').then(() => {
        if (!this.scene || this.sprite) return;
        this.attachSprite(unitTexKey(unit, this.pose, 'map'));
        this.resize(this.size);
      });
    }

    this.moveGlyph = scene.add.text(0, 0, MOVE_GLYPH[cls.moveType], textStyle(10, hexCss(side === 'player' ? 0x8ecae6 : 0xffb4a2), true, 2)).setOrigin(0.5);
    this.hpBar = scene.add.graphics();
    this.hpText = scene.add.text(0, 0, '', textStyle(9, '#fff', true, 2)).setOrigin(1, 0.5);
    this.cdBg = scene.add.image(0, 0, TEX.disc).setTint(0x222222);
    this.cdText = scene.add.text(0, 0, '', textStyle(9, '#ffd166', true, 2)).setOrigin(0.5);
    this.cdBadge = scene.add.container(0, 0, [this.cdBg, this.cdText]);
    this.add([this.moveGlyph, this.hpBar, this.hpText, this.cdBadge]);
    scene.add.existing(this);
    this.resize(opts.size);
  }

  /** Заменить плейсхолдер на миниатюру. */
  private attachSprite(key: string): void {
    if (!this.scene) return;
    const img = this.scene.add.image(0, 0, key).setOrigin(0.5, 0.62);
    img.setFlipX(this.facing < 0);
    this.sprite = img;
    // Спрайт над тенью, под HP/значками.
    this.addAt(img, 1);
    if (this.disc) {
      this.disc.destroy();
      this.disc = null;
    }
    if (this.emoji) {
      this.emoji.destroy();
      this.emoji = null;
    }
  }

  resize(size: number): void {
    this.size = size;
    const feetY = size * 0.36;
    this.shadow.setDisplaySize(size * 0.7, size * 0.25);
    this.shadow.setPosition(0, feetY);
    if (this.sprite) {
      const h = size * 1.05;
      const w = h * ART_RATIO;
      this.sprite.setDisplaySize(w, h);
      // origin 0.62: лапы (0.97 высоты) оказываются чуть ниже центра клетки, у тени.
      this.sprite.setPosition(0, feetY - (FEET_Y - 0.62) * h);
    }
    if (this.disc && this.emoji) {
      const d = size * 0.72;
      this.disc.setDisplaySize(d, d);
      this.emoji.setFontSize(Math.round(size * 0.5));
      this.emoji.setPosition(0, -size * 0.02);
    }
    this.moveGlyph.setFontSize(Math.max(8, Math.round(size * 0.2)));
    this.moveGlyph.setPosition(-size * 0.38, size * 0.32);
    this.hpText.setFontSize(Math.max(8, Math.round(size * 0.18)));
    this.hpText.setPosition(size * 0.44, size * 0.32);
    const badge = size * 0.3;
    this.cdBg.setDisplaySize(badge, badge);
    this.cdText.setFontSize(Math.max(8, Math.round(size * 0.18)));
    this.cdBadge.setPosition(size * 0.36, -size * 0.36);
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

  /** Направление взгляда: 1 — вправо, −1 — влево. */
  setFacing(dir: 1 | -1): void {
    if (!this.scene) return;
    this.facing = dir;
    this.sprite?.setFlipX(dir < 0);
    this.emoji?.setScale(dir < 0 ? -1 : 1, 1);
  }

  /** Сменить позу (текстуру). Если текстура ещё не готова — подгрузить и применить, когда поза всё ещё актуальна. */
  setPose(pose: Pose): void {
    if (!this.scene) return;
    if (this.dead && pose !== 'dead') return;
    this.pose = pose;
    if (!this.sprite) return;
    const key = unitTexKey(this.unit, pose, 'map');
    if (hasTexture(this.scene, key)) {
      this.sprite.setTexture(key);
      this.resize(this.size);
      return;
    }
    void ensureUnitTexture(this.scene, this.unit, pose, 'map').then((k) => {
      if (!this.scene || !this.sprite || this.pose !== pose) return;
      this.sprite.setTexture(k);
      this.resize(this.size);
    });
  }

  /** Анимация бега: чередование idle/run. */
  setRunning(on: boolean): void {
    if (!this.scene) return;
    if (on) {
      if (this.runTimer || this.dead) return;
      this.runFrame = 0;
      this.setPose('run');
      this.runTimer = this.scene.time.addEvent({
        delay: RUN_FRAME_MS,
        loop: true,
        callback: () => {
          if (!this.scene) return;
          this.runFrame = (this.runFrame + 1) % 2;
          this.setPose(this.runFrame === 0 ? 'run' : 'idle');
        },
      });
      return;
    }
    if (this.runTimer) {
      this.runTimer.remove(false);
      this.runTimer = null;
    }
    if (!this.dead) this.setPose('idle');
  }

  /** Поза «больно» на duration мс + короткая белая вспышка. */
  hitFlash(duration: number): void {
    if (!this.scene) return;
    this.hurtTimer?.remove(false);
    this.hurtTimer = null;
    if (!this.dead) this.setPose('hurt');
    const target: Phaser.GameObjects.Image | null = this.sprite ?? this.disc;
    target?.setTintFill(0xffffff);
    this.emoji?.setAlpha(0.2);
    this.scene.time.delayedCall(Math.min(70, duration), () => {
      if (!this.scene) return;
      if (this.sprite) this.sprite.clearTint();
      else this.disc?.setTint(this.furColor);
      this.emoji?.setAlpha(1);
    });
    this.hurtTimer = this.scene.time.delayedCall(duration, () => {
      this.hurtTimer = null;
      if (!this.scene || this.dead) return;
      if (this.runTimer) return;
      this.setPose('idle');
    });
  }

  /** Поза смерти (вращение/падение делает презентер). */
  setDead(): void {
    if (!this.scene) return;
    this.hurtTimer?.remove(false);
    this.hurtTimer = null;
    if (this.runTimer) {
      this.runTimer.remove(false);
      this.runTimer = null;
    }
    this.dead = false;
    this.setPose('dead');
    this.dead = true;
  }

  override destroy(fromScene?: boolean): void {
    this.runTimer?.remove(false);
    this.hurtTimer?.remove(false);
    this.runTimer = null;
    this.hurtTimer = null;
    super.destroy(fromScene);
  }

  private redrawHp(): void {
    if (!this.scene) return;
    const g = this.hpBar;
    g.clear();
    if (!this.showHp) return;
    const w = this.size * 0.78;
    const h = Math.max(3, this.size * 0.09);
    const x = -w / 2;
    const y = this.size * 0.38;
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
