import { v4 as uuidv4 } from "uuid";
import type { PaymentProvider, PaymentStatus, RefundStatus, PixDetails } from "../types/index.js";

/**
 * "QR Code" do ambiente de teste. Nao e um QR Code valido de proposito: nada
 * aqui pode ser escaneado por um app de banco. E uma imagem SVG que diz, em
 * letras grandes, que o pagamento e simulado — melhor do que um retangulo
 * vazio (que parece bug) e do que um QR de verdade (que nao existe em sandbox).
 */
function sandboxQrCode(amountCents: number, txid: string): string {
  const valor = (amountCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <rect width="320" height="320" fill="#ffffff"/>
  <rect x="16" y="16" width="288" height="288" rx="16" fill="none" stroke="#0A0A0A" stroke-width="2" stroke-dasharray="10 8"/>
  <text x="160" y="140" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="20" font-weight="600" fill="#0A0A0A">PIX simulado</text>
  <text x="160" y="170" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="15" fill="#444">Ambiente de teste</text>
  <text x="160" y="205" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="22" font-weight="600" fill="#FC0019">${valor}</text>
  <text x="160" y="240" text-anchor="middle" font-family="monospace" font-size="11" fill="#777">${txid.slice(0, 24)}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Sandbox Payment Provider
 * Simulates a real acquirer/processor for test environment.
 * Never processes real money. Fully isolated from production.
 */
export class SandboxProvider implements PaymentProvider {
  name = "sandbox";

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
    const providerPaymentId = `sandbox_pay_${uuidv4().replace(/-/g, "").slice(0, 16)}`;

    // PIX no ambiente de teste. O core so pede expiracao para PIX
    // (services/payments.ts), entao esse campo e o sinal de que a cobranca e
    // PIX. Sem isto, o checkout em "test" ficava sem QR Code e sem copia e
    // cola — nao dava para testar o fluxo inteiro sem ir para producao.
    if (params.expirationSeconds) {
      const txid = `sbx${uuidv4().replace(/-/g, "").slice(0, 26)}`;
      const feeAmountCents = Math.round(params.amount * 0.015) + 50;
      const expiresAt = new Date(Date.now() + params.expirationSeconds * 1000).toISOString();

      await new Promise((r) => setTimeout(r, 120));

      return {
        providerPaymentId,
        status: "pending",
        rawResponse: {
          id: providerPaymentId,
          txid,
          amount: params.amount,
          status: "pending",
          simulated: true,
        },
        pix: {
          txid,
          // Formato parecido com um EMV de PIX, mas com "SANDBOX" no meio:
          // se alguem colar isso num app de banco, a leitura falha — e esse
          // e o comportamento desejado.
          copyPaste: `00020126FLUXPAY-SANDBOX0014BR.GOV.BCB.PIX-TESTE${txid}5204000053039865802BR5909FLUXPAY6009SAO PAULO62070503***6304TEST`,
          qrCodeBase64: sandboxQrCode(params.amount, txid),
          expiresAt,
          feeAmountCents,
          netAmountCents: params.amount - feeAmountCents,
        },
      };
    }

    // Simulate different outcomes based on amount for testing
    // Amounts ending in 00 → success
    // Amounts ending in 13 → fail
    // Otherwise → success after "processing"
    let status: PaymentStatus = "succeeded";
    const lastTwo = params.amount % 100;

    if (lastTwo === 13) {
      status = "failed";
    } else if (lastTwo === 50) {
      status = "pending";
    }

    // Artificial delay to feel more realistic
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));

    return {
      providerPaymentId,
      status,
      rawResponse: {
        id: providerPaymentId,
        amount: params.amount,
        currency: params.currency,
        status,
        simulated: true,
        token_used: params.paymentMethodToken ? "tok_***" : null,
      },
    };
  }

  async refundPayment(params: {
    providerPaymentId: string;
    amount: number;
  }): Promise<{
    providerRefundId: string;
    status: RefundStatus;
    rawResponse?: unknown;
  }> {
    const providerRefundId = `sandbox_ref_${uuidv4().replace(/-/g, "").slice(0, 16)}`;

    await new Promise((r) => setTimeout(r, 100));

    return {
      providerRefundId,
      status: "succeeded",
      rawResponse: {
        id: providerRefundId,
        payment_id: params.providerPaymentId,
        amount: params.amount,
        status: "succeeded",
        simulated: true,
      },
    };
  }

  async getPayment(providerPaymentId: string): Promise<{
    status: PaymentStatus;
    rawResponse?: unknown;
  }> {
    return {
      status: "succeeded",
      rawResponse: { id: providerPaymentId, status: "succeeded", simulated: true },
    };
  }
}

export const sandboxProvider = new SandboxProvider();
