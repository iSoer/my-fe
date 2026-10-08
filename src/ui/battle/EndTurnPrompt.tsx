import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { BattleState } from '@core/types';
import { allPlayerUnitsActed } from '@core/battle/reducer';
import { endTurn, type BattleUiState } from '@state/battleUi';
import { $settings } from '@state/save';
import { haptic } from '@platform/haptics';
import { $endPromptDismissed, endPromptKey } from './endPrompt';

/** Нужно ли предлагать завершить ход: все походили, фаза игрока, ничего не выбрано, автозавершение выключено. */
export function shouldOfferEndTurn(battle: BattleState, ui: BattleUiState, autoEndTurn: boolean, dismissed: string): boolean {
  if (autoEndTurn) return false;
  if (battle.phase !== 'player' || battle.result || ui.busy || ui.mode !== 'idle') return false;
  if (!allPlayerUnitsActed(battle)) return false;
  return dismissed !== endPromptKey(battle.id, battle.turn);
}

/**
 * Автоматическое предложение завершить ход: всплывает над нижней полосой,
 * когда у всех бойцов закончились действия. Один раз за ход.
 */
export function EndTurnPrompt({ battle, ui }: { battle: BattleState; ui: BattleUiState }) {
  const settings = useStore($settings);
  const dismissed = useStore($endPromptDismissed);
  const offer = shouldOfferEndTurn(battle, ui, settings.autoEndTurn, dismissed);
  const [visible, setVisible] = useState(false);

  // Небольшая пауза, чтобы отыграли анимации последнего действия.
  useEffect(() => {
    if (!offer) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => {
      setVisible(true);
      haptic('light');
    }, 450);
    return () => window.clearTimeout(t);
  }, [offer, battle.turn, battle.id]);

  if (!offer || !visible) return null;
  const go = () => {
    haptic('medium');
    void endTurn();
  };
  const later = () => {
    haptic('light');
    $endPromptDismissed.set(endPromptKey(battle.id, battle.turn));
  };
  return (
    <div class="bf-endprompt bf-card" role="dialog" aria-label="Все бойцы походили">
      <div class="bf-endprompt-head">
        <span class="bf-endprompt-ico" aria-hidden="true">
          ✅
        </span>
        <div>
          <div class="bf-endprompt-title">Все бойцы походили</div>
          <div class="bf-endprompt-sub">Передать ход противнику?</div>
        </div>
      </div>
      <div class="bf-endprompt-actions">
        <button type="button" class="bf-pill-btn" onClick={later}>
          Ещё осмотреться
        </button>
        <button type="button" class="bf-pill-btn primary" aria-label="Завершить ход" onClick={go}>
          ⏭ Завершить ход
        </button>
      </div>
    </div>
  );
}
