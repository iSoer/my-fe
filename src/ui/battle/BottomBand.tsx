import type { BattleState } from '@core/types';
import { displayName } from '@core/units';
import { cancel, confirm, type BattleUiState } from '@state/battleUi';
import { haptic } from '@platform/haptics';
import { UnitCard } from './UnitCard';

function Pill({ label, primary, danger, big, onClick }: { label: string; primary?: boolean; danger?: boolean; big?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      class={`bf-pill-btn ${primary ? 'primary' : ''} ${danger ? 'danger' : ''} ${big ? 'big' : ''}`}
      onClick={() => {
        haptic('light');
        onClick();
      }}
    >
      {label}
    </button>
  );
}

function AssistSummary({ state, ui }: { state: BattleState; ui: BattleUiState }) {
  const plan = ui.assistPlan;
  const target = ui.targetId ? state.roster[ui.targetId] : undefined;
  if (!plan || !plan.assist || !target) return null;
  const parts: string[] = [];
  if (plan.heal > 0) parts.push(`лечение +${plan.heal}`);
  if (plan.allHeal > 0) parts.push(`все союзники +${plan.allHeal}`);
  if (plan.buffs.length) parts.push(plan.buffs.map((b) => Object.entries(b.stats).map(([k, v]) => `${k.toUpperCase()} +${v}`).join(', ')).join('; '));
  if (plan.moves.length) parts.push('перемещение');
  if (plan.refresh) parts.push('союзник действует ещё раз');
  if (plan.selfHpDelta) parts.push(`себе ${plan.selfHpDelta}`);
  if (plan.specialTriggered) parts.push('сработает спецприём');
  return (
    <div class="bf-card bf-assist">
      <b>
        🩹 {plan.assist.name} → {displayName(target)}
      </b>
      <div class="bf-muted">{plan.assist.desc}</div>
      {parts.length > 0 && <div class="bf-assist-parts">{parts.join(' · ')}</div>}
    </div>
  );
}

/** Нижняя полоса: карточка бойца, подсказки и кнопки подтверждения по режиму. */
export function BottomBand({ battle, ui }: { battle: BattleState; ui: BattleUiState }) {
  const isPlayer = battle.phase === 'player';
  const sel = ui.selectedId ? battle.units[ui.selectedId] : undefined;
  const selUnit = ui.selectedId ? battle.roster[ui.selectedId] : undefined;
  const card = sel && selUnit ? <UnitCard state={battle} bu={sel} unit={selUnit} /> : null;
  const hint = (text: string, cls = '') => <div class={`bf-hint ${cls}`}>{text}</div>;
  const cancelRow = (
    <div class="bf-actions">
      <Pill label="Отмена" onClick={cancel} />
    </div>
  );

  if (ui.dragging) {
    const bad = !!ui.dragHover && !ui.dragValid;
    return (
      <>
        {card}
        {hint(bad ? 'Сюда нельзя' : 'Отпустите бойца на клетке', bad ? 'danger' : 'accent')}
      </>
    );
  }
  switch (ui.mode) {
    case 'busy':
      return hint(isPlayer ? 'Анимация…' : 'Ход противника…', 'thin');
    case 'ended':
      return hint('Бой окончен', 'thin');
    case 'enemyInfo': {
      const bu = ui.infoId ? battle.units[ui.infoId] : undefined;
      const unit = ui.infoId ? battle.roster[ui.infoId] : undefined;
      if (!bu || !unit) return null;
      return (
        <>
          <UnitCard state={battle} bu={bu} unit={unit} enemy={bu.side === 'enemy'} extra={bu.side === 'enemy' ? <div class="bf-muted bf-caption">Зона угрозы показана фиолетовым</div> : undefined} />
          <div class="bf-actions">
            <Pill label="Закрыть" onClick={cancel} />
          </div>
        </>
      );
    }
    case 'unitSelected':
    case 'movedPreview':
      return card;
    case 'moveTargeting':
      return (
        <>
          {card}
          {hint('Выберите клетку или перетащите бойца')}
          {cancelRow}
        </>
      );
    case 'attackTargeting':
      return (
        <>
          {card}
          {hint('Выберите цель', 'accent')}
          {cancelRow}
        </>
      );
    case 'assistTargeting':
      return (
        <>
          {card}
          {hint('Выберите союзника', 'accent')}
          {cancelRow}
        </>
      );
    case 'forecast':
      return (
        <div class="bf-actions">
          <Pill label="Отмена" onClick={cancel} />
          <Pill label="Атаковать" primary big onClick={() => void confirm()} />
        </div>
      );
    case 'assistPreview':
      return (
        <>
          <AssistSummary state={battle} ui={ui} />
          <div class="bf-actions">
            <Pill label="Отмена" onClick={cancel} />
            <Pill label="Применить" primary big onClick={() => void confirm()} />
          </div>
        </>
      );
    case 'wallPreview':
      return (
        <>
          {card}
          <div class="bf-card bf-assist">
            <b>🧱 Сломать хлипкую стену</b>
            <div class="bf-muted">Стена потеряет 1 HP. При 0 HP клетка станет проходимой.</div>
          </div>
          <div class="bf-actions">
            <Pill label="Отмена" onClick={cancel} />
            <Pill label="Сломать" primary big onClick={() => void confirm()} />
          </div>
        </>
      );
    default:
      return isPlayer ? hint('Тап по бойцу — меню действий, перетащите его — ход', 'thin') : hint('Ход противника…', 'thin');
  }
}
