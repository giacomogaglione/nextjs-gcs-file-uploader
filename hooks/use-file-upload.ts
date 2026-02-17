"use client"

import type { ChangeEvent, DragEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type {
  ApiErrorResponse,
  UploadSignRequest,
  UploadSignResponse
} from "@/types/upload"

export type UploadStatus =
  | "queued"
  | "signing"
  | "uploading"
  | "success"
  | "error"

export type UploadItem = {
  id: string
  file: File
  previewUrl: string | null
  progress: number
  status: UploadStatus
  error?: string
  publicUrl?: string
  objectName?: string
}

export type UploadedFile = {
  objectName: string
  publicUrl: string
  fileName: string
  contentType: string
  size: number
}

type DuplexRequestInit = RequestInit & {
  duplex?: "half"
}

type UseFileUploadOptions = {
  authStubHeader?: string
  maxParallelUploads?: number
  onUploadedFilesChange?: (files: UploadedFile[]) => void
}

const DEFAULT_CONTENT_TYPE = "application/octet-stream"
const DEFAULT_AUTH_STUB_HEADER = "demo-user-123"
const DEFAULT_MAX_PARALLEL_UPLOADS = 3

function createUploadId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
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

async function requestSignedUrl(
  file: File,
  authStubHeader: string
): Promise<UploadSignResponse> {
  const payload: UploadSignRequest = {
    fileName: file.name,
    contentType: file.type || DEFAULT_CONTENT_TYPE
  }

  const response = await fetch("/api/upload/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": authStubHeader
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

export function formatBytes(bytes: number): string {
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

export function useFileUpload(options?: UseFileUploadOptions) {
  const authStubHeader = options?.authStubHeader ?? DEFAULT_AUTH_STUB_HEADER
  const maxParallelUploads =
    options?.maxParallelUploads ?? DEFAULT_MAX_PARALLEL_UPLOADS
  const onUploadedFilesChange = options?.onUploadedFilesChange

  const [items, setItems] = useState<UploadItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
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
        const signed = await requestSignedUrl(item.file, authStubHeader)

        updateItem(item.id, (current) => ({
          ...current,
          status: "uploading",
          progress: Math.max(current.progress, 10),
          publicUrl: signed.publicUrl,
          objectName: signed.objectName
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
          objectName: signed.objectName,
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
    [authStubHeader, updateItem]
  )

  const startUploads = useCallback(
    async (pendingItems: UploadItem[]) => {
      if (pendingItems.length === 0) {
        return
      }

      await runUploadWorkers(pendingItems, maxParallelUploads, uploadSingle)
    },
    [maxParallelUploads, uploadSingle]
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

  const removeItem = useCallback((id: string) => {
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

  const uploadedFiles = useMemo<UploadedFile[]>(
    () =>
      items
        .filter(
          (
            item
          ): item is UploadItem & { publicUrl: string; objectName: string } =>
            item.status === "success" &&
            typeof item.publicUrl === "string" &&
            typeof item.objectName === "string"
        )
        .map((item) => ({
          objectName: item.objectName,
          publicUrl: item.publicUrl,
          fileName: item.file.name,
          contentType: item.file.type || DEFAULT_CONTENT_TYPE,
          size: item.file.size
        })),
    [items]
  )

  const uploadedSignature = useMemo(
    () => uploadedFiles.map((file) => file.objectName).join("::"),
    [uploadedFiles]
  )
  const uploadedSignatureRef = useRef("")

  useEffect(() => {
    if (!onUploadedFilesChange) {
      return
    }

    if (uploadedSignatureRef.current === uploadedSignature) {
      return
    }

    uploadedSignatureRef.current = uploadedSignature
    onUploadedFilesChange(uploadedFiles)
  }, [onUploadedFilesChange, uploadedFiles, uploadedSignature])

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

  return {
    items,
    uploadedFiles,
    isDragging,
    setIsDragging,
    activeUploads,
    successCount,
    addFiles,
    handleInputChange,
    handleDrop,
    removeItem,
    clearFinished
  }
}
