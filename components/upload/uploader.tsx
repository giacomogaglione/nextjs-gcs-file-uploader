"use client"

import { useRef } from "react"
import type { UploadedFile, UploadStatus } from "@/hooks/use-file-upload"
import { formatBytes, useFileUpload } from "@/hooks/use-file-upload"
import {
  CheckCircle2,
  FileText,
  ImageIcon,
  Loader2,
  Trash2,
  UploadCloud,
  XCircle
} from "lucide-react"

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

export type UploaderProps = {
  authStubHeader?: string
  maxParallelUploads?: number
  onUploadedFilesChange?: (files: UploadedFile[]) => void
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

export function Uploader({
  authStubHeader,
  maxParallelUploads,
  onUploadedFilesChange
}: UploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const {
    items,
    isDragging,
    setIsDragging,
    activeUploads,
    successCount,
    handleInputChange,
    handleDrop,
    removeItem,
    clearFinished
  } = useFileUpload({
    authStubHeader,
    maxParallelUploads,
    onUploadedFilesChange
  })

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
                            onClick={() => removeItem(item.id)}
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
