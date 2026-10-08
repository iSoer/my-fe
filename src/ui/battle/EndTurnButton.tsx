import { useState } from 'preact/hooks';
import type { BattleState } from '@core/types';
import { livingUnits } from '@core/battle/query';
import { endTurn, type BattleUiState } from '@state/battleUi';
import { haptic } from '@platform/haptics';
import { ConfirmModal } from '../components/Sheet';
import { plural } from '../lib/format';
import { useStore } from '@nanostores/preact';
import { $settings } from '@state/save';
import { $endPromptDismissed } from './endPrompt';
import { shouldOfferEndTurn } from './EndTurnPrompt';

/** Плавающая кнопка «Завершить ход» над нижней полосой; пульсирует, когда все походили. */
export function EndTurnButton({ battle, ui }: { battle: BattleState; ui: BattleUiState }) {
  const [ask, setAsk] = useState(false);
  const settings = useStore($settings);
  const dismissed = useStore($endPromptDismissed);
  const isPlayer = battle.phase === 'player';
  const players = livingUnits(battle, 'player');
  const left = players.filter((u) => !u.acted).length;
  const show = isPlayer && !ui.busy && ui.mode === 'idle';
  // Пока всплыло предложение завершить ход — плавающую кнопку не дублируем.
  if (!show || shouldOfferEndTurn(battle, ui, settings.autoEndTurn, dismissed)) return null;
  const allActed = left === 0;
  const go = () => {
    haptic('medium');
    void endTurn();
  };
  return (
    <>
      <button
        type="button"
        aria-label="Завершить ход"
        class={`bf-endturn ${allActed ? 'pulse' : ''}`}
        onClick={() => {
          haptic('light');
          if (allActed) go();
          else setAsk(true);
        }}
      >
        <span class="bf-endturn-ico" aria-hidden="true">
          ⏭
        </span>
        Завершить ход
      </button>
      <ConfirmModal
        open={ask}
        title="Завершить ход?"
        text={`Ещё ${left} ${plural(left, 'боец', 'бойца', 'бойцов')} не ${plural(left, 'ходил', 'ходили', 'ходили')}. Враг получит ход.`}
        confirmLabel="Завершить"
        onConfirm={() => {
          setAsk(false);
          go();
        }}
        onClose={() => setAsk(false)}
      />
    </>
  );
}
