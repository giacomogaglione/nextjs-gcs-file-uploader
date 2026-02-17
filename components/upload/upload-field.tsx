"use client"

import type { UploadedFile } from "@/hooks/use-file-upload"
import {
  Controller,
  type Control,
  type FieldPathByValue,
  type FieldValues,
  type PathValue,
  type RegisterOptions
} from "react-hook-form"

import { Uploader } from "@/components/upload/uploader"

export type UploadFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, UploadedFile[] | undefined>
> = {
  control: Control<TFieldValues>
  name: TName
  rules?: RegisterOptions<TFieldValues, TName>
  shouldUnregister?: boolean
  defaultValue?: UploadedFile[]
  authStubHeader?: string
  maxParallelUploads?: number
  onUploadedFilesChange?: (files: UploadedFile[]) => void
}

export function UploadField<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, UploadedFile[] | undefined>
>({
  control,
  name,
  rules,
  shouldUnregister,
  defaultValue,
  authStubHeader,
  maxParallelUploads,
  onUploadedFilesChange
}: UploadFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      shouldUnregister={shouldUnregister}
      defaultValue={(defaultValue ?? []) as PathValue<TFieldValues, TName>}
      render={({ field }) => (
        <Uploader
          authStubHeader={authStubHeader}
          maxParallelUploads={maxParallelUploads}
          onUploadedFilesChange={(files) => {
            field.onChange(files as PathValue<TFieldValues, TName>)
            onUploadedFilesChange?.(files)
          }}
        />
      )}
    />
  )
}
