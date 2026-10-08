import Phaser from 'phaser';
import type { BattleState, Pos, TerrainId } from '@core/types';
import { MAP_H, MAP_W, posKey } from '@core/types';
import { terrainAt } from '@core/battle/query';
import { biomeDef } from '@content/biomes';
import { $save } from '@state/save';
import { $battleUi, tapTile, type BattleUiState } from '@state/battleUi';
import { computeLayout, pixelToGrid, tileCenter, tileOrigin, type BoardLayout } from './layout';
import { ensureTextures } from './textures';
import { HL, TERRAIN_GLYPH, textStyle } from './style';
import { UnitView } from './UnitView';
import { bloodDecal, sceneAlive } from './fx';
import { ensureTileTextures, ensureUnitTextures, hasTexture, tileTexKey, withTimeout } from './svgTextures';

export const MAP_SCENE_KEY = 'Map';

export class MapScene extends Phaser.Scene {
  layout: BoardLayout = computeLayout(360, 480);
  readonly units = new Map<string, UnitView>();
  /** true, пока Presenter проигрывает события — автосинхронизация со стором откладывается. */
  playing = false;
  readonly ready: Promise<void>;
  private resolveReady: () => void = () => {};

  private tilesG!: Phaser.GameObjects.Graphics;
  private tileLayer!: Phaser.GameObjects.Container;
  private glyphs: Phaser.GameObjects.Text[] = [];
  private wallTexts = new Map<string, Phaser.GameObjects.Text>();
  private decalLayer!: Phaser.GameObjects.Container;
  private hlG!: Phaser.GameObjects.Graphics;
  private pathG!: Phaser.GameObjects.Graphics;
  private ghost: UnitView | null = null;
  private ghostKey = '';
  private marker: Phaser.GameObjects.Rectangle | null = null;
  private markerTween: Phaser.Tweens.Tween | null = null;
  private unsubSave: (() => void) | null = null;
  private unsubUi: (() => void) | null = null;
  private pendingSync = false;
  private lastMapRef: BattleState['map'] | null = null;
  private lastLayoutKey = '';
  private decalCount = -1;

  constructor() {
    super(MAP_SCENE_KEY);
    this.ready = new Promise((r) => {
      this.resolveReady = r;
    });
  }

  create(): void {
    ensureTextures(this);
    this.tileLayer = this.add.container(0, 0).setDepth(0);
    this.tilesG = this.add.graphics().setDepth(0.2);
    this.decalLayer = this.add.container(0, 0).setDepth(1);
    this.hlG = this.add.graphics().setDepth(2);
    this.pathG = this.add.graphics().setDepth(3);
    this.relayout();

    this.unsubSave = $save.subscribe(() => {
      this.pendingSync = true;
    });
    this.unsubUi = $battleUi.subscribe((ui) => this.drawHighlights(ui));

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if ($battleUi.get().busy) return;
      const dx = p.upX - p.downX;
      const dy = p.upY - p.downY;
      if (Math.hypot(dx, dy) > 14) return;
      const pos = pixelToGrid(this.layout, p.upX, p.upY);
      if (pos) tapTile(pos);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);

    // Сначала растеризуем арт (тайлы биома и миниатюры всех бойцов), чтобы первый кадр уже был с графикой.
    const st = $save.get().battle;
    void withTimeout(this.preloadArt(st), 2500).then(() => {
      if (!sceneAlive(this)) return;
      const cur = $save.get().battle;
      this.lastMapRef = null;
      if (cur) this.syncFromState(cur);
      this.pendingSync = false;
      this.resolveReady();
    });
  }

  /** Текстуры тайлов биома и миниатюр живых юнитов (размер карты). */
  private preloadArt(st: BattleState | undefined): Promise<unknown> {
    if (!st) return Promise.resolve();
    const jobs: Promise<unknown>[] = [ensureTileTextures(this, st.map.biomeId)];
    for (const bu of Object.values(st.units)) {
      if (!bu.alive) continue;
      const unit = st.roster[bu.unitId];
      if (unit) jobs.push(ensureUnitTextures(this, unit, 'map'));
    }
    return Promise.all(jobs);
  }

  override update(): void {
    if (this.pendingSync && !this.playing) {
      this.pendingSync = false;
      const st = $save.get().battle;
      if (st) this.syncFromState(st);
    }
  }

  private cleanup(): void {
    this.unsubSave?.();
    this.unsubUi?.();
    this.unsubSave = null;
    this.unsubUi = null;
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }

  private onResize(): void {
    this.relayout();
    const st = $save.get().battle;
    if (!st) return;
    if (this.playing) {
      // Во время проигрывания событий нельзя пересоздавать/уничтожать виды юнитов:
      // презентер держит на них ссылки. Перерисовываем поле и двигаем существующие виды.
      this.pendingSync = true;
      this.lastMapRef = st.map;
      this.drawTiles(st);
      this.syncDecals(st);
      for (const bu of Object.values(st.units)) {
        const v = this.units.get(bu.unitId);
        if (!v || !v.scene) continue;
        const c = this.center(bu.pos);
        v.setPosition(c.x, c.y);
      }
      this.drawHighlights($battleUi.get());
      return;
    }
    this.lastMapRef = null;
    this.syncFromState(st);
    this.drawHighlights($battleUi.get());
  }

  private relayout(): void {
    this.layout = computeLayout(this.scale.width, this.scale.height);
    const key = `${this.layout.tile}:${this.layout.ox}:${this.layout.oy}`;
    if (key !== this.lastLayoutKey) {
      this.lastLayoutKey = key;
      this.lastMapRef = null;
      this.decalCount = -1;
      for (const v of this.units.values()) v.resize(this.layout.tile);
    }
  }

  /* ---------- Публичные помощники для Presenter ---------- */

  center(pos: Pos): { x: number; y: number } {
    return tileCenter(this.layout, pos);
  }

  get tile(): number {
    return this.layout.tile;
  }

  /** Полная синхронизация визуала с состоянием боя. */
  syncFromState(st: BattleState): void {
    if (st.map !== this.lastMapRef) {
      this.lastMapRef = st.map;
      this.drawTiles(st);
    } else this.updateWalls(st);
    this.syncDecals(st);
    const alive = new Set<string>();
    for (const bu of Object.values(st.units)) {
      if (!bu.alive) continue;
      alive.add(bu.unitId);
      const view = this.ensureUnitView(bu.unitId, st);
      if (!view) continue;
      const c = this.center(bu.pos);
      view.setPosition(c.x, c.y);
      view.setDepth(10 + bu.pos.y * 0.01);
      view.setHp(bu.hp, bu.maxHp);
      view.setCd(bu.specialCd);
      view.setActed(bu.acted && st.phase === bu.side);
      view.setScale(1);
      view.setAngle(0);
      view.setAlpha(bu.acted && st.phase === bu.side ? 0.45 : 1);
    }
    for (const [id, view] of this.units) {
      if (!alive.has(id)) {
        view.destroy();
        this.units.delete(id);
      }
    }
  }

  ensureUnitView(unitId: string, st: BattleState): UnitView | null {
    let view = this.units.get(unitId);
    if (view) return view;
    const unit = st.roster[unitId];
    const bu = st.units[unitId];
    if (!unit || !bu) return null;
    view = new UnitView(this, unit, bu.side, { size: this.layout.tile });
    const c = this.center(bu.pos);
    view.setPosition(c.x, c.y);
    view.setDepth(10 + bu.pos.y * 0.01);
    view.setHp(bu.hp, bu.maxHp);
    view.setCd(bu.specialCd);
    this.units.set(unitId, view);
    return view;
  }

  removeUnitView(unitId: string): void {
    const v = this.units.get(unitId);
    if (v) {
      v.destroy();
      this.units.delete(unitId);
    }
  }

  addDecal(pos: Pos, kind: 'splat' | 'pool', seed: number): void {
    const c = this.center(pos);
    const img = bloodDecal(this, c.x + (kind === 'splat' ? ((seed % 7) - 3) * 2 : 0), c.y + (kind === 'splat' ? ((seed % 5) - 2) * 2 : this.tile * 0.15), this.tile, kind, seed);
    this.decalLayer.add(img);
    if (kind === 'pool') this.decalCount++;
  }

  setWallHp(pos: Pos, hp: number): void {
    const t = this.wallTexts.get(posKey(pos));
    if (t) t.setText(hp > 0 ? String(hp) : '');
  }

  shakeTile(pos: Pos): void {
    const t = this.wallTexts.get(posKey(pos));
    if (!t) return;
    const x = t.x;
    this.tweens.add({ targets: t, x: x + 3, duration: 40, yoyo: true, repeat: 3, onComplete: () => t.setX(x) });
  }

  /* ---------- Рисование ---------- */

  private drawTiles(st: BattleState): void {
    const biome = biomeDef(st.map.biomeId);
    this.cameras.main.setBackgroundColor(biome.bg);
    const g = this.tilesG;
    g.clear();
    this.tileLayer.removeAll(true);
    for (const t of this.glyphs) t.destroy();
    this.glyphs = [];
    for (const t of this.wallTexts.values()) t.destroy();
    this.wallTexts.clear();
    const l = this.layout;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const pos = { x, y };
        const terrain: TerrainId = terrainAt(st, pos);
        const o = tileOrigin(l, pos);
        const texKey = tileTexKey(st.map.biomeId, terrain);
        const hasArt = hasTexture(this, texKey);
        if (hasArt) {
          const img = this.add.image(o.x, o.y, texKey).setOrigin(0, 0).setDisplaySize(l.tile, l.tile);
          this.tileLayer.add(img);
        } else {
          g.fillStyle(biome.colors[terrain], 1);
          g.fillRect(o.x, o.y, l.tile, l.tile);
        }
        g.lineStyle(1, 0x000000, 0.18);
        g.strokeRect(o.x + 0.5, o.y + 0.5, l.tile - 1, l.tile - 1);
        const glyph = hasArt ? undefined : TERRAIN_GLYPH[terrain];
        if (glyph) {
          const c = tileCenter(l, pos);
          const txt = this.add.text(c.x, c.y, glyph, textStyle(l.tile * 0.42, '#ffffff', true, 0)).setOrigin(0.5).setAlpha(0.45).setDepth(0.5);
          this.glyphs.push(txt);
        }
        if (st.map.tiles[y]?.[x] === 'wall_breakable') {
          const c = tileCenter(l, pos);
          const hp = st.walls[posKey(pos)] ?? 0;
          const t = this.add.text(c.x + l.tile * 0.3, c.y - l.tile * 0.3, hp > 0 ? String(hp) : '', textStyle(l.tile * 0.22, '#ffd166', true, 3)).setOrigin(0.5).setDepth(0.6);
          this.wallTexts.set(posKey(pos), t);
        }
      }
    }
    // Разделитель зон спавна
    g.lineStyle(2, 0xffffff, 0.08);
    g.strokeRect(l.ox, l.oy, l.tile * MAP_W, l.tile * MAP_H);
  }

  private updateWalls(st: BattleState): void {
    let changed = false;
    for (const [key, t] of this.wallTexts) {
      const hp = st.walls[key] ?? 0;
      const txt = hp > 0 ? String(hp) : '';
      if (t.text !== txt) {
        t.setText(txt);
        if (hp <= 0) changed = true;
      }
    }
    if (changed) {
      this.lastMapRef = st.map;
      this.drawTiles(st);
    }
  }

  private syncDecals(st: BattleState): void {
    const pools = st.decals.filter((d) => d.kind === 'pool');
    if (pools.length === this.decalCount) return;
    this.decalLayer.removeAll(true);
    pools.forEach((d, i) => {
      const c = this.center(d.pos);
      this.decalLayer.add(bloodDecal(this, c.x, c.y + this.tile * 0.15, this.tile, 'pool', i + d.pos.x * 3 + d.pos.y * 7));
    });
    this.decalCount = pools.length;
  }

  private fillTile(g: Phaser.GameObjects.Graphics, key: string, color: number, alpha: number): void {
    const [xs, ys] = key.split(',');
    const x = Number(xs);
    const y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const o = tileOrigin(this.layout, { x, y });
    g.fillStyle(color, alpha);
    g.fillRect(o.x + 1, o.y + 1, this.layout.tile - 2, this.layout.tile - 2);
  }

  private hatchTile(g: Phaser.GameObjects.Graphics, key: string, color: number): void {
    const [xs, ys] = key.split(',');
    const x = Number(xs);
    const y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const o = tileOrigin(this.layout, { x, y });
    const t = this.layout.tile;
    g.lineStyle(2, color, 0.5);
    for (let d = -t; d < t; d += t / 3) {
      const x1 = Math.max(o.x, o.x + d);
      const y1 = o.y + Math.max(0, -d);
      const x2 = Math.min(o.x + t, o.x + d + t);
      const y2 = o.y + Math.min(t, t - d);
      if (x2 > x1) g.lineBetween(x1, y1, x2, y2);
    }
  }

  /** Стрелка движения в стиле FEH: от текущей клетки через центры клеток пути до клетки назначения. */
  private drawPathArrow(g: Phaser.GameObjects.Graphics, path: Pos[]): void {
    const t = this.tile;
    const pts = path.map((p) => this.center(p));
    const n = pts.length;
    const last = pts[n - 1];
    const prev = pts[n - 2];
    if (!last || !prev) return;
    const dx = Math.sign(last.x - prev.x);
    const dy = Math.sign(last.y - prev.y);
    const headLen = t * 0.34;
    const headHalf = t * 0.2;
    const tip = { x: last.x + dx * t * 0.16, y: last.y + dy * t * 0.16 };
    const base = { x: tip.x - dx * headLen, y: tip.y - dy * headLen };
    const body = [...pts.slice(0, n - 1), base];
    const nx = -dy;
    const ny = dx;

    const pass = (width: number, color: number, alpha: number, pad: number): void => {
      g.lineStyle(width, color, alpha);
      g.beginPath();
      const first = body[0];
      if (!first) return;
      g.moveTo(first.x, first.y);
      for (let i = 1; i < body.length; i++) {
        const b = body[i];
        if (b) g.lineTo(b.x, b.y);
      }
      g.strokePath();
      g.fillStyle(color, alpha);
      // скругляем стыки и начало
      for (let i = 0; i < body.length - 1; i++) {
        const b = body[i];
        if (b) g.fillCircle(b.x, b.y, width / 2);
      }
      // наконечник
      const hl = headLen + pad;
      const hh = headHalf + pad;
      const tipX = tip.x + dx * pad;
      const tipY = tip.y + dy * pad;
      const bx = tipX - dx * hl;
      const by = tipY - dy * hl;
      g.fillTriangle(tipX, tipY, bx + nx * hh, by + ny * hh, bx - nx * hh, by - ny * hh);
    };
    pass(Math.max(6, t * 0.3), 0x0d1b2a, 0.85, Math.max(2, t * 0.05)); // контур
    pass(Math.max(3, t * 0.17), HL.path, 0.95, 0); // заливка
    // маркер старта
    const start = pts[0];
    if (start) {
      g.lineStyle(Math.max(2, t * 0.05), 0x0d1b2a, 0.85);
      g.strokeCircle(start.x, start.y, t * 0.22);
      g.lineStyle(Math.max(1, t * 0.03), HL.path, 0.95);
      g.strokeCircle(start.x, start.y, t * 0.22);
    }
  }

  private drawHighlights(ui: BattleUiState): void {
    if (!this.hlG) return;
    const g = this.hlG;
    g.clear();
    const pg = this.pathG;
    pg.clear();

    if (ui.dangerOn) {
      for (const k of ui.dangerTiles) {
        this.fillTile(g, k, HL.danger, 0.22);
        this.hatchTile(g, k, HL.danger);
      }
    }
    if (ui.infoThreat) for (const k of ui.infoThreat) this.fillTile(g, k, HL.threat, 0.3);
    if (ui.reach && ui.mode !== 'idle' && ui.mode !== 'enemyInfo' && ui.mode !== 'busy') {
      for (const node of ui.reach.values()) if (node.canStop) this.fillTile(g, posKey(node.pos), HL.reach, 0.35);
      if (ui.attackTiles) for (const k of ui.attackTiles) this.fillTile(g, k, HL.attack, 0.4);
      if (ui.assistTiles) for (const k of ui.assistTiles) this.fillTile(g, k, HL.assist, 0.4);
    }
    if (ui.path && ui.path.length > 1) this.drawPathArrow(pg, ui.path);

    // Призрак на клетке назначения
    const st = $save.get().battle;
    const ghostKey = ui.selectedId && ui.movedTo && st ? `${ui.selectedId}@${posKey(ui.movedTo)}` : '';
    if (ghostKey !== this.ghostKey) {
      this.ghost?.destroy();
      this.ghost = null;
      this.ghostKey = ghostKey;
      if (ghostKey && ui.selectedId && ui.movedTo && st) {
        const unit = st.roster[ui.selectedId];
        const bu = st.units[ui.selectedId];
        if (unit && bu && !(bu.pos.x === ui.movedTo.x && bu.pos.y === ui.movedTo.y)) {
          this.ghost = new UnitView(this, unit, bu.side, { size: this.tile, showHp: false, showBadges: false });
          const c = this.center(ui.movedTo);
          this.ghost.setPosition(c.x, c.y).setAlpha(0.5).setDepth(11);
        }
      }
    }

    // Маркер цели
    let markerPos: Pos | null = null;
    if (ui.targetId && st) {
      const t = st.units[ui.targetId];
      if (t) markerPos = t.pos;
    } else if (ui.wallPos) markerPos = ui.wallPos;
    if (markerPos) {
      const c = this.center(markerPos);
      if (!this.marker) {
        this.marker = this.add.rectangle(c.x, c.y, this.tile - 4, this.tile - 4).setStrokeStyle(3, 0xffffff, 1).setDepth(12);
        this.markerTween = this.tweens.add({ targets: this.marker, scale: 1.12, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else this.marker.setPosition(c.x, c.y).setSize(this.tile - 4, this.tile - 4).setVisible(true);
    } else if (this.marker) {
      this.markerTween?.destroy();
      this.marker.destroy();
      this.marker = null;
      this.markerTween = null;
    }
  }
}
