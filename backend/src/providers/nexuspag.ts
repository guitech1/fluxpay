import type { PaymentProvider, PaymentStatus, RefundStatus, PixDetails } from "../types/index.js";

/**
 * Provider NexusPag — adquirente real de PIX.
 *
 * Baseado na documentacao oficial (nexuspag-api.md):
 *   POST /api/pix/create   — cria a cobranca PIX (resposta aninhada em "transaction")
 *   GET  /api/pix/{id}     — consulta status (resposta PLANA, sem "transaction")
 *   POST /api/withdrawals  — saque da carteira PRINCIPAL (dona da API key)
 *   POST <webhook_url>     — notificacao "payment.confirmed" quando o PIX e pago
 *
 * O saque da carteira principal so deve ser chamado apos aprovacao administrativa
 * de um pedido de lojista (services/withdrawals.ts). Nunca no pedido direto.
 */

const NEXUSPAG_BASE_URL = process.env.NEXUSPAG_BASE_URL || "https://nexuspag.com";

function getApiKey(): string {
  const key = process.env.NEXUSPAG_API_KEY;
  if (!key) {
    throw new Error(
      "NEXUSPAG_API_KEY nao configurada. Defina no .env do backend antes de usar o provider 'nexuspag'."
    );
  }
  return key;
}

function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

function reaisToCents(reais: number): number {
  return Math.round(reais * 100);
}

interface NexusPagPixCreateResponse {
  success: boolean;
  transaction: {
    id: string;
    txid: string;
    external_id: string | null;
    amount: number;
    fee: number;
    fee_percent: number;
    net_amount: number;
    status: string;
    pix_copia_cola: string;
    qr_code_base64: string;
    expires_at: string;
  };
}

interface NexusPagPixConsultResponse {
  id: string;
  txid: string;
  external_id: string | null;
  status: "pending" | "paid" | "expired" | "cancelled" | string;
  amount: number;
  fee: number;
  net_amount: number;
  paid_at?: string | null;
  expires_at: string;
  pix_copia_cola?: string;
  qr_code_base64?: string;
}

function mapNexusPagStatus(status: string): PaymentStatus {
  switch (status) {
    case "pending":
      return "pending";
    case "paid":
      return "succeeded";
    case "expired":
      return "expired";
    case "cancelled":
    case "canceled":
      return "failed";
    default:
      return "pending";
  }
}

export class NexusPagProvider implements PaymentProvider {
  name = "nexuspag";

  async createPayment(params: {
    amount: number;
    currency: string;
    paymentMethodToken?: string;
    metadata?: Record<string, unknown>;
    description?: string;
    externalId?: string;
    webhookUrl?: string;
    expirationSeconds?: number;
  }): Promise<{
    providerPaymentId: string;
    status: PaymentStatus;
    rawResponse?: unknown;
    pix?: PixDetails;
  }> {
    if (params.currency !== "BRL") {
      throw new Error("NexusPag PIX so aceita cobrancas em BRL.");
    }

    const amountReais = centsToReais(params.amount);
    if (amountReais < 1) {
      throw new Error("Valor minimo para PIX na NexusPag e R$ 1,00.");
    }

    const body: Record<string, unknown> = { amount: amountReais };
    if (params.description) body.description = params.description;
    if (params.externalId) body.external_id = params.externalId;
    if (params.webhookUrl) body.webhook_url = params.webhookUrl;
    if (params.expirationSeconds) body.expiration = params.expirationSeconds;

    const response = await fetch(`${NEXUSPAG_BASE_URL}/api/pix/create`, {
      method: "POST",
      headers: {
        "x-api-key": getApiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json().catch(() => null)) as NexusPagPixCreateResponse | null;

    if (!response.ok || !data?.success) {
      throw new Error(
        `NexusPag recusou a cobranca PIX (HTTP ${response.status}): ${JSON.stringify(data)}`
      );
    }

    const tx = data.transaction;

    return {
      providerPaymentId: tx.id,
      status: mapNexusPagStatus(tx.status),
      rawResponse: data,
      pix: {
        txid: tx.txid,
        copyPaste: tx.pix_copia_cola,
        qrCodeBase64: tx.qr_code_base64,
        expiresAt: tx.expires_at,
        feeAmountCents: reaisToCents(tx.fee),
        netAmountCents: reaisToCents(tx.net_amount),
      },
    };
  }

  async getPayment(reference: string): Promise<{
    status: PaymentStatus;
    providerPaymentId?: string;
    rawResponse?: unknown;
    pix?: PixDetails;
  }> {
    const response = await fetch(`${NEXUSPAG_BASE_URL}/api/pix/${encodeURIComponent(reference)}`, {
      headers: { "x-api-key": getApiKey() },
    });

    if (response.status === 404) {
      throw new Error(`Transacao ${reference} nao encontrada na NexusPag.`);
    }

    const data = (await response.json().catch(() => null)) as NexusPagPixConsultResponse | null;

    if (!response.ok || !data) {
      throw new Error(`Falha ao consultar PIX na NexusPag (HTTP ${response.status}).`);
    }

    return {
      status: mapNexusPagStatus(data.status),
      providerPaymentId: data.id,
      rawResponse: data,
      pix: data.txid
        ? {
            txid: data.txid,
            copyPaste: data.pix_copia_cola ?? "",
            qrCodeBase64: data.qr_code_base64 ?? "",
            expiresAt: data.expires_at,
            feeAmountCents: reaisToCents(data.fee ?? 0),
            netAmountCents: reaisToCents(data.net_amount ?? 0),
          }
        : undefined,
    };
  }

  async refundPayment(_params: {
    providerPaymentId: string;
    amount: number;
  }): Promise<{ providerRefundId: string; status: RefundStatus; rawResponse?: unknown }> {
    throw new Error(
      "Reembolso de PIX nao suportado pelo provider NexusPag nesta integracao. " +
        "Consulte a categoria 'Saques' da API da NexusPag para devolver o valor manualmente."
    );
  }
}

export const nexuspagProvider = new NexusPagProvider();

// ---------------------------------------------------------------------------
// Saque — POST /api/withdrawals (carteira PRINCIPAL da conta dona da API key)
// Usado apenas apos aprovacao administrativa (services/withdrawals.ts).
// ---------------------------------------------------------------------------

export interface NexusPagWithdrawalResult {
  providerWithdrawalId: string;
  status: "completed" | "processing" | "failed";
  amountCents: number;
  feeCents: number;
  netAmountCents: number;
  newBalanceCents?: number;
  rawResponse?: unknown;
}

interface NexusPagWithdrawResponse {
  success?: boolean;
  withdrawal_id?: string;
  amount?: number;
  fee?: number;
  net_amount?: number;
  status?: string;
  new_balance?: number;
  requires_kyc?: boolean;
  cooldown_seconds?: number;
}

export async function createNexusPagWithdrawal(params: {
  amountCents: number;
  pixKey: string;
  pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random" | "qrc";
}): Promise<NexusPagWithdrawalResult> {
  const amountReais = centsToReais(params.amountCents);
  if (amountReais <= 0) {
    throw new Error("Valor de saque invalido.");
  }

  const response = await fetch(`${NEXUSPAG_BASE_URL}/api/withdrawals`, {
    method: "POST",
    headers: {
      "x-api-key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountReais,
      pix_key: params.pixKey,
      pix_key_type: params.pixKeyType,
    }),
  });

  const data = (await response.json().catch(() => null)) as NexusPagWithdrawResponse | null;

  if (response.status === 429) {
    const wait = data?.cooldown_seconds ?? 300;
    const err = new Error(
      `Cooldown de saque na NexusPag ativo. Aguarde ${wait} segundos antes de tentar novamente.`
    ) as Error & { code?: string; status?: number };
    err.code = "cooldown";
    err.status = 429;
    throw err;
  }

  if (response.status === 403) {
    const err = new Error(
      data?.requires_kyc
        ? "Saques bloqueados na NexusPag: conta sem KYC verificado."
        : "Saques desabilitados na NexusPag para esta conta."
    ) as Error & { code?: string; status?: number };
    err.code = data?.requires_kyc ? "requires_kyc" : "forbidden";
    err.status = 403;
    throw err;
  }

  if (!response.ok || !data?.withdrawal_id) {
    const err = new Error(
      `NexusPag recusou o saque (HTTP ${response.status}): ${JSON.stringify(data)}`
    ) as Error & { code?: string; status?: number };
    err.code = "provider_error";
    err.status = response.status;
    throw err;
  }

  const statusRaw = (data.status || "processing").toLowerCase();
  let status: "completed" | "processing" | "failed" = "processing";
  if (statusRaw === "completed") status = "completed";
  else if (statusRaw === "failed") status = "failed";

  return {
    providerWithdrawalId: data.withdrawal_id,
    status,
    amountCents: reaisToCents(data.amount ?? amountReais),
    feeCents: reaisToCents(data.fee ?? 0),
    netAmountCents: reaisToCents(data.net_amount ?? data.amount ?? amountReais),
    newBalanceCents:
      typeof data.new_balance === "number" ? reaisToCents(data.new_balance) : undefined,
    rawResponse: data,
  };
}
