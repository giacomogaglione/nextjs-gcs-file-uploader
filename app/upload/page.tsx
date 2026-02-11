import { Uploader } from "@/components/upload/uploader"

export default function UploadPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          File Uploader
        </h1>
        <p className="text-muted-foreground">
          Drag and drop files to upload directly to Google Cloud Storage.
        </p>
      </div>
      <Uploader />
    </main>
  )
}
