/**
 * Nucleo de decisao do webhook de ENTRADA da NexusPag e da reconciliacao de
 * cobrancas orfas — funcoes puras, SEM dependencia externa.
 *
 * Por que separado da rota: a rota faz I/O (assinatura, insert de auditoria,
 * update do pagamento). A decisao — "isto e duplicado? confirma? espera?" — e
 * a parte que precisa estar certa em todas as ordens de chegada possiveis, e
 * so da para testar isso de verdade se ela nao depender de banco nem de rede.
 *
 * Contexto da integracao (docs/nexuspag-api.md):
 * - So existe UM evento de PIX: `payment.confirmed` com `status: "paid"`.
 *   Nao ha webhook de expiracao ou cancelamento.
 * - O payload e PLANO e traz `txid` E `external_id`.
 * - Retry do adquirente: ate 8 tentativas ao longo de ~7 dias; 4xx encerra,
 *   5xx/timeout continuam. Por isso "ainda nao sei casar este evento" NAO
 *   pode virar 4xx nem ser marcado como processado.
 */

export type WebhookAction =
  /** Evento ja conhecido e ja aplicado: responder 200 e nao mexer no ledger. */
  | { action: "duplicate" }
  /** payment.confirmed + paid + pagamento encontrado: creditar. */
  | { action: "confirm" }
  /**
   * Evento valido, mas nenhum pagamento local casa com ele (ainda).
   * Fica gravado com processed_at NULO para a reconciliacao automatica tentar
   * de novo — nunca depende de alguem clicar em "reprocessar" no ADM.
   */
  | { action: "retry_later"; reason: string }
  /** Evento que nao move dinheiro (tipo/status fora do unico caso previsto). */
  | { action: "ignore"; reason: string };

export interface WebhookDecisionInput {
  /** `event` do corpo ou header X-Webhook-Event. */
  eventType: string;
  /** `status` do corpo. */
  status?: string | null;
  /** Pagamento local casado por txid ou external_id — null quando nao achou. */
  payment: { id: string; status: string } | null;
  /** O evento ja havia sido processado com sucesso antes? */
  alreadyProcessed: boolean;
}

/**
 * Decide o que fazer com um evento de entrada JA autenticado (assinatura
 * valida) e JA registrado em `provider_events`.
 *
 * A ordem das checagens importa:
 *  1. duplicado vence tudo — reprocessar creditaria o ledger duas vezes;
 *  2. evento fora do unico caso previsto e ignorado, exista pagamento ou nao;
 *  3. sem pagamento local, o evento fica pendente para a reconciliacao;
 *  4. pagamento ja "succeeded" e tratado como duplicado (o credito ja existe).
 */
export function decideWebhookAction(input: WebhookDecisionInput): WebhookAction {
  if (input.alreadyProcessed) {
    return { action: "duplicate" };
  }

  const isConfirmation = input.eventType === "payment.confirmed" && input.status === "paid";

  if (!isConfirmation) {
    return {
      action: "ignore",
      reason: `evento sem efeito (event=${input.eventType}, status=${input.status ?? "null"})`,
    };
  }

  if (!input.payment) {
    return {
      action: "retry_later",
      reason: "pagamento local ainda nao encontrado para este txid/external_id",
    };
  }

  if (input.payment.status === "succeeded") {
    return { action: "duplicate" };
  }

  return { action: "confirm" };
}

// ============================================================
// Reconciliacao de cobranca PIX "orfa"
// ============================================================

/**
 * Cobranca orfa = linha local em `pending`, do tipo pix, sem `provider_txid`.
 *
 * Ela existe porque o pagamento e gravado ANTES da chamada ao adquirente (e
 * o que torna impossivel o webhook chegar antes da persistencia local). Se a
 * chamada falhar de forma ambigua — timeout, 502, queda do processo — a linha
 * fica assim. A NexusPag pode ter criado a cobranca mesmo assim.
 *
 * O desempate e feito consultando GET /api/pix/{id} com o `external_id`
 * (endpoint documentado: o {id} aceita UUID interno, txid OU external_id).
 */
export type ReconcileAction =
  /** Cobranca existe no adquirente e ja foi paga: creditar. */
  | { action: "confirm" }
  /** Cobranca existe e continua pendente: gravar txid/QR e seguir esperando. */
  | { action: "attach" }
  /** Cobranca nao existe no adquirente (404) ou venceu la: encerrar local. */
  | { action: "fail"; reason: string }
  /** Cedo demais para concluir qualquer coisa. */
  | { action: "wait" };

export interface ReconcileInput {
  /** Idade da linha local em segundos. */
  ageSeconds: number;
  /** Janela minima antes de concluir qualquer coisa. */
  graceSeconds: number;
  /**
   * Resultado da consulta ao adquirente:
   *  - "not_found": 404 — o adquirente nunca criou a cobranca;
   *  - "unreachable": erro de rede/5xx — nao da para concluir nada;
   *  - status da transacao quando encontrada.
   */
  providerStatus: "not_found" | "unreachable" | "pending" | "paid" | "expired" | "failed";
}

export function decideReconcileAction(input: ReconcileInput): ReconcileAction {
  if (input.ageSeconds < input.graceSeconds) {
    return { action: "wait" };
  }

  switch (input.providerStatus) {
    case "paid":
      return { action: "confirm" };
    case "pending":
      return { action: "attach" };
    case "expired":
    case "failed":
      return { action: "fail", reason: `cobranca ${input.providerStatus} no adquirente` };
    case "not_found":
      return { action: "fail", reason: "cobranca inexistente no adquirente" };
    case "unreachable":
      // Adquirente fora do ar nao e motivo para encerrar cobranca de ninguem:
      // a proxima passada do job tenta de novo.
      return { action: "wait" };
  }
}
