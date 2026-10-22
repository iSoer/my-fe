import { z } from "zod"
import {
  MIN_PAGE_SIZE,
  MAX_PAGE_SIZE
} from "./defaults"

export const paginationResponse = z.object({
  total: z.number(),

  page: z
    .number()
    .min(1)
    .default(1),

  pageSize: z
    .number()
    .min(MIN_PAGE_SIZE, {
      error: `The minimum page size is ${MIN_PAGE_SIZE}`
    })
    .max(MAX_PAGE_SIZE, {
      error: `The maximum page size is ${MAX_PAGE_SIZE}`
    })
    .default(MIN_PAGE_SIZE)
})

export const infiniteResponse = z.object({
  // Items in the returned page
  count: z.number(),
  // Items matching the request filters across all pages
  total: z.number().int().min(0)
})

export const paginationRequest = z.object({
  page: z
    .number()
    .min(1)
    .default(1),

  pageSize: z
    .number()
    .min(MIN_PAGE_SIZE, {
      error: `The minimum page size is ${MIN_PAGE_SIZE}`
    })
    .max(MAX_PAGE_SIZE, {
      error: `The maximum page size is ${MAX_PAGE_SIZE}`
    })
    .default(MIN_PAGE_SIZE)
})

export const infiniteRequest = z.object({
  page: z.coerce.number().int().min(0),
  limit: z.coerce.number().int().min(1)
})
