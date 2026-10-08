import { beforeEach, describe, expect, it } from 'vitest';
import { $save } from '@state/save';
import { $battleUi, beginDrag, cancel, chooseAttack, chooseMove, dragHover, endDrag, enterBattleScreen, isDisplaced, tapTile, waitHere } from '@state/battleUi';
import { createEmptySave } from '@core/save';
import { makeBattle } from './helpers';

const flat = { hp: 20, atk: 10, spd: 5, def: 5, res: 5 };

function setup(enemyPos = { x: 2, y: 2 }) {
  const b = makeBattle(
    [
      { classId: 'infantry_claw', pos: { x: 2, y: 7 }, baseStats: flat },
      { classId: 'infantry_bandage', pos: { x: 3, y: 7 }, baseStats: flat },
    ],
    [{ classId: 'infantry_claw', pos: enemyPos, baseStats: flat, stance: 'hold' }],
  );
  const save = createEmptySave(1);
  save.battle = b.state;
  $save.set(save);
  enterBattleScreen();
  return b;
}

describe('контроллер боя: контекстное меню', () => {
  beforeEach(() => setup());

  it('тап по юниту без врага рядом: только передвижение и ожидание', () => {
    setup({ x: 2, y: 0 });
    tapTile({ x: 2, y: 7 });
    const ui = $battleUi.get();
    expect(ui.mode).toBe('unitSelected');
    expect(ui.actions.move).toBe(true);
    expect(ui.actions.wait).toBe(true);
    expect(ui.actions.attack).toBe(false);
    expect(ui.actions.items).toBe(false);
  });

  it('тап по юниту с врагом в досягаемости: доступна атака', () => {
    const b = setup({ x: 2, y: 4 });
    tapTile({ x: 2, y: 7 });
    expect($battleUi.get().actions.attack).toBe(true);
    chooseAttack();
    // единственная цель → сразу прогноз
    expect($battleUi.get().mode).toBe('forecast');
    expect($battleUi.get().targetId).toBe(b.enemies[0]!.id);
  });

  it('«Передвинуться» → клетка → меню для новой клетки, отмена возвращает', () => {
    setup({ x: 2, y: 0 });
    tapTile({ x: 2, y: 7 });
    chooseMove();
    expect($battleUi.get().mode).toBe('moveTargeting');
    tapTile({ x: 2, y: 5 });
    const ui = $battleUi.get();
    expect(ui.mode).toBe('movedPreview');
    expect(ui.movedTo).toEqual({ x: 2, y: 5 });
    expect(ui.path?.length).toBe(3);
    expect(isDisplaced(ui)).toBe(true);
    cancel();
    expect($battleUi.get().mode).toBe('unitSelected');
    expect($battleUi.get().movedTo).toBeUndefined();
  });

  it('повторный тап по себе открывает меню на месте, ждать — завершает действие', async () => {
    const b = setup({ x: 2, y: 0 });
    tapTile({ x: 2, y: 7 });
    tapTile({ x: 2, y: 7 });
    expect($battleUi.get().mode).toBe('movedPreview');
    await waitHere();
    expect($battleUi.get().mode).toBe('idle');
    expect($save.get().battle?.units[b.players[0]!.id]?.acted).toBe(true);
  });
});

describe('контроллер боя: перетаскивание', () => {
  it('взять → тащить по клеткам → отпустить на валидной клетке', () => {
    const b = setup({ x: 2, y: 0 });
    const id = b.players[0]!.id;
    expect(beginDrag(id)).toBe(true);
    let ui = $battleUi.get();
    expect(ui.dragging).toBe(true);
    expect(ui.mode).toBe('moveTargeting');
    dragHover({ x: 2, y: 6 });
    ui = $battleUi.get();
    expect(ui.dragValid).toBe(true);
    expect(ui.path).toEqual([{ x: 2, y: 7 }, { x: 2, y: 6 }]);
    dragHover({ x: 0, y: 0 });
    ui = $battleUi.get();
    expect(ui.dragValid).toBe(false);
    expect(ui.path).toBeUndefined();
    expect(endDrag({ x: 1, y: 6 })).toBe(true);
    ui = $battleUi.get();
    expect(ui.dragging).toBe(false);
    expect(ui.mode).toBe('movedPreview');
    expect(ui.movedTo).toEqual({ x: 1, y: 6 });
    expect(ui.actions.wait).toBe(true);
  });

  it('отпустить вне досягаемости — юнит возвращается, остаётся выбранным', () => {
    const b = setup({ x: 2, y: 0 });
    beginDrag(b.players[0]!.id);
    expect(endDrag({ x: 5, y: 0 })).toBe(false);
    const ui = $battleUi.get();
    expect(ui.mode).toBe('unitSelected');
    expect(ui.dragging).toBe(false);
    expect(ui.movedTo).toBeUndefined();
  });

  it('отпустить на враге в досягаемости — прогноз атаки с лучшей клетки', () => {
    const b = setup({ x: 2, y: 4 });
    beginDrag(b.players[0]!.id);
    dragHover({ x: 2, y: 4 });
    expect($battleUi.get().dragValid).toBe(true);
    expect(endDrag({ x: 2, y: 4 })).toBe(true);
    const ui = $battleUi.get();
    expect(ui.mode).toBe('forecast');
    expect(ui.targetId).toBe(b.enemies[0]!.id);
    expect(ui.movedTo).toEqual({ x: 2, y: 5 });
  });

  it('нельзя взять врага или уже действовавшего юнита', () => {
    const b = setup({ x: 2, y: 0 });
    expect(beginDrag(b.enemies[0]!.id)).toBe(false);
    const save = $save.get();
    save.battle!.units[b.players[0]!.id]!.acted = true;
    $save.set({ ...save });
    expect(beginDrag(b.players[0]!.id)).toBe(false);
  });
});
