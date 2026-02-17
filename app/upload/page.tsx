"use client"

import { useMemo, useState } from "react"
import type { UploadedFile } from "@/hooks/use-file-upload"
import { useForm, useWatch } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { UploadField } from "@/components/upload/upload-field"

type UploadFormValues = {
  files: UploadedFile[]
}

export default function UploadPage() {
  const [submittedFiles, setSubmittedFiles] = useState<UploadedFile[]>([])
  const form = useForm<UploadFormValues>({
    defaultValues: {
      files: []
    }
  })

  const currentFiles =
    useWatch({
      control: form.control,
      name: "files"
    }) ?? []
  const currentCount = currentFiles.length
  const canSubmit = currentCount > 0

  const onSubmit = (values: UploadFormValues) => {
    setSubmittedFiles(values.files)
  }

  const submittedCount = submittedFiles.length
  const statusText = useMemo(() => {
    if (submittedCount === 0) {
      return "No files submitted yet."
    }

    return `${submittedCount} uploaded file${submittedCount === 1 ? "" : "s"} submitted.`
  }, [submittedCount])

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          File Uploader
        </h1>
        <p className="text-muted-foreground">
          Upload directly to Google Cloud Storage and keep uploaded file
          metadata in React Hook Form state.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <UploadField
          control={form.control}
          name="files"
          rules={{
            validate: (value) =>
              value.length > 0 || "Upload at least one file before submitting."
          }}
        />

        {form.formState.errors.files?.message ? (
          <p className="text-destructive text-sm">
            {form.formState.errors.files.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canSubmit}>
            Save uploaded files
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              form.reset({ files: [] })
              setSubmittedFiles([])
            }}
          >
            Reset form
          </Button>
          <p className="text-muted-foreground text-sm">
            {currentCount} file{currentCount === 1 ? "" : "s"} in form state.
          </p>
        </div>
      </form>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Submit Result</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">{statusText}</p>

          {submittedFiles.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {submittedFiles.map((file) => (
                <li key={file.objectName} className="rounded-md border p-3">
                  <p className="truncate font-medium text-slate-900">
                    {file.fileName}
                  </p>
                  <a
                    href={file.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 hover:underline"
                  >
                    {file.publicUrl}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
