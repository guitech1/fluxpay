import type { PaymentProvider, PaymentStatus, RefundStatus, PixDetails } from "../types/index.js";

/**
 * Provider NexusPag — adquirente real de PIX.
 *
 * Baseado na documentacao oficial (nexuspag-api.md):
 *   POST /api/pix/create   — cria a cobranca PIX (resposta aninhada em "transaction")
 *   GET  /api/pix/{id}     — consulta status (resposta PLANA, sem "transaction")
 *   POST <webhook_url>     — notificacao "payment.confirmed" (payload PLANO) quando o PIX e pago
 *
 * Diferencas importantes em relacao ao provider sandbox:
 * - A NexusPag trabalha em REAIS (ex.: 50.00), enquanto o core do FluxPay
 *   trabalha em CENTAVOS (ex.: 5000). A conversao acontece nas bordas deste
 *   arquivo, nunca fora dele.
 * - PIX nao tem confirmacao sincrona: a resposta do create() sempre volta
 *   "pending" com o QR Code; o pagamento so muda de status quando o webhook
 *   da NexusPag chega (ver routes/webhooks.ts, POST /v1/webhooks/nexuspag).
 * - A NexusPag so envia UM tipo de evento de webhook para PIX: "payment.confirmed".
 *   Nao existe webhook de expiracao/cancelamento — por isso o FluxPay expira
 *   cobrancas vencidas por conta propria (ver fluxpay_expire_stale_records,
 *   chamada pela funcao agendada da Netlify).
 * - Reembolso de PIX nao e coberto pela documentacao (a NexusPag trabalha
 *   com saques da carteira, nao com estorno de PIX individual).
 *   refundPayment() lanca erro explicito em vez de fingir que funciona.
 *
 * Nunca commitar a API key real: ela vem de NEXUSPAG_API_KEY (.env), e o
 * .env nunca vai para o repositorio (.gitignore).
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

/** Converte centavos (inteiro, moeda interna) para reais (decimal, formato NexusPag). */
function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

/** Converte reais (decimal, resposta da NexusPag) para centavos (inteiro, moeda interna). */
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
    status: string; // sempre "pending" na criacao
    pix_copia_cola: string;
    qr_code_base64: string;
    expires_at: string;
  };
}

/** GET /api/pix/{id} devolve o objeto PLANO — nao aninhado em "transaction". */
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
}

/** Mapeia o status da NexusPag (pending | paid | expired | cancelled) para o payment_status interno. */
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
    amount: number; // centavos
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
      // A NexusPag rejeita com 400 abaixo de R$1,00 — falhar cedo evita round-trip.
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

    // 409 = conflito de external_id que nao pode ser resolvido automaticamente.
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

  /** Consulta o status atual de uma cobranca PIX na NexusPag (resposta plana, sem "transaction"). */
  async getPayment(providerPaymentId: string): Promise<{
    status: PaymentStatus;
    rawResponse?: unknown;
  }> {
    const response = await fetch(`${NEXUSPAG_BASE_URL}/api/pix/${providerPaymentId}`, {
      headers: { "x-api-key": getApiKey() },
    });

    if (response.status === 404) {
      throw new Error(`Transacao ${providerPaymentId} nao encontrada na NexusPag.`);
    }

    const data = (await response.json().catch(() => null)) as NexusPagPixConsultResponse | null;

    if (!response.ok || !data) {
      throw new Error(`Falha ao consultar PIX na NexusPag (HTTP ${response.status}).`);
    }

    return { status: mapNexusPagStatus(data.status), rawResponse: data };
  }

  async refundPayment(_params: {
    providerPaymentId: string;
    amount: number;
  }): Promise<{ providerRefundId: string; status: RefundStatus; rawResponse?: unknown }> {
    // A documentacao nao cobre estorno de PIX individual — a NexusPag so
    // expoe saque da carteira/subconta (categoria "Saques"). Falhar
    // explicitamente evita que o FluxPay marque um reembolso como
    // bem-sucedido sem o dinheiro ter voltado de fato.
    throw new Error(
      "Reembolso de PIX nao suportado pelo provider NexusPag nesta integracao. " +
        "Consulte a categoria 'Saques' da API da NexusPag para devolver o valor manualmente."
    );
  }
}

export const nexuspagProvider = new NexusPagProvider();
