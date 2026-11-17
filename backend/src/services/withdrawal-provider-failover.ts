/**
 * Failover de saque PIX entre adquirentes da família Nexus-like.
 * Ordem: NexusPag → GothamPay → SmokePay → ProfanusPay (só as configuradas).
 * Timeout curto por tentativa para o cliente não ficar esperando.
 * Nunca tenta em paralelo (evita saque duplicado).
 */

export type WithdrawPixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random" | "qrc";

export type WithdrawAcquirerId = "nexuspag" | "gothampay" | "smokepay" | "profanuspay";

const ORDER: WithdrawAcquirerId[] = ["nexuspag", "gothampay", "smokepay", "profanuspay"];

/** Timeout agressivo por adquirente — UX de saque não pode “travar”. */
const ATTEMPT_TIMEOUT_MS = 8_000;

const ENV_MAP: Record<
  WithdrawAcquirerId,
  { key: string; base: string; defaultBase: string; label: string }
> = {
  nexuspag: {
    key: "NEXUSPAG_API_KEY",
    base: "NEXUSPAG_BASE_URL",
    defaultBase: "https://nexuspag.com",
    label: "NexusPag",
  },
  gothampay: {
    key: "GOTHAMPAY_API_KEY",
    base: "GOTHAMPAY_BASE_URL",
    defaultBase: "https://gothampay.com.br",
    label: "GothamPay",
  },
  smokepay: {
    key: "SMOKEPAY_API_KEY",
    base: "SMOKEPAY_BASE_URL",
    defaultBase: "https://smokepay.com.br",
    label: "SmokePay",
  },
  profanuspay: {
    key: "PROFANUSPAY_API_KEY",
    base: "PROFANUSPAY_BASE_URL",
    defaultBase: "https://nexuspag.com",
    label: "ProfanusPay",
  },
};

function mapWithdrawalKeyType(type: string): string {
  const t = (type || "").toLowerCase();
  if (t === "evp" || t === "aleatoria") return "random";
  if (t === "telefone" || t === "celular") return "phone";
  return t || "random";
}

function reaisToCents(v: number): number {
  return Math.round(Number(v) * 100);
}

function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

export function listConfiguredWithdrawAcquirers(): WithdrawAcquirerId[] {
  return ORDER.filter((id) => Boolean(process.env[ENV_MAP[id].key]?.trim()));
}

export type WithdrawAttemptLog = {
  providerId: WithdrawAcquirerId;
  label: string;
  outcome: "success" | "failed" | "skipped";
  latencyMs: number;
  message?: string;
  statusCode?: number;
};

export type WithdrawProviderSuccess = {
  success: true;
  providerId: WithdrawAcquirerId;
  id: string;
  status: string;
  e2eId?: string | null;
  feeCents?: number;
  receiverName?: string | null;
  rawResponse: unknown;
  attemptLog: WithdrawAttemptLog[];
};

export type WithdrawProviderFailure = {
  success: false;
  attemptLog: WithdrawAttemptLog[];
  errorMessage: string;
};

async function createOnAcquirer(
  providerId: WithdrawAcquirerId,
  params: {
    amountCents: number;
    pixKey: string;
    pixKeyType: string;
    description?: string;
  }
): Promise<{
  id: string;
  status: string;
  e2eId?: string | null;
  feeCents?: number;
  receiverName?: string | null;
  rawResponse: unknown;
}> {
  const cfg = ENV_MAP[providerId];
  const apiKey = process.env[cfg.key]?.trim();
  if (!apiKey) {
    const err = new Error(`${cfg.label}: sem API key`) as Error & { status?: number };
    err.status = 503;
    throw err;
  }
  const base = (process.env[cfg.base] || cfg.defaultBase).replace(/\/$/, "");

  const body: Record<string, unknown> = {
    amount: centsToReais(params.amountCents),
    pix_key: params.pixKey,
    pix_key_type: mapWithdrawalKeyType(params.pixKeyType),
  };
  if (params.description) body.description = params.description;

  const res = await fetch(`${base}/api/withdrawals`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
  });

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data) {
    const error = new Error(
      `${cfg.label} saque HTTP ${res.status}: ${JSON.stringify(data)}`
    ) as Error & { status?: number; code?: string };
    error.status = res.status;
    if (res.status === 429) error.code = "cooldown";
    if (res.status === 403 && (data as { requires_kyc?: boolean } | null)?.requires_kyc) {
      error.code = "requires_kyc";
    }
    throw error;
  }

  const withdrawal = (data.withdrawal as Record<string, unknown> | undefined) ?? data;
  const id = String(
    data.withdrawal_id || data.id || withdrawal?.id || withdrawal?.withdrawal_id || ""
  );
  const status = String(data.status || withdrawal?.status || "processing").toLowerCase();

  const e2e =
    (withdrawal?.gateway_e2eid as string | undefined) ||
    (withdrawal?.end_to_end_id as string | undefined) ||
    (withdrawal?.e2e_id as string | undefined) ||
    (data.gateway_e2eid as string | undefined) ||
    null;

  const receiverName =
    (withdrawal?.recipient_name as string | undefined) ||
    (withdrawal?.beneficiary_name as string | undefined) ||
    (data.recipient_name as string | undefined) ||
    null;

  const feeRaw = withdrawal?.fee ?? data.fee;
  const feeCents =
    typeof feeRaw === "number"
      ? feeRaw > 50
        ? Math.round(feeRaw)
        : reaisToCents(feeRaw)
      : undefined;

  return {
    id,
    status,
    e2eId: e2e,
    feeCents,
    receiverName,
    rawResponse: data,
  };
}

/**
 * Tenta saque em sequência: Nexus primeiro, depois as demais configuradas.
 */
export async function createWithdrawalWithFailover(params: {
  amountCents: number;
  pixKey: string;
  pixKeyType: string;
  description?: string;
  /** Se definido, força ordem (ainda filtra só configuradas). */
  preferredOrder?: WithdrawAcquirerId[];
}): Promise<WithdrawProviderSuccess | WithdrawProviderFailure> {
  const order = (params.preferredOrder?.length ? params.preferredOrder : ORDER).filter((id) =>
    Boolean(process.env[ENV_MAP[id].key]?.trim())
  );

  const attemptLog: WithdrawAttemptLog[] = [];

  if (!order.length) {
    return {
      success: false,
      attemptLog,
      errorMessage: "Nenhuma adquirente de saque configurada.",
    };
  }

  for (const providerId of order) {
    const label = ENV_MAP[providerId].label;
    const t0 = Date.now();
    try {
      const result = await createOnAcquirer(providerId, params);
      const latencyMs = Date.now() - t0;
      attemptLog.push({
        providerId,
        label,
        outcome: "success",
        latencyMs,
      });
      console.info(
        JSON.stringify({
          tag: "withdrawal_failover",
          providerId,
          outcome: "success",
          latencyMs,
          attempts: attemptLog.length,
        })
      );
      return {
        success: true,
        providerId,
        id: result.id,
        status: result.status,
        e2eId: result.e2eId,
        feeCents: result.feeCents,
        receiverName: result.receiverName,
        rawResponse: result.rawResponse,
        attemptLog,
      };
    } catch (err) {
      const latencyMs = Date.now() - t0;
      const e = err as Error & { status?: number; code?: string };
      attemptLog.push({
        providerId,
        label,
        outcome: "failed",
        latencyMs,
        message: (e.message || "erro").slice(0, 200),
        statusCode: e.status,
      });
      console.warn(
        JSON.stringify({
          tag: "withdrawal_failover",
          providerId,
          outcome: "failed",
          latencyMs,
          status: e.status,
          code: e.code,
          message: (e.message || "").slice(0, 160),
        })
      );
      // KYC/forbidden nesta adquirente: tenta a próxima (outra conta pode estar ok)
      continue;
    }
  }

  const last = attemptLog.filter((a) => a.outcome === "failed").pop();
  return {
    success: false,
    attemptLog,
    errorMessage:
      last?.message ||
      "Nenhuma adquirente conseguiu processar o saque no momento.",
  };
}
