import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-balance text-slate-900 sm:text-5xl">
        Direct Uploads to Google Cloud Storage
      </h1>
      <p className="text-muted-foreground mt-4 max-w-xl text-base text-pretty sm:text-lg">
        Generate signed upload URLs on your Next.js backend, then upload files
        directly from the browser.
      </p>
      <Button asChild size="lg" className="mt-8">
        <Link href="/upload">Open Uploader</Link>
      </Button>
    </main>
  )
}
