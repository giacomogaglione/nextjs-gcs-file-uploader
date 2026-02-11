import "server-only"

import { z } from "zod"

const envSchema = z.object({
  GCS_BUCKET_NAME: z.string().min(3, "GCS_BUCKET_NAME is required"),
  GCP_PROJECT_ID: z.string().min(3, "GCP_PROJECT_ID is required"),
  GCP_SERVICE_ACCOUNT_KEY: z
    .string()
    .min(2, "GCP_SERVICE_ACCOUNT_KEY is required and must be a JSON string")
})

export type ServerEnv = z.infer<typeof envSchema>

let cache: ServerEnv | null = null

export function getServerEnv(): ServerEnv {
  if (cache) {
    return cache
  }

  cache = envSchema.parse({
    GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME,
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
    GCP_SERVICE_ACCOUNT_KEY: process.env.GCP_SERVICE_ACCOUNT_KEY
  })

  return cache
}
