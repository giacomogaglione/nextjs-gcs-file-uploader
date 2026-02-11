import type { ReactNode } from "react"
import type { Metadata } from "next"
import { Geist } from "next/font/google"

import "./globals.css"

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"]
})

export const metadata: Metadata = {
  title: "Next.js GCS File Uploader",
  description:
    "Secure direct file uploads to Google Cloud Storage using signed URLs"
}

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased`}>{children}</body>
    </html>
  )
}
