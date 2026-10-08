import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { BattleState, BattleUnit, UnitInstance } from '@core/types';
import { displayName, unitClass, unitClassName } from '@core/units';
import { unitStatsInBattle } from '@core/battle/reducer';
import { skillInfo } from '@content/index';
import { specialDef } from '@content/skills/specials';
import { biomeDef } from '@content/biomes';
import { $battle, $settings, finishBattle, updateSettings } from '@state/save';
import {
  $battleUi,
  cancel,
  confirm,
  endTurn,
  enterBattleScreen,
  retreat,
  setFastForward,
  setOnBattleEnded,
  toggleDanger,
  waitHere,
  type BattleUiState,
} from '@state/battleUi';
import { navigate } from '@state/router';
import type { BattleGameHandle } from '@game/index';
import { Button } from '../components/Button';
import { UnitAvatar } from '../components/UnitAvatar';
import { WeaponBadge } from '../components/Badges';
import { StatBar } from '../components/Stats';
import { ConfirmModal, Modal } from '../components/Sheet';
import { Toast } from '../components/Toast';
import { $pauseOpen } from '../lib/pause';
import { difficultyName } from '../lib/format';
import { haptic } from '@platform/haptics';

function UnitMini({ state, bu, unit }: { state: BattleState; bu: BattleUnit; unit: UnitInstance }) {
  const st = unitStatsInBattle(state, bu.unitId);
  const cls = unitClass(unit);
  const special = unit.skills.special ? specialDef(unit.skills.special) : undefined;
  return (
    <div class="stack" style={{ gap: 6 }}>
      <div class="unit-mini">
        <UnitAvatar unit={unit} size="sm" />
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="row between">
            <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(unit)}</b>
            <span class={`hp ${bu.hp <= bu.maxHp / 4 ? 'danger' : ''}`}>
              {bu.hp}/{bu.maxHp}
            </span>
          </div>
          <StatBar value={bu.hp} max={bu.maxHp} />
          <div class="row wrap small muted" style={{ marginTop: 4 }}>
            <span>
              {unitClassName(unit)} · Ур. {unit.level}
            </span>
            <WeaponBadge kind={cls.weaponKind} />
            {special && (
              <span class="chip" title={special.desc}>
                ✦ {special.name} {bu.specialCd}
              </span>
            )}
          </div>
        </div>
      </div>
      {st && (
        <div class="mini-stats">
          <span>
            Atk <b>{st.atk}</b>
          </span>
          <span>
            Spd <b>{st.spd}</b>
          </span>
          <span>
            Def <b>{st.def}</b>
          </span>
          <span>
            Res <b>{st.res}</b>
          </span>
          {Object.values(bu.bonuses).some((v) => v) && <span class="ok">▲ бонусы</span>}
          {Object.values(bu.penalties).some((v) => v) && <span class="danger">▼ штрафы</span>}
        </div>
      )}
    </div>
  );
}

function Forecast({ state, ui }: { state: BattleState; ui: BattleUiState }) {
  const f = ui.forecast;
  if (!f) return null;
  const a = state.roster[f.attacker.unitId];
  const d = state.roster[f.defender.unitId];
  if (!a || !d) return null;
  const aDies = f.attacker.hpAfter <= 0;
  const dDies = f.defender.hpAfter <= 0;
  const Side = ({ unit, res, hits, effective, enemy }: { unit: UnitInstance; res: typeof f.attacker; hits: number; effective: boolean; enemy: boolean }) => (
    <div class={`side ${enemy ? 'enemy' : ''}`}>
      <UnitAvatar unit={unit} size="sm" />
      <div class="name">{unit.name}</div>
      <WeaponBadge kind={unitClass(unit).weaponKind} />
      <div class="hp">
        {res.hpBefore} → <span class={`after ${res.hpAfter <= 0 ? 'dead' : ''}`}>{Math.max(0, res.hpAfter)}</span>
      </div>
      <div class="dmg">{hits > 0 ? `${res.damagePerHit} × ${hits}` : '—'}</div>
      <div class="tags">
        {res.specialTriggered && res.specialId && <span class="chip red">✦ {specialDef(res.specialId).name}</span>}
        {effective && hits > 0 && <span class="chip red">×1.5</span>}
      </div>
    </div>
  );
  return (
    <div class="stack" style={{ gap: 6 }}>
      <div class="forecast">
        <Side unit={a} res={f.attacker} hits={f.attacker.hits} effective={f.attackerEffective} enemy={false} />
        <div class="mid">
          <span class={`tri ${f.triangle}`}>{f.triangle === 'adv' ? '▲' : f.triangle === 'dis' ? '▼' : '•'}</span>
          <span class="muted small">{f.attackerFollowUp ? '×2' : ''}</span>
          {!f.defenderCanCounter && <span class="muted small">нет ответа</span>}
        </div>
        <Side unit={d} res={f.defender} hits={f.defender.hits} effective={f.defenderEffective} enemy />
      </div>
      {aDies && <div class="death-warning">☠ {a.name.toUpperCase()} ПОГИБНЕТ</div>}
      {dDies && !aDies && <div class="center-text ok small">Цель будет уничтожена</div>}
    </div>
  );
}

function AssistPanel({ state, ui }: { state: BattleState; ui: BattleUiState }) {
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
    <div class="stack" style={{ gap: 4 }}>
      <b>
        {plan.assist.name} → {displayName(target)}
      </b>
      <div class="muted small">{plan.assist.desc}</div>
      {parts.length > 0 && <div class="small">{parts.join(' · ')}</div>}
    </div>
  );
}

function EnemyInfo({ state, unitId }: { state: BattleState; unitId: string }) {
  const bu = state.units[unitId];
  const unit = state.roster[unitId];
  if (!bu || !unit) return null;
  const skills = Object.values(unit.skills)
    .filter((id): id is string => !!id)
    .map((id) => skillInfo(id)?.name)
    .filter(Boolean);
  return (
    <div class="stack" style={{ gap: 6 }}>
      <UnitMini state={state} bu={bu} unit={unit} />
      <div class="muted small">
        {unit.isBoss ? '👑 Вожак · ' : ''}
        {skills.join(' · ')}
        {bu.side === 'enemy' ? ' · Красным показана его зона угрозы' : ''}
      </div>
    </div>
  );
}

export function BattleScreen() {
  const battle = useStore($battle);
  const ui = useStore($battleUi);
  const settings = useStore($settings);
  const pause = useStore($pauseOpen);
  const [retreatAsk, setRetreatAsk] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const b = $battle.get();
    if (!b) {
      navigate('/', true);
      return;
    }
    if (b.result) {
      finishBattle();
      navigate('/battle/result', true);
      return;
    }
    const el = canvasRef.current;
    let handle: BattleGameHandle | null = null;
    let cancelled = false;
    setOnBattleEnded(() => {
      finishBattle();
      navigate('/battle/result', true);
    });
    // Phaser грузится лениво — только на экране боя (SPEC 15).
    import('@game/index')
      .then((m) => {
        if (cancelled) return;
        if (el) handle = m.mountBattleGame(el);
        enterBattleScreen();
      })
      .catch((e: unknown) => {
        console.error('game load failed', e);
        if (!cancelled) enterBattleScreen();
      });
    return () => {
      cancelled = true;
      setOnBattleEnded(null);
      handle?.destroy();
      $pauseOpen.set(false);
    };
  }, []);

  if (!battle) return <div class="screen battle" />;

  const isPlayer = battle.phase === 'player';
  const selected = ui.selectedId ? battle.units[ui.selectedId] : undefined;
  const selectedUnit = ui.selectedId ? battle.roster[ui.selectedId] : undefined;
  const biome = biomeDef(battle.map.biomeId);

  const panel = () => {
    switch (ui.mode) {
      case 'busy':
        return <div class="hint">{isPlayer ? 'Анимация…' : 'Ход врага…'}</div>;
      case 'ended':
        return <div class="hint">Бой окончен</div>;
      case 'enemyInfo':
        return (
          <>
            {ui.infoId && <EnemyInfo state={battle} unitId={ui.infoId} />}
            <div class="panel-actions">
              <Button onClick={cancel}>Закрыть</Button>
            </div>
          </>
        );
      case 'unitSelected':
        return (
          <>
            {selected && selectedUnit && <UnitMini state={battle} bu={selected} unit={selectedUnit} />}
            <div class="muted small center-text">Выберите клетку, цель или союзника</div>
            <div class="panel-actions">
              <Button onClick={cancel}>Отмена</Button>
            </div>
          </>
        );
      case 'movedPreview':
        return (
          <>
            {selected && selectedUnit && <UnitMini state={battle} bu={selected} unit={selectedUnit} />}
            <div class="panel-actions">
              <Button onClick={cancel}>Отмена</Button>
              <Button primary onClick={() => void waitHere()}>
                Ждать
              </Button>
            </div>
          </>
        );
      case 'forecast':
        return (
          <>
            <Forecast state={battle} ui={ui} />
            <div class="panel-actions">
              <Button onClick={cancel}>Отмена</Button>
              <Button primary onClick={() => void confirm()}>
                Атаковать
              </Button>
            </div>
          </>
        );
      case 'assistPreview':
        return (
          <>
            <AssistPanel state={battle} ui={ui} />
            <div class="panel-actions">
              <Button onClick={cancel}>Отмена</Button>
              <Button primary onClick={() => void confirm()}>
                Применить
              </Button>
            </div>
          </>
        );
      case 'wallPreview':
        return (
          <>
            <b>Ударить по хлипкой стене</b>
            <div class="muted small">Стена потеряет 1 HP. При 0 HP клетка станет проходимой.</div>
            <div class="panel-actions">
              <Button onClick={cancel}>Отмена</Button>
              <Button primary onClick={() => void confirm()}>
                Ударить
              </Button>
            </div>
          </>
        );
      default:
        return (
          <>
            <div class="hint">{isPlayer ? 'Выберите бойца. Тап по врагу покажет его зону угрозы.' : 'Ход врага…'}</div>
            <div class="panel-actions">
              <Button
                primary
                block
                disabled={!isPlayer || ui.busy}
                onClick={() => {
                  haptic('light');
                  void endTurn();
                }}
              >
                Завершить ход
              </Button>
            </div>
          </>
        );
    }
  };

  return (
    <div class="screen battle">
      <div class="battle-top">
        <span class={`phase ${isPlayer ? '' : 'enemy'}`}>
          Ход {battle.turn} · {isPlayer ? 'ВАША ФАЗА' : 'ФАЗА ВРАГА'}
        </span>
        <span class="muted small">{biome.name}</span>
        {!isPlayer || ui.busy ? (
          <button type="button" class={`icon-btn ${ui.fastForward ? 'active' : ''}`} aria-label="Ускорить" onClick={() => setFastForward(!ui.fastForward)}>
            ⏩
          </button>
        ) : null}
        <button type="button" class={`icon-btn ${ui.dangerOn ? 'active' : ''}`} aria-label="Зона опасности" onClick={toggleDanger}>
          ⚠
        </button>
        <button type="button" class="icon-btn" aria-label="Пауза" onClick={() => $pauseOpen.set(true)}>
          ≡
        </button>
      </div>
      <div id="battle-canvas" ref={canvasRef} />
      <div class="battle-panel">{panel()}</div>
      <Toast message={ui.toast} at={ui.toastAt} error />

      <Modal open={pause} onClose={() => $pauseOpen.set(false)} title="Пауза">
        <div class="muted small">
          {difficultyName(battle.difficulty)} · {biome.name} · ход {battle.turn} · цель: {battle.map.objective === 'killBoss' ? 'убить вожака' : 'уничтожить всех'}
        </div>
        <div class="setting">
          <div class="row">
            <span>Скорость анимаций</span>
            <div class="seg" style={{ width: 120 }}>
              <button type="button" class={settings.animSpeed === 1 ? 'on' : ''} onClick={() => updateSettings({ animSpeed: 1 })}>
                ×1
              </button>
              <button type="button" class={settings.animSpeed === 2 ? 'on' : ''} onClick={() => updateSettings({ animSpeed: 2 })}>
                ×2
              </button>
            </div>
          </div>
        </div>
        <div class="setting">
          <span>Кинематик атак</span>
          <div class="seg">
            {(['always', 'mine', 'never'] as const).map((v) => (
              <button key={v} type="button" class={settings.cinematic === v ? 'on' : ''} onClick={() => updateSettings({ cinematic: v })}>
                {v === 'always' ? 'Всегда' : v === 'mine' ? 'Только мои' : 'Никогда'}
              </button>
            ))}
          </div>
        </div>
        <div class="setting">
          <div class="row">
            <span>Вибрация</span>
            <span class={`switch ${settings.haptics ? 'on' : ''}`} onClick={() => updateSettings({ haptics: !settings.haptics })} />
          </div>
        </div>
        <Button primary block onClick={() => $pauseOpen.set(false)}>
          Продолжить
        </Button>
        <Button danger block onClick={() => setRetreatAsk(true)}>
          Отступить
        </Button>
      </Modal>
      <ConfirmModal
        open={retreatAsk}
        title="Отступить?"
        text="Наград не будет. Погибшие останутся мёртвыми. Опыт, полученный в этом бою, сохранится."
        confirmLabel="Отступить"
        danger
        onConfirm={() => {
          setRetreatAsk(false);
          $pauseOpen.set(false);
          void retreat();
        }}
        onClose={() => setRetreatAsk(false)}
      />
    </div>
  );
}
