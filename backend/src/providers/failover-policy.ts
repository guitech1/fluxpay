/**
 * Política de failover multi-adquirente (pura, testável).
 * - Falha definitiva (4xx de negócio, 5xx, 429, refused): pode tentar próxima.
 * - Resultado desconhecido (timeout após request enviado, abort): NÃO avança.
 * - Orçamento total e timeout por tentativa limitam latência.
 */

export type ErrorCategory =
  | "definitive"
  | "transient"
  | "unknown"
  | "circuit_open";

export interface AttemptDecision {
  /** Pode tentar a próxima adquirente? */
  continueFailover: boolean;
  category: ErrorCategory;
  reason: string;
}

export function classifyProviderError(err: {
  message?: string;
  name?: string;
  retryable?: boolean;
  ambiguous?: boolean;
  statusCode?: number;
}): AttemptDecision {
  // Timeout / abort após envio: cobrança pode ter sido criada no provedor.
  if (err.ambiguous === true || err.name === "AbortError") {
    return {
      continueFailover: false,
      category: "unknown",
      reason: "ambiguous_timeout_or_abort",
    };
  }

  const msg = (err.message || "").toLowerCase();
  if (msg.includes("timeout") || msg.includes("aborted")) {
    return {
      continueFailover: false,
      category: "unknown",
      reason: "timeout_message",
    };
  }

  // Conexão recusada / DNS: request quase certamente não chegou ao PIX.
  if (
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("econnreset") ||
    msg.includes("network") ||
    msg === "rede"
  ) {
    return {
      continueFailover: true,
      category: "transient",
      reason: "connection_failure",
    };
  }

  const code = err.statusCode;
  if (typeof code === "number") {
    if (code === 429 || code >= 500) {
      return {
        continueFailover: true,
        category: "transient",
        reason: `http_${code}`,
      };
    }
    // 4xx de negócio: este provedor rejeitou; próximo pode aceitar.
    if (code >= 400 && code < 500) {
      return {
        continueFailover: true,
        category: "definitive",
        reason: `http_${code}`,
      };
    }
  }

  // Compat: retryable=true e não ambiguous → transiente (ex. 5xx marcado no adapter).
  if (err.retryable === true) {
    return {
      continueFailover: true,
      category: "transient",
      reason: "retryable_flag",
    };
  }

  // retryable=false explícito (ex. validação): ainda pode tentar outro adquirente.
  if (err.retryable === false) {
    return {
      continueFailover: true,
      category: "definitive",
      reason: "non_retryable_provider_error",
    };
  }

  // Desconhecido: não arriscar duplicar.
  return {
    continueFailover: false,
    category: "unknown",
    reason: "unclassified",
  };
}

export function computeMaxAttempts(params: {
  orderedLength: number;
  envMax?: number | null;
}): number {
  const n = Math.max(0, params.orderedLength);
  if (!n) return 0;
  // 0 / null / undefined → todas as elegíveis (sem teto artificial de 3).
  const envMax = params.envMax;
  if (envMax == null || envMax <= 0) return n;
  return Math.min(n, envMax);
}

export function remainingBudgetMs(params: {
  startedAt: number;
  totalBudgetMs: number;
  now?: number;
}): number {
  const now = params.now ?? Date.now();
  return Math.max(0, params.totalBudgetMs - (now - params.startedAt));
}

export function attemptTimeoutMs(params: {
  remainingBudgetMs: number;
  perAttemptTimeoutMs: number;
}): number {
  if (params.remainingBudgetMs <= 0) return 0;
  return Math.min(params.perAttemptTimeoutMs, params.remainingBudgetMs);
}

/** Circuit breaker em memória (por processo / instância Lambda). */
export class CircuitBreaker {
  private state = new Map<
    string,
    { failures: number; openUntil: number }
  >();

  constructor(
    private threshold: number,
    private openMs: number
  ) {}

  isOpen(id: string, now = Date.now()): boolean {
    const s = this.state.get(id);
    if (!s) return false;
    if (s.openUntil > now) return true;
    if (s.openUntil > 0 && s.openUntil <= now) {
      // half-open: limpa e permite uma tentativa
      this.state.delete(id);
    }
    return false;
  }

  recordSuccess(id: string): void {
    this.state.delete(id);
  }

  recordFailure(id: string, now = Date.now()): void {
    const s = this.state.get(id) || { failures: 0, openUntil: 0 };
    s.failures += 1;
    if (s.failures >= this.threshold) {
      s.openUntil = now + this.openMs;
    }
    this.state.set(id, s);
  }

  /** Só para testes */
  _debug(id: string) {
    return this.state.get(id);
  }
}

export function readFailoverEnv(env: NodeJS.ProcessEnv = process.env) {
  const num = (k: string, d: number) => {
    const v = env[k];
    if (v == null || v === "") return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  return {
    /** Timeout por tentativa de create PIX (ms). */
    perAttemptTimeoutMs: num("FLUXPAY_ACQUIRER_ATTEMPT_TIMEOUT_MS", 8000),
    /** Orçamento total da operação de failover (ms). */
    totalBudgetMs: num("FLUXPAY_ACQUIRER_TOTAL_BUDGET_MS", 22000),
    /** 0 = todas as elegíveis. */
    maxAttempts: num("FLUXPAY_ACQUIRER_MAX_ATTEMPTS", 0),
    circuitThreshold: num("FLUXPAY_CIRCUIT_BREAKER_THRESHOLD", 3),
    circuitOpenMs: num("FLUXPAY_CIRCUIT_BREAKER_MS", 60_000),
  };
}
