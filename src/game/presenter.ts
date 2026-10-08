import type Phaser from 'phaser';
import type { BattleEvent, BattleState, Pos } from '@core/types';
import { $save } from '@state/save';
import { $battleUi, type Presenter } from '@state/battleUi';
import { haptic } from '@platform/haptics';
import { MAP_SCENE_KEY, MapScene } from './MapScene';
import { CINEMATIC_SCENE_KEY, type CinematicData, type CombatEvent } from './CinematicScene';
import { banner, bloodBurst, floatText, ghostRise, stamp, tween, wait } from './fx';
import { specialDef } from '@content/skills/specials';

/** Проигрывает события боя на сцене карты (и в кинематике). Логики игры не содержит. */
export class GamePresenter implements Presenter {
  private seedCounter = 0;

  constructor(private readonly game: Phaser.Game) {}

  private mapScene(): MapScene | null {
    const s = this.game.scene.getScene(MAP_SCENE_KEY);
    return s instanceof MapScene ? s : null;
  }

  private speed(): number {
    const settings = $save.get().settings;
    return settings.animSpeed * ($battleUi.get().fastForward ? 3 : 1);
  }

  async play(events: BattleEvent[], before: BattleState, after: BattleState): Promise<void> {
    const map = this.mapScene();
    if (!map) return;
    await Promise.race([map.ready, wait(map, 1500)]);
    if (!map.sys.isActive()) return;
    map.playing = true;
    try {
      map.syncFromState(before);
      for (const ev of events) {
        if (!map.sys.isActive()) break;
        await this.handle(ev, before, after, map);
      }
    } catch (e) {
      console.error('presenter', e);
    } finally {
      if (map.sys.isActive()) map.syncFromState(after);
      map.playing = false;
    }
  }

  private async handle(ev: BattleEvent, before: BattleState, after: BattleState, map: MapScene): Promise<void> {
    const sp = this.speed();
    switch (ev.type) {
      case 'moved':
        return this.moved(ev.unitId, ev.path, map, sp);
      case 'combat':
        return this.combat(ev, before, after, map, sp);
      case 'died':
        return this.died(ev.unitId, ev.pos, ev.side, after, map, sp);
      case 'effect':
        return this.effect(ev, map, sp);
      case 'assist':
        return this.assist(ev, after, map, sp);
      case 'wallHit': {
        map.shakeTile(ev.pos);
        map.setWallHp(ev.pos, ev.hpAfter);
        const c = map.center(ev.pos);
        floatText(map, c.x, c.y - map.tile * 0.3, ev.hpAfter > 0 ? 'Хрясь!' : 'Сломано!', '#ffd166', sp, { size: map.tile * 0.3 });
        const view = map.units.get(ev.unitId);
        if (view) {
          const ox = view.x;
          const oy = view.y;
          await tween(map, { targets: view, x: ox + (c.x - ox) * 0.3, y: oy + (c.y - oy) * 0.3, duration: 120 / sp, yoyo: true });
        }
        haptic('light');
        return wait(map, 150 / sp);
      }
      case 'phaseChanged':
        return banner(map, ev.phase === 'player' ? `ХОД ${ev.turn} · ВАША ФАЗА` : `ХОД ${ev.turn} · ФАЗА ВРАГА`, ev.phase === 'player' ? 0x1d4ed8 : 0x9b1c31, sp);
      case 'reinforcements': {
        await banner(map, 'ПОДКРЕПЛЕНИЕ!', 0x7a1f1f, sp, 300);
        for (const id of ev.unitIds) {
          const view = map.ensureUnitView(id, after);
          if (!view) continue;
          view.setScale(0);
          this.tweenNoWait(map, { targets: view, scale: 1, duration: 260 / sp, ease: 'Back.easeOut' });
        }
        return wait(map, 300 / sp);
      }
      case 'levelUp': {
        const view = map.units.get(ev.unitId);
        if (view) {
          floatText(map, view.x, view.y - map.tile * 0.6, 'LV UP!', '#ffd166', sp, { size: map.tile * 0.34, rise: 30, duration: 800 });
          haptic('success');
          return wait(map, 350 / sp);
        }
        return;
      }
      case 'xp':
        return;
      case 'waited':
        return wait(map, 60 / sp);
      case 'battleEnded': {
        const text = ev.result === 'victory' ? 'ПОБЕДА' : ev.result === 'defeat' ? 'ПОРАЖЕНИЕ' : 'ОТСТУПЛЕНИЕ';
        const color = ev.result === 'victory' ? '#ffd166' : ev.result === 'defeat' ? '#ff4d6d' : '#cccccc';
        haptic(ev.result === 'victory' ? 'success' : 'warning');
        return stamp(map, map.scale.width / 2, map.scale.height * 0.45, text, color, Math.min(44, map.scale.width * 0.12), sp, 800);
      }
    }
  }

  private tweenNoWait(scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig): void {
    if (scene.sys.isActive()) scene.tweens.add(cfg);
  }

  private async moved(unitId: string, path: Pos[], map: MapScene, sp: number): Promise<void> {
    const view = map.units.get(unitId);
    if (!view || path.length < 2) return;
    view.setAlpha(1);
    view.setRunning(true);
    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      const prev = path[i - 1];
      if (!p) continue;
      if (prev && p.x !== prev.x) view.setFacing(p.x > prev.x ? 1 : -1);
      const c = map.center(p);
      view.setDepth(10 + p.y * 0.01);
      await tween(map, { targets: view, x: c.x, y: c.y, duration: 120 / sp, ease: 'Linear' });
    }
    view.setRunning(false);
  }

  /** Повернуть двух бойцов лицом друг к другу (по горизонтали). */
  private faceEachOther(a: { x: number; setFacing(d: 1 | -1): void }, b: { x: number; setFacing(d: 1 | -1): void }): void {
    if (a.x === b.x) return;
    a.setFacing(b.x > a.x ? 1 : -1);
    b.setFacing(a.x > b.x ? 1 : -1);
  }

  private useCinematic(ev: CombatEvent, before: BattleState): boolean {
    const mode = $save.get().settings.cinematic;
    if (mode === 'never') return false;
    if (mode === 'always') return true;
    return before.units[ev.attackerId]?.side === 'player';
  }

  private async combat(ev: CombatEvent, before: BattleState, after: BattleState, map: MapScene, sp: number): Promise<void> {
    const aView = map.units.get(ev.attackerId);
    const dView = map.units.get(ev.defenderId);
    if (!aView || !dView) return;
    this.faceEachOther(aView, dView);
    if (this.useCinematic(ev, before)) {
      await this.runCinematic(ev, before, after, map, sp);
      if (!map.sys.isActive() || !aView.scene || !dView.scene) return;
      aView.setPose('idle');
      dView.setPose('idle');
      // Дублируем итог на карте
      const dealtToD = ev.defenderHpBefore - ev.defenderHpAfter;
      const dealtToA = ev.attackerHpBefore - ev.attackerHpAfter;
      if (dealtToD > 0) {
        floatText(map, dView.x, dView.y - map.tile * 0.5, String(dealtToD), '#fff', sp, { size: map.tile * 0.36 });
        map.addDecal(ev.defenderPos, 'splat', this.seedCounter++);
      }
      if (dealtToA > 0) {
        floatText(map, aView.x, aView.y - map.tile * 0.5, String(dealtToA), '#fff', sp, { size: map.tile * 0.36 });
        map.addDecal(ev.attackerPos, 'splat', this.seedCounter++);
      }
      aView.setHp(ev.attackerHpAfter, before.units[ev.attackerId]?.maxHp ?? 1);
      dView.setHp(ev.defenderHpAfter, before.units[ev.defenderId]?.maxHp ?? 1);
      return wait(map, 120 / sp);
    }
    // Быстрый режим на карте
    const aMax = before.units[ev.attackerId]?.maxHp ?? 1;
    const dMax = before.units[ev.defenderId]?.maxHp ?? 1;
    for (const strike of ev.strikes) {
      const atk = strike.attackerId === ev.attackerId ? aView : dView;
      const def = strike.attackerId === ev.attackerId ? dView : aView;
      const defMax = strike.attackerId === ev.attackerId ? dMax : aMax;
      const ox = atk.x;
      const oy = atk.y;
      const dx = def.x - ox;
      const dy = def.y - oy;
      const len = Math.hypot(dx, dy) || 1;
      if (strike.special) {
        floatText(map, atk.x, atk.y - map.tile * 0.7, specialDef(strike.special).name, '#ffd166', sp, { size: map.tile * 0.26, rise: 20 });
        haptic('heavy');
      } else haptic('medium');
      atk.setPose('run');
      await tween(map, { targets: atk, x: ox + (dx / len) * map.tile * 0.35, y: oy + (dy / len) * map.tile * 0.35, duration: 100 / sp, ease: 'Quad.easeIn' });
      def.hitFlash(160 / sp);
      map.cameras.main.shake(90 / sp, (strike.special ? 6 : 3) / map.scale.width);
      const color = strike.damage === 0 ? '#bbbbbb' : strike.special ? '#ffd166' : strike.effective ? '#ff6b6b' : '#ffffff';
      floatText(map, def.x, def.y - map.tile * 0.5, strike.damage === 0 ? 'Хлоп!' : String(strike.damage), color, sp, { size: map.tile * (strike.special ? 0.4 : 0.34) });
      if (strike.damage > 0) {
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        bloodBurst(map, def.x, def.y, 10, { min: ang - 40, max: ang + 40 }, 0.7, sp);
        if (strike.defenderId === ev.defenderId) map.addDecal(ev.defenderPos, 'splat', this.seedCounter++);
        else map.addDecal(ev.attackerPos, 'splat', this.seedCounter++);
      }
      if (strike.healed > 0) floatText(map, atk.x, atk.y - map.tile * 0.5, `+${strike.healed}`, '#80ed99', sp, { size: map.tile * 0.3 });
      if (strike.miracle) floatText(map, def.x, def.y - map.tile * 0.8, '1 HP!', '#ffd700', sp, { size: map.tile * 0.3 });
      def.setHp(strike.defenderHpAfter, defMax);
      atk.setHp(strike.attackerHpAfter, strike.attackerId === ev.attackerId ? aMax : dMax);
      await tween(map, { targets: atk, x: ox, y: oy, duration: 100 / sp, ease: 'Quad.easeOut' });
      atk.setPose('idle');
      await wait(map, 90 / sp);
    }
  }

  private runCinematic(ev: CombatEvent, before: BattleState, after: BattleState, map: MapScene, sp: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const data: CinematicData = { event: ev, before, after, speed: sp, resolve };
      // Зум камеры карты к цели перед переходом
      const c = map.center(ev.defenderPos);
      map.cameras.main.pan(c.x, c.y, 150 / sp, 'Sine.easeInOut');
      map.cameras.main.zoomTo(1.15, 150 / sp, 'Sine.easeInOut', false, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
        if (progress >= 1) {
          map.scene.launch(CINEMATIC_SCENE_KEY, data);
          map.scene.bringToTop(CINEMATIC_SCENE_KEY);
        }
      });
    }).then(() => {
      if (!map.sys.isActive()) return;
      map.cameras.main.zoomTo(1, 120 / sp);
      map.cameras.main.pan(map.scale.width / 2, map.scale.height / 2, 120 / sp);
      return wait(map, 130 / sp);
    });
  }

  private async died(unitId: string, pos: Pos, side: 'player' | 'enemy', after: BattleState, map: MapScene, sp: number): Promise<void> {
    const view = map.units.get(unitId);
    const unit = after.roster[unitId];
    const c = map.center(pos);
    if (side === 'player') haptic('error');
    if (view) {
      view.setDead();
      bloodBurst(map, view.x, view.y, 50, null, 1.1, sp);
      map.cameras.main.shake(160 / sp, 0.012);
      await tween(map, { targets: view, angle: side === 'player' ? -90 : 90, y: view.y + map.tile * 0.2, alpha: 0.9, duration: 350 / sp, ease: 'Bounce.easeOut' });
    }
    map.addDecal(pos, 'pool', pos.x * 3 + pos.y * 7 + this.seedCounter++);
    const word = side === 'player' ? (unit?.gender === 'f' ? 'ПАЛА' : 'ПАЛ') : unit?.gender === 'f' ? 'ГОТОВА' : 'ГОТОВ';
    const ghost = ghostRise(map, c.x, c.y - map.tile * 0.2, map.tile, sp);
    if (view) this.tweenNoWait(map, { targets: view, alpha: 0, duration: 300 / sp, delay: 150 / sp });
    await stamp(map, c.x, c.y - map.tile * 0.9, word, side === 'player' ? '#ff4d6d' : '#f1f1f1', Math.max(14, map.tile * 0.42), sp, side === 'player' ? 500 : 250);
    await ghost;
    map.removeUnitView(unitId);
  }

  private async effect(ev: Extract<BattleEvent, { type: 'effect' }>, map: MapScene, sp: number): Promise<void> {
    const view = map.units.get(ev.effect.unitId);
    if (!view) return;
    switch (ev.effect.type) {
      case 'heal':
        floatText(map, view.x, view.y - map.tile * 0.5, `+${ev.effect.amount}`, '#80ed99', sp, { size: map.tile * 0.32 });
        if (ev.hpAfter !== undefined) view.setHp(ev.hpAfter, view.getHp() > ev.hpAfter ? view.getHp() : Math.max(ev.hpAfter, view.getHp()));
        break;
      case 'damage':
        floatText(map, view.x, view.y - map.tile * 0.5, `−${ev.effect.amount}`, '#ffffff', sp, { size: map.tile * 0.32 });
        bloodBurst(map, view.x, view.y, 6, null, 0.5, sp);
        break;
      case 'buff':
        floatText(map, view.x + map.tile * 0.25, view.y - map.tile * 0.4, '▲', '#80ed99', sp, { size: map.tile * 0.3, rise: 18, duration: 400 });
        break;
      case 'debuff':
        floatText(map, view.x + map.tile * 0.25, view.y - map.tile * 0.4, '▼', '#c77dff', sp, { size: map.tile * 0.3, rise: 18, duration: 400 });
        break;
      case 'flag':
        return;
    }
    return wait(map, 90 / sp);
  }

  private async assist(ev: Extract<BattleEvent, { type: 'assist' }>, after: BattleState, map: MapScene, sp: number): Promise<void> {
    const moves = ev.moves.map((m) => {
      const view = map.units.get(m.unitId);
      if (!view) return Promise.resolve();
      const c = map.center(m.to);
      view.setDepth(10 + m.to.y * 0.01);
      return tween(map, { targets: view, x: c.x, y: c.y, duration: 180 / sp, ease: 'Sine.easeInOut' });
    });
    await Promise.all(moves);
    const target = map.units.get(ev.targetId);
    const actor = map.units.get(ev.unitId);
    if (target && ev.heal > 0) {
      floatText(map, target.x, target.y - map.tile * 0.5, `+${ev.heal}`, '#80ed99', sp, { size: map.tile * 0.34 });
      const tb = after.units[ev.targetId];
      if (ev.targetHpAfter !== undefined && tb) target.setHp(ev.targetHpAfter, tb.maxHp);
      haptic('light');
    }
    if (actor && ev.unitHpAfter !== undefined) {
      const ab = after.units[ev.unitId];
      if (ab) actor.setHp(ev.unitHpAfter, ab.maxHp);
    }
    if (target && ev.assistId === 'as_purr') {
      floatText(map, target.x, target.y - map.tile * 0.6, '↻ ещё раз!', '#ffd166', sp, { size: map.tile * 0.28 });
      target.setActed(false);
    }
    if (target && ev.assistId.startsWith('as_rally')) floatText(map, target.x, target.y - map.tile * 0.6, '▲', '#80ed99', sp, { size: map.tile * 0.34, rise: 20 });
    return wait(map, 200 / sp);
  }
}
