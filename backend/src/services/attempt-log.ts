/**
 * Builds the provider_attempt_log payload from failover result.
 * Never throws; never includes secrets, tokens, or full card data.
 */
const SENSITIVE =
  /\b(api[_-]?key|authorization|bearer|secret|token|password)\b|nxp_live_[a-f0-9]+|nxps_[a-f0-9]+|gotham_live_[a-f0-9]+|smoke_live_[a-f0-9]+|kvk_live_[a-f0-9]+|eyJ[A-Za-z0-9_-]{20,}/gi;

function sanitizeMessage(message: unknown): string | undefined {
  if (typeof message !== "string") return undefined;
  const clipped = message.slice(0, 200);
  return clipped.replace(SENSITIVE, "[redacted]");
}

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
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (/secret|token|key|password|authorization/i.test(k)) continue;
          cleaned[k] = v;
        }
        cleaned.message = sanitizeMessage(message);
        return cleaned;
      });
    }
    return log;
  } catch {
    return null;
  }
}
