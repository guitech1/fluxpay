/** Mensagens claras para o cliente/lojista quando a adquirente falha ou está confirmando. */

export function paymentClientMessage(payment: {
  status?: string;
  provider?: string | null;
  provider_response?: unknown;
  pix_copy_paste?: string | null;
  client_message?: string | null;
}): string | null {
  if (payment.client_message) return payment.client_message;
  const pr = (payment.provider_response || {}) as Record<string, unknown>;
  if (payment.status === "succeeded") return null;
  if (pr.ambiguous === true || pr.queue_state === "confirming") {
    return "Estamos confirmando com o banco. Não pague de novo — avise se já pagou.";
  }
  if (pr.queue_state === "queued" || payment.provider === "queued") {
    if (!payment.pix_copy_paste) {
      return "Estamos gerando seu PIX. Aguarde nesta tela — não tente pagar de outro lugar.";
    }
    return "Estamos confirmando o pagamento. Não pague de novo.";
  }
  if (pr.queue_state === "exhausted" || payment.status === "failed") {
    return "Não foi possível falar com o banco agora. Gere um novo PIX em instantes.";
  }
  return null;
}
