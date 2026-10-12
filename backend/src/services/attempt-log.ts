/**
 * Builds the provider_attempt_log payload from failover result.
 * Never throws; never includes secrets.
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
        return {
          ...rest,
          message: typeof message === "string" ? message.slice(0, 200) : undefined,
        };
      });
    }
    return log;
  } catch {
    return null;
  }
}
