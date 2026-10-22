import type { GenerationInputType, PokemonType } from "@shared/api/schema/pokemon/generated"
import { combineByTypes } from "./classes"
import { bstFactorOf } from "./compensation"
import type { ClassKey, PokemonModel } from "./schema"

/** Expected ln(height_dm) for the BST (docs/pokemon-model.md, "Рост и вес") */
export const predictLnHeight = (model: PokemonModel, bst: number) => model.size.height.intercept + model.size.height.slope * bst

/** Expected ln(weight_hg) for the height and types */
export const predictLnWeight = (model: PokemonModel, heightDm: number, types: readonly PokemonType[]) => {
  const { intercept, slope } = model.size.weight

  return intercept + slope * Math.log(heightDm) + combineByTypes(types, type => model.types[type as PokemonType].weightShift)
}

/** BST tier of the class, widened by the abilities' compensation factor */
export const bstRangeOf = (model: PokemonModel, key: ClassKey, abilities: readonly string[] = []) => {
  const { min, max } = model.classes[key].bst
  const factor = bstFactorOf(abilities)

  return { min, max: factor === 1 ? max : Math.min(720, Math.ceil(max * factor / 5) * 5) }
}

export const isForbiddenBst = (model: PokemonModel, bst: number) => model.forbiddenBst
  .some(([min, max]) => bst >= min && bst <= max)

/** Abilities the user asked for: they skip the type checks of slot 1 */
export const requestedAbilitiesOf = (input: GenerationInputType) => {
  switch (input.mode) {
    case "mega":
      return []
    case "custom":
      return input.pokemon.abilities
    default:
      return input.request.abilities ?? []
  }
}
