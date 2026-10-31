import { gameHost } from "@game/platform/host"
import { useState } from "react"
import { useStore } from "@nanostores/react"
import type { Settings } from "@game/core/types"
import { $save, exportBackupCode, exportSaveCode, importSaveCode, resetProgress, updateSettings } from "@game/state/save"
import { navigate } from "@game/state/router"
import { Button } from "../components/Button"
import { TopBar } from "../components/TopBar"
import { Modal } from "../components/Sheet"
import { useToast } from "../components/Toast"
import { haptic } from "@game/platform/haptics"
import { LANG_NAMES, LANGS, tr } from "@game/i18n"
import { Icon, IconText } from "../components/Icon"

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
          <IconText text={o.label} />
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
  // Копия сейва, который не прочитался при загрузке (см. `backupRawSave`): её можно вынести и импортировать позже
  const [backupCode] = useState(() => exportBackupCode())
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
      toast(tr("Copied", "Скопировано"))
    }
    catch {
      toast(tr("Couldn’t copy — select the text manually", "Не удалось скопировать — выделите текст вручную"), true)
    }
  }

  const doImport = () => {
    const r = importSaveCode(importCode)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("success")
    toast(tr("Save imported", "Сейв импортирован"))
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
  const resetConfirm = tr("DELETE", "УДАЛИТЬ")

  return (
    <div className="screen">
      <TopBar title={tr("Settings", "Настройки")} />
      <div className="screen-body">
        {SettingsSection && <SettingsSection />}
        <div className="card pop-in">
          <div className="section-title"><Icon emoji="🌐" /> Language · Язык</div>
          <div className="setting">
            <Seg value={s.lang} options={LANGS.map(v => ({ v, label: LANG_NAMES[v] }))} onChange={v => set({ lang: v })} />
          </div>
        </div>
        <div className="card pop-in">
          <div className="section-title"><Icon emoji="🔊" /> {tr("Sound & feedback", "Звук и отклик")}</div>
          <div className="setting">
            <div className="row">
              <span>{tr("Music", "Музыка")}</span>
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
              <span>{tr("Sound effects", "Звуки-пуки")}</span>
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
              <span>{tr("Vibration", "Вибрация")}</span>
              <Switch on={s.haptics} onChange={v => set({ haptics: v })} />
            </div>
          </div>
        </div>

        <div className="card pop-in" style={{ animationDelay: "60ms" }}>
          <div className="section-title"><Icon emoji="⚔️" /> {tr("Battle", "Бой")}</div>
          <div className="setting">
            <span>{tr("Animation speed", "Скорость анимаций")}</span>
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
            <span>{tr("Attack cinematics", "Кинематик атак")}</span>
            <Seg
              value={s.cinematic}
              options={[
                { v: "always" as const, label: tr("Always", "Всегда") },
                { v: "mine" as const, label: tr("Mine only", "Только мои") },
                { v: "never" as const, label: tr("Never", "Никогда") }
              ]}
              onChange={v => set({ cinematic: v })}
            />
          </div>
          <div className="setting">
            <div className="row">
              <span>{tr("Auto end turn", "Авто-завершение хода")}</span>
              <Switch on={s.autoEndTurn} onChange={v => set({ autoEndTurn: v })} />
            </div>
          </div>
          <div className="setting">
            <span>{tr("“End turn” button", "Кнопка «Завершить ход»")}</span>
            <Seg
              value={s.endTurnConfirm}
              options={[
                { v: "modal" as const, label: tr("Ask", "С вопросом") },
                { v: "none" as const, label: tr("Instant", "Сразу") },
                { v: "double" as const, label: tr("Double tap", "Двойное") }
              ]}
              onChange={v => set({ endTurnConfirm: v })}
            />
            <span className="muted small">
              {s.endTurnConfirm === "modal"
                ? tr("If someone hasn’t acted, a confirmation window appears.", "Если кто-то не действовал, появится окно подтверждения.")
                : s.endTurnConfirm === "none"
                  ? tr("A tap always ends the turn at once.", "Нажатие всегда сразу завершает ход.")
                  : tr("If someone hasn’t acted, the first tap asks to tap again; the second within 2 s ends the turn.", "Если кто-то не действовал, первое нажатие просит нажать ещё раз; второе в течение 2 с завершает ход.")}
            </span>
          </div>
          <div className="setting">
            <div className="row">
              <span>{tr("Danger zone by default", "Зона опасности по умолчанию")}</span>
              <Switch on={s.dangerZoneDefault} onChange={v => set({ dangerZoneDefault: v })} />
            </div>
          </div>
          <div className="setting">
            <div className="row">
              <span>{tr("Confirm attacks", "Подтверждение атаки")}</span>
              <Switch on={s.confirmAttack} onChange={v => set({ confirmAttack: v })} />
            </div>
          </div>
          <div className="setting">
            <div className="row">
              <span>{tr("Dialogues", "Диалоги")}</span>
              <Switch on={s.dialogues} onChange={v => set({ dialogues: v })} />
            </div>
            <span className="muted small">
              {s.dialogues
                ? tr("Tap a villager to talk. Any conversation can be skipped.", "Тап по жителю — разговор. Любой разговор можно пропустить.")
                : tr("Villagers stay silent: a tap opens their building right away.", "Жители молчат: тап сразу открывает их здание.")}
            </span>
          </div>
          <div className="setting">
            <span>{tr("Blood", "Кровь")}</span>
            <Seg
              value={s.blood}
              options={[
                { v: "sea" as const, label: `🩸 ${tr("Sea", "Море")}` },
                { v: "pools" as const, label: `💧 ${tr("Puddles", "Лужи")}` }
              ]}
              onChange={v => set({ blood: v })}
            />
          </div>
          <div className="setting">
            <span>{tr("Graphics quality", "Качество графики")}</span>
            <Seg
              value={s.graphics}
              options={[
                { v: "auto" as const, label: tr("Auto", "Авто") },
                { v: "crisp" as const, label: tr("Crisp", "Чёткое") },
                { v: "eco" as const, label: tr("Saver", "Экономное") }
              ]}
              onChange={v => set({ graphics: v })}
            />
            <span className="muted small">
              {s.graphics === "crisp"
                ? tr("Full screen sharpness (up to 3×). Uses more battery and memory.", "Полная чёткость экрана (до 3×). Тратит больше батареи и памяти.")
                : s.graphics === "eco"
                  ? tr("Lowest resolution: saves battery, but the picture is softer on sharp screens.", "Низкое разрешение: бережёт батарею, но на чётких экранах картинка мягче.")
                  : tr("Sharp picture up to 2×, lighter on weak devices. Balance of sharpness and battery.", "Чёткая картинка до 2×, легче на слабых устройствах. Баланс чёткости и батареи.")}
            </span>
          </div>
        </div>

        <div className="card stack pop-in" style={{ animationDelay: "120ms" }}>
          <div className="section-title"><Icon emoji="💾" /> {tr("Save", "Сейв")}</div>
          <Button block icon="📤" onClick={() => setExportCode(exportSaveCode())}>
            {tr("Export save code", "Экспортировать код сейва")}
          </Button>
          {exportCode && (
            <>
              <textarea readOnly value={exportCode} onClick={e => (e.target as HTMLTextAreaElement).select()} />
              <Button block sm icon="📋" onClick={() => void copy(exportCode)}>
                {tr("Copy", "Скопировать")}
              </Button>
            </>
          )}
          {backupCode !== null && (
            <Button block sm icon="🗄️" onClick={() => setExportCode(backupCode)}>
              {tr("Show the backup of the damaged save", "Показать копию повреждённого сейва")}
            </Button>
          )}
          <textarea
            placeholder={tr("Paste a save code to import", "Вставьте код сейва для импорта")}
            value={importCode}
            onChange={e => setImportCode((e.target as HTMLTextAreaElement).value)}
          />
          <Button block icon="📥" onClick={doImport} disabled={!importCode.trim()}>
            {tr("Import", "Импортировать")}
          </Button>
          <Button block danger onClick={() => setResetOpen(true)}>
            {tr("Reset progress", "Сбросить прогресс")}
          </Button>
        </div>

        <div className="card stack pop-in" style={{ animationDelay: "180ms" }}>
          <div className="section-title"><Icon emoji="📊" /> {tr("Statistics", "Статистика")}</div>
          <div className="stats-table">
            <span className="k">{tr("Battles", "Боёв")}</span>
            <span className="v">{save.stats.battles}</span>
            <span className="k">{tr("Wins", "Побед")}</span>
            <span className="v">{save.stats.wins}</span>
            <span className="k">{tr("Kills", "Убийств")}</span>
            <span className="v">{save.stats.kills}</span>
            <span className="k">{tr("Losses", "Потерь")}</span>
            <span className="v">{save.stats.deaths}</span>
            <span className="k">{tr("Armies created", "Армий создано")}</span>
            <span className="v">{save.profile.armiesCreated}</span>
            <span className="k">{tr("Armies lost", "Армий потеряно")}</span>
            <span className="v">{save.stats.armiesLost}</span>
            <span className="k">{tr("Wins: Easy / Normal", "Побед: Легко / Нормально")}</span>
            <span className="v">
              {wins.easy}
              {" "}
              /
              {wins.normal}
            </span>
            <span className="k">{tr("Wins: Hard / Nightmare", "Побед: Сложно / Кошмар")}</span>
            <span className="v">
              {wins.hard}
              {" "}
              /
              {wins.nightmare}
            </span>
          </div>
        </div>

        <p className="muted small center-text">
          {tr("Build", "Сборка")}
          :
          {" "}
          {process.env.NODE_ENV}
          {save.battle ? ` · ${tr("battle seed", "seed боя")}: ${save.battle.map.seed}` : ""}
          {" "}
          ·
          {" "}
          {tr("save", "сейв")}
          {" "}
          v
          {save.version}
        </p>
      </div>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title={tr("Reset all progress?", "Сбросить весь прогресс?")}>
        <p className="muted small">
          {tr(
            `Your army, Graveyard, Glory and Treats will be deleted from this browser. Type ${resetConfirm}.`,
            `Будут удалены армия, Кладбище, Слава и Вкусняшки из этого браузера. Введите слово ${resetConfirm}.`
          )}
        </p>
        <input
          type="text"
          value={resetWord}
          onChange={e => setResetWord((e.target as HTMLInputElement).value)}
          placeholder={resetConfirm}
        />
        <div className="row">
          <Button block onClick={() => setResetOpen(false)}>
            {tr("Cancel", "Отмена")}
          </Button>
          <Button block danger disabled={resetWord.trim().toUpperCase() !== resetConfirm} onClick={() => void doReset()}>
            {tr("Delete everything", "Удалить всё")}
          </Button>
        </div>
      </Modal>
      {toastEl}
    </div>
  )
}
