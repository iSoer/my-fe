import { gameHost } from "@game/platform/host"
import { useState } from "react"
import { useStore } from "@nanostores/react"
import type { Settings } from "@game/core/types"
import { $save, exportSaveCode, importSaveCode, resetProgress, updateSettings } from "@game/state/save"
import { navigate } from "@game/state/router"
import { Button } from "../components/Button"
import { TopBar } from "../components/TopBar"
import { Modal } from "../components/Sheet"
import { useToast } from "../components/Toast"
import { haptic } from "@game/platform/haptics"

function Switch({ on, onChange }: { on: boolean, onChange: (v: boolean) => void }) {
  return <span role="switch" aria-checked={on} className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} />
}

function Seg<T extends string | number>({
  value,
  options,
  onChange
}: {
  value: T
  options: { v: T, label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={String(o.v)} type="button" className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsScreen() {
  const { SettingsSection } = gameHost()
  const save = useStore($save)
  const s = save.settings
  const [exportCode, setExportCode] = useState<string | null>(null)
  const [importCode, setImportCode] = useState("")
  const [resetOpen, setResetOpen] = useState(false)
  const [resetWord, setResetWord] = useState("")
  const [toastEl, toast] = useToast()

  const set = (patch: Partial<Settings>) => {
    updateSettings(patch)
    haptic("select")
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast("Скопировано")
    }
    catch {
      toast("Не удалось скопировать — выделите текст вручную", true)
    }
  }

  const doImport = () => {
    const r = importSaveCode(importCode)
    if (!r.ok) return toast(r.error ?? "Ошибка", true)
    haptic("success")
    toast("Сейв импортирован")
    setImportCode("")
  }

  const doReset = () => {
    setResetOpen(false)
    setResetWord("")
    resetProgress()
    haptic("error")
    navigate("/", true)
  }

  const wins = save.profile.wins

  return (
    <div className="screen">
      <TopBar title="Настройки" />
      <div className="screen-body">
        {SettingsSection && <SettingsSection />}
        <div className="card pop-in">
          <div className="section-title">🔊 Звук и отклик</div>
          <div className="setting">
            <div className="row">
              <span>Музыка</span>
              <span className="muted small">{s.music}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={s.music}
              onChange={e => set({ music: Number((e.target as HTMLInputElement).value) })}
            />
          </div>
          <div className="setting">
            <div className="row">
              <span>Звуки</span>
              <span className="muted small">{s.sfx}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={s.sfx}
              onChange={e => set({ sfx: Number((e.target as HTMLInputElement).value) })}
            />
          </div>
          <div className="setting">
            <div className="row">
              <span>Вибрация</span>
              <Switch on={s.haptics} onChange={v => set({ haptics: v })} />
            </div>
          </div>
        </div>

        <div className="card pop-in" style={{ animationDelay: "60ms" }}>
          <div className="section-title">⚔️ Бой</div>
          <div className="setting">
            <span>Скорость анимаций</span>
            <Seg
              value={s.animSpeed}
              options={[
                { v: 1 as const, label: "×1" },
                { v: 2 as const, label: "×2" }
              ]}
              onChange={v => set({ animSpeed: v })}
            />
          </div>
          <div className="setting">
            <span>Кинематик атак</span>
            <Seg
              value={s.cinematic}
              options={[
                { v: "always" as const, label: "Всегда" },
                { v: "mine" as const, label: "Только мои" },
                { v: "never" as const, label: "Никогда" }
              ]}
              onChange={v => set({ cinematic: v })}
            />
          </div>
          <div className="setting">
            <div className="row">
              <span>Авто-завершение хода</span>
              <Switch on={s.autoEndTurn} onChange={v => set({ autoEndTurn: v })} />
            </div>
          </div>
          <div className="setting">
            <div className="row">
              <span>Зона опасности по умолчанию</span>
              <Switch on={s.dangerZoneDefault} onChange={v => set({ dangerZoneDefault: v })} />
            </div>
          </div>
          <div className="setting">
            <div className="row">
              <span>Подтверждение атаки</span>
              <Switch on={s.confirmAttack} onChange={v => set({ confirmAttack: v })} />
            </div>
          </div>
          <div className="setting">
            <span>Кровь</span>
            <Seg
              value={s.blood}
              options={[
                { v: "sea" as const, label: "🩸 Море" },
                { v: "pools" as const, label: "💧 Лужи" }
              ]}
              onChange={v => set({ blood: v })}
            />
          </div>
        </div>

        <div className="card stack pop-in" style={{ animationDelay: "120ms" }}>
          <div className="section-title">💾 Сейв</div>
          <Button block icon="📤" onClick={() => setExportCode(exportSaveCode())}>
            Экспортировать код сейва
          </Button>
          {exportCode && (
            <>
              <textarea readOnly value={exportCode} onClick={e => (e.target as HTMLTextAreaElement).select()} />
              <Button block sm icon="📋" onClick={() => void copy(exportCode)}>
                Скопировать
              </Button>
            </>
          )}
          <textarea
            placeholder="Вставьте код сейва для импорта"
            value={importCode}
            onChange={e => setImportCode((e.target as HTMLTextAreaElement).value)}
          />
          <Button block icon="📥" onClick={doImport} disabled={!importCode.trim()}>
            Импортировать
          </Button>
          <Button block danger onClick={() => setResetOpen(true)}>
            Сбросить прогресс
          </Button>
        </div>

        <div className="card stack pop-in" style={{ animationDelay: "180ms" }}>
          <div className="section-title">📊 Статистика</div>
          <div className="stats-table">
            <span className="k">Боёв</span>
            <span className="v">{save.stats.battles}</span>
            <span className="k">Побед</span>
            <span className="v">{save.stats.wins}</span>
            <span className="k">Убийств</span>
            <span className="v">{save.stats.kills}</span>
            <span className="k">Потерь</span>
            <span className="v">{save.stats.deaths}</span>
            <span className="k">Армий создано</span>
            <span className="v">{save.profile.armiesCreated}</span>
            <span className="k">Армий потеряно</span>
            <span className="v">{save.stats.armiesLost}</span>
            <span className="k">Побед: Легко / Нормально</span>
            <span className="v">
              {wins.easy}
              {" "}
              /
              {wins.normal}
            </span>
            <span className="k">Побед: Сложно / Кошмар</span>
            <span className="v">
              {wins.hard}
              {" "}
              /
              {wins.nightmare}
            </span>
          </div>
        </div>

        <p className="muted small center-text">
          Сборка:
          {" "}
          {process.env.NODE_ENV}
          {save.battle ? ` · seed боя: ${save.battle.map.seed}` : ""}
          {" "}
          · сейв v
          {save.version}
        </p>
      </div>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Сбросить весь прогресс?">
        <p className="muted small">
          Будут удалены армия, Кладбище, Слава и Вкусняшки из этого браузера. Введите слово УДАЛИТЬ.
        </p>
        <input
          type="text"
          value={resetWord}
          onChange={e => setResetWord((e.target as HTMLInputElement).value)}
          placeholder="УДАЛИТЬ"
        />
        <div className="row">
          <Button block onClick={() => setResetOpen(false)}>
            Отмена
          </Button>
          <Button block danger disabled={resetWord.trim().toUpperCase() !== "УДАЛИТЬ"} onClick={() => void doReset()}>
            Удалить всё
          </Button>
        </div>
      </Modal>
      {toastEl}
    </div>
  )
}
