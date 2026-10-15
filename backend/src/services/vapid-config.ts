/**
 * Pure VAPID presence checks — safe to import in unit tests without loading
 * Supabase/env bootstrap.
 */
export function vapidConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export function getVapidPublicKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.VAPID_PUBLIC_KEY || null;
}
