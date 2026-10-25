import type { StatModel } from "./schema"

/** Expected ln(height_dm) for the BST */
export const predictLnHeight = (model: StatModel, bst: number) => model.size.height.intercept + model.size.height.slope * bst

/** Expected ln(weight_hg) for the height */
export const predictLnWeight = (model: StatModel, heightDm: number) => {
  const { intercept, slope } = model.size.weight

  return intercept + slope * Math.log(heightDm)
}
