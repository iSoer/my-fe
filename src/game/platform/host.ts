import type { ComponentType } from "react"

/**
 * Хост игры — то, во что она встроена (страница /game в Next, Telegram Mini App и PWA в my-fe).
 * Ядро и экраны одинаковы в обоих проектах; платформенные возможности хост подключает здесь до монтирования.
 */
export interface GameHost {
  /** Слой поверх всех экранов (баннеры обновления PWA, тосты платформы). */
  Overlay?: ComponentType
  /** Секция в начале Настроек (установка приложения, хранилище). */
  SettingsSection?: ComponentType
}

let host: GameHost = {}

export function setGameHost(next: GameHost): void {
  host = next
}

export function gameHost(): GameHost {
  return host
}
