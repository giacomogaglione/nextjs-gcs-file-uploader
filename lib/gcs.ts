import "server-only"

import crypto from "node:crypto"
import { Storage } from "@google-cloud/storage"
import { z } from "zod"

import { getServerEnv } from "@/lib/env"

const serviceAccountSchema = z.object({
  client_email: z.string().email(),
  private_key: z.string().min(1)
})

export interface CreateSignedUploadUrlInput {
  userId: string
  fileName: string
  contentType: string
}

export interface SignedUploadUrlResult {
  method: "PUT"
  uploadUrl: string
  headers: Record<string, string>
  objectName: string
  publicUrl: string
  expiresAt: string
}

let storageClient: Storage | null = null

function getStorageClient(): Storage {
  if (storageClient) {
    return storageClient
  }

  const env = getServerEnv()

  let parsed: unknown
  try {
    parsed = JSON.parse(env.GCP_SERVICE_ACCOUNT_KEY)
  } catch (error) {
    throw new Error(
      `GCP_SERVICE_ACCOUNT_KEY must be valid JSON: ${(error as Error).message}`
    )
  }

  const credentials = serviceAccountSchema.parse(parsed)

  storageClient = new Storage({
    projectId: env.GCP_PROJECT_ID,
    credentials
  })

  return storageClient
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[/\\]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120)
}

function buildObjectName(userId: string, fileName: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const random = crypto.randomBytes(6).toString("hex")
  const safeName = sanitizeFileName(fileName) || "upload.bin"
  return `uploads/${userId}/${timestamp}-${random}-${safeName}`
}

function buildPublicUrl(bucketName: string, objectName: string): string {
  const encodedPath = objectName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")

  return `https://storage.googleapis.com/${bucketName}/${encodedPath}`
}

/**
 * GCP setup notes:
 * 1. Create a service account dedicated to uploads.
 * 2. Grant minimal IAM roles:
 *    - roles/storage.objectCreator
 *    - roles/storage.objectViewer (optional, only if your app needs reads)
 * 3. Generate a JSON key for that service account.
 * 4. Set GCP_SERVICE_ACCOUNT_KEY as the full JSON string in .env.local.
 *
 * GCS bucket CORS (required for direct browser uploads):
 * 1. Create cors.json (example in README).
 * 2. Apply: gsutil cors set cors.json gs://YOUR_BUCKET_NAME
 * 3. Verify: gsutil cors get gs://YOUR_BUCKET_NAME
 */
export async function createSignedUploadUrl(
  input: CreateSignedUploadUrlInput
): Promise<SignedUploadUrlResult> {
  const env = getServerEnv()
  const storage = getStorageClient()
  const objectName = buildObjectName(input.userId, input.fileName)

  const expiresMs = Date.now() + 15 * 60 * 1000
  const file = storage.bucket(env.GCS_BUCKET_NAME).file(objectName)

  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: expiresMs,
    contentType: input.contentType
  })

  return {
    method: "PUT",
    uploadUrl,
    headers: {
      "Content-Type": input.contentType
    },
    objectName,
    publicUrl: buildPublicUrl(env.GCS_BUCKET_NAME, objectName),
    expiresAt: new Date(expiresMs).toISOString()
  }
}
