"use client"

import type { ChangeEvent, DragEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CheckCircle2,
  FileText,
  ImageIcon,
  Loader2,
  Trash2,
  UploadCloud,
  XCircle
} from "lucide-react"

import type {
  ApiErrorResponse,
  UploadSignRequest,
  UploadSignResponse
} from "@/types/upload"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

type UploadStatus = "queued" | "signing" | "uploading" | "success" | "error"

interface UploadItem {
  id: string
  file: File
  previewUrl: string | null
  progress: number
  status: UploadStatus
  error?: string
  publicUrl?: string
}

type DuplexRequestInit = RequestInit & {
  duplex?: "half"
}

const MAX_PARALLEL_UPLOADS = 3
const DEFAULT_CONTENT_TYPE = "application/octet-stream"
const AUTH_STUB_HEADER = "demo-user-123"

function createUploadId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB", "TB"]
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const unit = units[unitIndex] ?? "B"
  const value = bytes / 1024 ** unitIndex

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${unit}`
}

async function readApiError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as ApiErrorResponse
    if (typeof data.error === "string" && data.error.trim().length > 0) {
      return data.error
    }
  } catch {
    // ignore response parsing failures
  }

  return `Request failed with ${response.status} ${response.statusText}`
}

async function requestSignedUrl(file: File): Promise<UploadSignResponse> {
  const payload: UploadSignRequest = {
    fileName: file.name,
    contentType: file.type || DEFAULT_CONTENT_TYPE
  }

  const response = await fetch("/api/upload/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": AUTH_STUB_HEADER
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  return (await response.json()) as UploadSignResponse
}

async function uploadFileDirectToGcs(
  file: File,
  signed: UploadSignResponse,
  onProgress: (progress: number) => void
): Promise<void> {
  const headers = new Headers(signed.headers)
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", file.type || DEFAULT_CONTENT_TYPE)
  }

  if (file.size === 0 || typeof file.stream !== "function") {
    const fallbackResponse = await fetch(signed.uploadUrl, {
      method: signed.method,
      headers,
      body: file
    })

    if (!fallbackResponse.ok) {
      throw new Error(`GCS upload failed with ${fallbackResponse.status}`)
    }

    onProgress(100)
    return
  }

  const reader = file.stream().getReader()
  let uploadedBytes = 0

  const trackedBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        controller.close()
        return
      }

      uploadedBytes += value.byteLength
      const percent = Math.min(
        99,
        Math.max(1, Math.round((uploadedBytes / file.size) * 100))
      )
      onProgress(percent)
      controller.enqueue(value)
    },
    cancel(reason) {
      void reader.cancel(reason)
    }
  })

  const requestInit: DuplexRequestInit = {
    method: signed.method,
    headers,
    body: trackedBody,
    duplex: "half"
  }

  let response: Response
  try {
    response = await fetch(signed.uploadUrl, requestInit)
  } catch {
    const fallbackResponse = await fetch(signed.uploadUrl, {
      method: signed.method,
      headers,
      body: file
    })

    if (!fallbackResponse.ok) {
      throw new Error(`GCS upload failed with ${fallbackResponse.status}`)
    }

    onProgress(100)
    return
  }

  if (!response.ok) {
    throw new Error(`GCS upload failed with ${response.status}`)
  }

  onProgress(100)
}

async function runUploadWorkers<T>(
  entries: T[],
  concurrency: number,
  worker: (entry: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0
  const workers = Math.max(1, Math.min(concurrency, entries.length))

  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (nextIndex < entries.length) {
        const current = entries[nextIndex]
        nextIndex += 1

        if (current === undefined) {
          continue
        }

        await worker(current)
      }
    })
  )
}

function getStatusBadge(status: UploadStatus) {
  if (status === "success") {
    return (
      <Badge variant="secondary" className="gap-1 text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
      </Badge>
    )
  }

  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3.5 w-3.5" /> Failed
      </Badge>
    )
  }

  if (status === "signing" || status === "uploading") {
    return (
      <Badge variant="outline" className="gap-1 text-blue-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading
      </Badge>
    )
  }

  return <Badge variant="outline">Queued</Badge>
}

export function Uploader() {
  const [items, setItems] = useState<UploadItem[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewMapRef = useRef<Map<string, string>>(new Map())

  const updateItem = useCallback(
    (id: string, updater: (item: UploadItem) => UploadItem) => {
      setItems((current) =>
        current.map((item) => (item.id === id ? updater(item) : item))
      )
    },
    []
  )

  const uploadSingle = useCallback(
    async (item: UploadItem) => {
      updateItem(item.id, (current) => ({
        ...current,
        status: "signing",
        progress: Math.max(current.progress, 5),
        error: undefined
      }))

      try {
        const signed = await requestSignedUrl(item.file)

        updateItem(item.id, (current) => ({
          ...current,
          status: "uploading",
          progress: Math.max(current.progress, 10),
          publicUrl: signed.publicUrl
        }))

        await uploadFileDirectToGcs(item.file, signed, (progress) => {
          updateItem(item.id, (current) => ({
            ...current,
            status: "uploading",
            progress
          }))
        })

        updateItem(item.id, (current) => ({
          ...current,
          status: "success",
          progress: 100,
          publicUrl: signed.publicUrl,
          error: undefined
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed"
        updateItem(item.id, (current) => ({
          ...current,
          status: "error",
          error: message
        }))
      }
    },
    [updateItem]
  )

  const startUploads = useCallback(
    async (pendingItems: UploadItem[]) => {
      if (pendingItems.length === 0) {
        return
      }

      await runUploadWorkers(pendingItems, MAX_PARALLEL_UPLOADS, uploadSingle)
    },
    [uploadSingle]
  )

  const addFiles = useCallback(
    (inputFiles: FileList | File[]) => {
      const files = Array.from(inputFiles)
      if (files.length === 0) {
        return
      }

      const newItems = files.map<UploadItem>((file) => {
        const id = createUploadId()
        const previewUrl = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : null

        if (previewUrl) {
          previewMapRef.current.set(id, previewUrl)
        }

        return {
          id,
          file,
          previewUrl,
          progress: 0,
          status: "queued"
        }
      })

      setItems((current) => [...newItems, ...current])
      void startUploads(newItems)
    },
    [startUploads]
  )

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
        addFiles(event.target.files)
      }

      event.target.value = ""
    },
    [addFiles]
  )

  const handleRemoveItem = useCallback((id: string) => {
    setItems((current) => {
      const match = current.find((item) => item.id === id)
      if (match?.previewUrl) {
        URL.revokeObjectURL(match.previewUrl)
        previewMapRef.current.delete(id)
      }

      return current.filter((item) => item.id !== id)
    })
  }, [])

  const clearFinished = useCallback(() => {
    setItems((current) => {
      const nextItems = current.filter(
        (item) => item.status !== "success" && item.status !== "error"
      )

      for (const item of current) {
        if (
          (item.status === "success" || item.status === "error") &&
          item.previewUrl
        ) {
          URL.revokeObjectURL(item.previewUrl)
          previewMapRef.current.delete(item.id)
        }
      }

      return nextItems
    })
  }, [])

  useEffect(() => {
    const previewMap = previewMapRef.current

    return () => {
      for (const previewUrl of previewMap.values()) {
        URL.revokeObjectURL(previewUrl)
      }

      previewMap.clear()
    }
  }, [])

  const activeUploads = useMemo(
    () =>
      items.filter(
        (item) => item.status === "signing" || item.status === "uploading"
      ).length,
    [items]
  )

  const successCount = useMemo(
    () => items.filter((item) => item.status === "success").length,
    [items]
  )

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)

      if (event.dataTransfer.files?.length) {
        addFiles(event.dataTransfer.files)
      }
    },
    [addFiles]
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Files</CardTitle>
          <CardDescription>
            This starter uses an auth stub via the <code>x-user-id</code>{" "}
            header. Replace it with your real auth session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setIsDragging(false)
            }}
            onDrop={handleDrop}
            className={cn(
              "group relative rounded-xl border border-dashed px-6 py-12 text-center transition",
              isDragging
                ? "border-primary bg-primary/10"
                : "hover:border-primary/60 border-slate-300 bg-slate-50 hover:bg-blue-50/60"
            )}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="text-primary rounded-full border border-slate-200 bg-white p-3 shadow-sm">
                <UploadCloud className="h-6 w-6" />
              </div>
              <p className="text-muted-foreground text-sm">
                Drag and drop files here, or click to choose files.
              </p>
              <p className="text-xs text-slate-500">
                Multiple files are supported.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleInputChange}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-muted-foreground text-sm">
              {items.length} files in queue, {activeUploads} active,{" "}
              {successCount} completed.
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Add files
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFinished}
                disabled={items.every(
                  (item) => item.status !== "success" && item.status !== "error"
                )}
              >
                Clear finished
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload Queue</CardTitle>
          <CardDescription>
            Files are uploaded directly from the browser to GCS using signed
            URLs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
              No files selected yet.
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border bg-white p-4 shadow-sm"
                >
                  <div className="flex gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-slate-50">
                      {item.previewUrl ? (
                        // Blob previews need a regular <img> element.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="h-full w-full object-cover"
                        />
                      ) : item.file.type.startsWith("image/") ? (
                        <ImageIcon className="h-5 w-5 text-slate-400" />
                      ) : (
                        <FileText className="h-5 w-5 text-slate-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {item.file.name}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {formatBytes(item.file.size)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(item.status)}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleRemoveItem(item.id)}
                            aria-label={`Remove ${item.file.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Progress value={item.progress} />
                        <div className="text-muted-foreground text-right text-xs">
                          {item.progress}%
                        </div>
                      </div>

                      {item.status === "error" && item.error ? (
                        <p className="text-destructive text-xs">{item.error}</p>
                      ) : null}

                      {item.status === "success" && item.publicUrl ? (
                        <a
                          href={item.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex text-xs font-medium text-blue-700 hover:underline"
                        >
                          Open uploaded file
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
