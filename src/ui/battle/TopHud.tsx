import type { BattleState } from '@core/types';
import { livingUnits } from '@core/battle/query';
import { biomeDef } from '@content/biomes';
import { $pauseOpen } from '../lib/pause';
import { haptic } from '@platform/haptics';
import { setFastForward, toggleDanger, type BattleUiState } from '@state/battleUi';

/** Верхняя полоса HUD поверх поля: фаза, счётчик походивших, биом и кнопки. */
export function TopHud({ battle, ui }: { battle: BattleState; ui: BattleUiState }) {
  const isPlayer = battle.phase === 'player';
  const players = livingUnits(battle, 'player');
  const acted = players.filter((u) => u.acted).length;
  const biome = biomeDef(battle.map.biomeId);
  const showFf = !isPlayer || ui.busy;
  return (
    <div class="bf-hud-row">
      <div key={`${battle.turn}-${battle.phase}`} class={`bf-phase ${isPlayer ? 'player' : 'enemy'}`}>
        <span class="bf-phase-turn">Ход {battle.turn}</span>
        <span class="bf-phase-name">{isPlayer ? 'ВАША ФАЗА' : 'ФАЗА ВРАГА'}</span>
      </div>
      {isPlayer && players.length > 0 && (
        <span class={`bf-chip bf-acted ${acted === players.length ? 'done' : ''}`} title="Сколько бойцов уже действовали">
          {acted}/{players.length} ходили
        </span>
      )}
      <span class="bf-grow" />
      <span class="bf-chip bf-biome">{biome.name}</span>
      {showFf && (
        <button
          type="button"
          class={`bf-icon ${ui.fastForward ? 'active' : ''}`}
          aria-label="Ускорить"
          title="Ускорить ход противника"
          onClick={() => {
            haptic('select');
            setFastForward(!ui.fastForward);
          }}
        >
          ⏩
        </button>
      )}
      <button
        type="button"
        class={`bf-icon ${ui.dangerOn ? 'active warn' : ''}`}
        aria-label="Зона опасности"
        title="Показать зону опасности"
        onClick={() => {
          haptic('select');
          toggleDanger();
        }}
      >
        ⚠
      </button>
      <button
        type="button"
        class="bf-icon"
        aria-label="Пауза"
        onClick={() => {
          haptic('select');
          $pauseOpen.set(true);
        }}
      >
        ≡
      </button>
    </div>
  );
}
