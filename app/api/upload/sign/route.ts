import { NextResponse } from "next/server"
import { z } from "zod"

import type { ApiErrorResponse, UploadSignResponse } from "@/types/upload"
import { AuthError, requireUser } from "@/lib/auth"
import { createSignedUploadUrl } from "@/lib/gcs"

export const runtime = "nodejs"

const signRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255)
})

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)

    const json = (await request.json()) as unknown
    const input = signRequestSchema.parse(json)

    const signed = await createSignedUploadUrl({
      userId: user.id,
      fileName: input.fileName,
      contentType: input.contentType
    })

    return NextResponse.json<UploadSignResponse>(signed, { status: 200 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json<ApiErrorResponse>(
        { error: error.message },
        { status: error.statusCode }
      )
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json<ApiErrorResponse>(
        {
          error: "Invalid request payload",
          details: error.flatten()
        },
        { status: 400 }
      )
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json<ApiErrorResponse>(
        { error: "Invalid JSON request body" },
        { status: 400 }
      )
    }

    return NextResponse.json<ApiErrorResponse>(
      {
        error: "Failed to generate signed upload URL",
        details: error instanceof Error ? error.message : "Unknown server error"
      },
      { status: 500 }
    )
  }
}
