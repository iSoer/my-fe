import modelJson from "./model.json"
import { statModelSchema, type StatModel } from "./schema"

let cached: StatModel | undefined

/** model.json is fitted offline, validated once per process */
export const loadModel = (): StatModel => {
  cached ??= statModelSchema.parse(modelJson)

  return cached
}
