import type { PokemonClass } from "@shared/api/schema/pokemon/generated"
import type { ClassKey } from "./schema"

export type Stage = { index: number, of: number }

export const classKeyOf = (pokemonClass: PokemonClass, stage: Stage | null | undefined): ClassKey => {
  if (pokemonClass !== "stage") {
    return pokemonClass
  }

  if (!stage) {
    throw new Error("A stage pokemon needs a stage")
  }

  return `stage${stage.index}of${stage.of}` as ClassKey
}

export const classOfKey = (key: ClassKey): { class: PokemonClass, stage: Stage | null } => {
  const match = /^stage(\d)of(\d)$/.exec(key)

  return match
    ? { class: "stage", stage: { index: Number(match[1]), of: Number(match[2]) } }
    : { class: key as PokemonClass, stage: null }
}

/** Weights of the primary and the secondary type when per-type shifts are combined */
export const TYPE_WEIGHTS = [0.6, 0.4] as const

/** Per-type value of a pokemon: the type's own for one type, 0.6 / 0.4 blend for two, 0 without types (characters) */
export const combineByTypes = (types: readonly string[], value: (type: string) => number) => {
  if (types.length === 0) {
    return 0
  }

  return types.length === 1 ? value(types[0]) : TYPE_WEIGHTS[0] * value(types[0]) + TYPE_WEIGHTS[1] * value(types[1])
}

export const isFinalStage = (stage: Stage | null) => stage !== null && stage.index === stage.of
