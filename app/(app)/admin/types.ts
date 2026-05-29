// Shared types for the admin user-management feature.
// Kept in a plain module (NOT the 'use server' actions file, which may only
// export async functions).

export type ActionResult = {
  ok: boolean
  message: string
  /** Set on create-with-password so the admin can hand it over once. */
  tempPassword?: string
}
