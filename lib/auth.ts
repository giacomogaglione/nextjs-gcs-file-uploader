export class AuthError extends Error {
  public readonly statusCode: number

  constructor(message = "Unauthorized", statusCode = 401) {
    super(message)
    this.name = "AuthError"
    this.statusCode = statusCode
  }
}

export interface SessionUser {
  id: string
  email?: string
}

/**
 * Auth stub:
 * Replace with your real auth provider integration (Auth.js/Clerk/Firebase/etc).
 */
export async function requireUser(request: Request): Promise<SessionUser> {
  const userId = request.headers.get("x-user-id")?.trim()

  if (!userId) {
    throw new AuthError("Missing authentication context", 401)
  }

  return { id: userId }
}
