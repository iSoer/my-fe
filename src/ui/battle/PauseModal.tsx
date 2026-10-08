import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { BattleState } from '@core/types';
import { biomeDef } from '@content/biomes';
import { $settings, updateSettings } from '@state/save';
import { retreat } from '@state/battleUi';
import { Button } from '../components/Button';
import { ConfirmModal, Modal } from '../components/Sheet';
import { $pauseOpen } from '../lib/pause';
import { difficultyName } from '../lib/format';

/** Пауза боя: быстрые настройки и отступление. */
export function PauseModal({ battle }: { battle: BattleState }) {
  const open = useStore($pauseOpen);
  const settings = useStore($settings);
  const [retreatAsk, setRetreatAsk] = useState(false);
  const biome = biomeDef(battle.map.biomeId);
  return (
    <>
      <Modal open={open} onClose={() => $pauseOpen.set(false)} title="Пауза">
        <div class="bf-pause">
          <div class="bf-pause-meta">
            <span class="bf-chip">{difficultyName(battle.difficulty)}</span>
            <span class="bf-chip">{biome.name}</span>
            <span class="bf-chip">ход {battle.turn}</span>
            <span class="bf-chip">
              {battle.map.objective === 'killBoss' ? 'цель: убить вожака' : 'цель: уничтожить всех'}
            </span>
          </div>
          <div class="setting">
            <div class="row">
              <span>Скорость анимаций</span>
              <div class="seg" style={{ width: 120 }}>
                <button
                  type="button"
                  class={settings.animSpeed === 1 ? 'on' : ''}
                  onClick={() => updateSettings({ animSpeed: 1 })}
                >
                  ×1
                </button>
                <button
                  type="button"
                  class={settings.animSpeed === 2 ? 'on' : ''}
                  onClick={() => updateSettings({ animSpeed: 2 })}
                >
                  ×2
                </button>
              </div>
            </div>
          </div>
          <div class="setting">
            <span>Кинематик атак</span>
            <div class="seg">
              {(['always', 'mine', 'never'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  class={settings.cinematic === v ? 'on' : ''}
                  onClick={() => updateSettings({ cinematic: v })}
                >
                  {v === 'always' ? 'Всегда' : v === 'mine' ? 'Только мои' : 'Никогда'}
                </button>
              ))}
            </div>
          </div>
          <div class="setting">
            <div class="row">
              <span>Вибрация</span>
              <span
                class={`switch ${settings.haptics ? 'on' : ''}`}
                onClick={() => updateSettings({ haptics: !settings.haptics })}
              />
            </div>
          </div>
          <div class="setting">
            <div class="row">
              <span>Подтверждать атаку</span>
              <span
                class={`switch ${settings.confirmAttack ? 'on' : ''}`}
                onClick={() => updateSettings({ confirmAttack: !settings.confirmAttack })}
              />
            </div>
          </div>
          <Button primary block onClick={() => $pauseOpen.set(false)}>
            Продолжить
          </Button>
          <Button danger block onClick={() => setRetreatAsk(true)}>
            Отступить
          </Button>
        </div>
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
    </>
  );
}
