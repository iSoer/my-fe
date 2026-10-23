import { atom } from "nanostores"

/** Развёрнута ли карточка выбранного бойца в бою: по умолчанию — только аватар, имя и класс. */
export const $unitCardOpen = atom(false)

export function toggleUnitCard(): void {
  $unitCardOpen.set(!$unitCardOpen.get())
}
