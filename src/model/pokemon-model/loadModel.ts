import modelJson from "./model.json"
import { pokemonModelSchema, type PokemonModel } from "./schema"

let cached: PokemonModel | undefined

/** model.json written by `npm run pokemon:model`, validated once per process */
export const loadModel = (): PokemonModel => {
  cached ??= pokemonModelSchema.parse(modelJson)

  return cached
}
