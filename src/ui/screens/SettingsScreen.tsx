import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { Settings } from '@core/types';
import { $save, exportSaveCode, importSaveCode, resetProgress, updateSettings } from '@state/save';
import { navigate } from '@state/router';
import { Button } from '../components/Button';
import { TopBar } from '../components/TopBar';
import { Modal } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { haptic } from '@platform/haptics';

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <span role="switch" aria-checked={on} class={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="seg">
      {options.map((o) => (
        <button key={String(o.v)} type="button" class={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen() {
  const save = useStore($save);
  const s = save.settings;
  const [exportCode, setExportCode] = useState<string | null>(null);
  const [importCode, setImportCode] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetWord, setResetWord] = useState('');
  const [toastEl, toast] = useToast();

  const set = (patch: Partial<Settings>) => {
    updateSettings(patch);
    haptic('select');
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Скопировано');
    } catch {
      toast('Не удалось скопировать — выделите текст вручную', true);
    }
  };

  const doImport = () => {
    const r = importSaveCode(importCode);
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    haptic('success');
    toast('Сейв импортирован');
    setImportCode('');
  };

  const doReset = async () => {
    setResetOpen(false);
    setResetWord('');
    await resetProgress();
    haptic('error');
    navigate('/', true);
  };

  return (
    <div class="screen">
      <TopBar title="Настройки" onBack={() => navigate('/', true)} />
      <div class="screen-body">
        <div class="card">
          <div class="setting">
            <div class="row">
              <span>Музыка</span>
              <span class="muted small">{s.music}</span>
            </div>
            <input type="range" min={0} max={100} value={s.music} onInput={(e) => set({ music: Number((e.target as HTMLInputElement).value) })} />
          </div>
          <div class="setting">
            <div class="row">
              <span>Звуки</span>
              <span class="muted small">{s.sfx}</span>
            </div>
            <input type="range" min={0} max={100} value={s.sfx} onInput={(e) => set({ sfx: Number((e.target as HTMLInputElement).value) })} />
          </div>
          <div class="setting">
            <div class="row">
              <span>Вибрация</span>
              <Switch on={s.haptics} onChange={(v) => set({ haptics: v })} />
            </div>
          </div>
          <div class="setting">
            <span>Скорость анимаций</span>
            <Seg
              value={s.animSpeed}
              options={[
                { v: 1 as const, label: '×1' },
                { v: 2 as const, label: '×2' },
              ]}
              onChange={(v) => set({ animSpeed: v })}
            />
          </div>
          <div class="setting">
            <span>Кинематик атак</span>
            <Seg
              value={s.cinematic}
              options={[
                { v: 'always' as const, label: 'Всегда' },
                { v: 'mine' as const, label: 'Только мои' },
                { v: 'never' as const, label: 'Никогда' },
              ]}
              onChange={(v) => set({ cinematic: v })}
            />
          </div>
          <div class="setting">
            <div class="row">
              <span>Авто-завершение хода</span>
              <Switch on={s.autoEndTurn} onChange={(v) => set({ autoEndTurn: v })} />
            </div>
          </div>
          <div class="setting">
            <div class="row">
              <span>Зона опасности по умолчанию</span>
              <Switch on={s.dangerZoneDefault} onChange={(v) => set({ dangerZoneDefault: v })} />
            </div>
          </div>
          <div class="setting">
            <div class="row">
              <span>Подтверждение атаки</span>
              <Switch on={s.confirmAttack} onChange={(v) => set({ confirmAttack: v })} />
            </div>
          </div>
          <div class="setting">
            <span>Кровь</span>
            <Seg
              value={s.blood}
              options={[
                { v: 'sea' as const, label: '🩸 Море' },
                { v: 'pools' as const, label: '💧 Лужи' },
              ]}
              onChange={(v) => set({ blood: v })}
            />
          </div>
        </div>

        <div class="card stack">
          <h3>Сейв</h3>
          <Button block onClick={() => setExportCode(exportSaveCode())}>
            Экспортировать код сейва
          </Button>
          {exportCode && (
            <>
              <textarea readOnly value={exportCode} onClick={(e) => (e.target as HTMLTextAreaElement).select()} />
              <Button block sm onClick={() => void copy(exportCode)}>
                Скопировать
              </Button>
            </>
          )}
          <textarea placeholder="Вставьте код сейва для импорта" value={importCode} onInput={(e) => setImportCode((e.target as HTMLTextAreaElement).value)} />
          <Button block onClick={doImport} disabled={!importCode.trim()}>
            Импортировать
          </Button>
          <Button block danger onClick={() => setResetOpen(true)}>
            Сбросить прогресс
          </Button>
        </div>

        <div class="card stack">
          <h3>Статистика</h3>
          <div class="muted small">
            Боёв: {save.stats.battles} · Побед: {save.stats.wins} · Убийств: {save.stats.kills} · Потерь: {save.stats.deaths} · Армий потеряно: {save.stats.armiesLost} · Армий создано:{' '}
            {save.profile.armiesCreated}
          </div>
          <div class="muted small">
            Побед по сложностям: Легко {save.profile.wins.easy}, Нормально {save.profile.wins.normal}, Сложно {save.profile.wins.hard}, Кошмар {save.profile.wins.nightmare}
          </div>
        </div>

        <p class="muted small center-text">
          Сборка: {import.meta.env.MODE}
          {save.battle ? ` · seed боя: ${save.battle.map.seed}` : ''} · сейв v{save.version}
        </p>
      </div>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Сбросить весь прогресс?">
        <p class="muted small">Будут удалены армия, Кладбище, Слава и Вкусняшки — локально и в облаке Telegram. Введите слово УДАЛИТЬ.</p>
        <input type="text" value={resetWord} onInput={(e) => setResetWord((e.target as HTMLInputElement).value)} placeholder="УДАЛИТЬ" />
        <div class="row">
          <Button block onClick={() => setResetOpen(false)}>
            Отмена
          </Button>
          <Button block danger disabled={resetWord.trim().toUpperCase() !== 'УДАЛИТЬ'} onClick={() => void doReset()}>
            Удалить всё
          </Button>
        </div>
      </Modal>
      {toastEl}
    </div>
  );
}
