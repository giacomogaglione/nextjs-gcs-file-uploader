export interface UploadSignRequest {
  fileName: string
  contentType: string
}

export interface UploadSignResponse {
  method: "PUT"
  uploadUrl: string
  headers: Record<string, string>
  objectName: string
  publicUrl: string
  expiresAt: string
}

export interface ApiErrorResponse {
  error: string
  details?: unknown
}
