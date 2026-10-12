/**
 * Builds the provider_attempt_log payload from failover result.
 * Never throws; strips secrets, tokens, and sensitive key names (including nested).
 */

/** Matches common credential shapes inside free-text error messages. */
const SENSITIVE_IN_TEXT =
  /\b(api[_-]?key|authorization|bearer|secret|password|passwd|access[_-]?token|refresh[_-]?token|client[_-]?secret|webhook[_-]?secret)\b/gi;

/** Live/test key prefixes used by FluxPay acquirers and common payment providers. */
const KEY_MATERIAL =
  /\b(nxp_live_|nxps_|gotham_live_|smoke_live_|kvk_live_|sk_live_|sk_test_|pk_live_|pk_test_|rk_live_|whsec_)[A-Za-z0-9_-]{8,}\b/gi;

/** JWT-shaped blobs and long hex secrets. */
const JWT_OR_LONG =
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|\b[A-Fa-f0-9]{32,}\b/g;

const SENSITIVE_KEY_NAME =
  /secret|token|password|passwd|authorization|api[_-]?key|credential|private[_-]?key|webhook[_-]?secret|access[_-]?key/i;

const MAX_MESSAGE_LEN = 200;
const MAX_DEPTH = 4;

export function sanitizeMessage(message: unknown): string | undefined {
  if (typeof message !== "string") return undefined;
  let clipped = message.slice(0, MAX_MESSAGE_LEN);
  clipped = clipped.replace(SENSITIVE_IN_TEXT, "[redacted]");
  clipped = clipped.replace(KEY_MATERIAL, "[redacted]");
  clipped = clipped.replace(JWT_OR_LONG, "[redacted]");
  return clipped;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return undefined;
  if (value == null) return value;
  if (typeof value === "string") return sanitizeMessage(value) ?? value.slice(0, MAX_MESSAGE_LEN);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeValue(v, depth + 1));
  }
  if (typeof value === "object") {
    return sanitizeObject(value as Record<string, unknown>, depth + 1);
  }
  return undefined;
}

function sanitizeObject(
  obj: Record<string, unknown>,
  depth: number
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_NAME.test(k)) continue;
    cleaned[k] = sanitizeValue(v, depth);
  }
  return cleaned;
}

/**
 * Pure helper: convert failover attemptLog into a DB-safe jsonb payload.
 */
export function buildAttemptLog(
  attemptResult: { attemptLog?: unknown } | null | undefined
): unknown | null {
  try {
    const log = attemptResult?.attemptLog;
    if (log == null) return null;
    if (Array.isArray(log)) {
      return log.map((entry) => {
        if (!entry || typeof entry !== "object") return entry;
        const { message, ...rest } = entry as Record<string, unknown>;
        const cleaned = sanitizeObject(rest, 0);
        cleaned.message = sanitizeMessage(message);
        return cleaned;
      });
    }
    if (typeof log === "object") {
      return sanitizeObject(log as Record<string, unknown>, 0);
    }
    return null;
  } catch {
    return null;
  }
}
