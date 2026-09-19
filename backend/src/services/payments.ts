import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabase.js";
import { getProvider } from "../providers/index.js";
import { AppError } from "../middleware/error.js";
import { dispatchWebhook } from "./webhooks.js";
import { inScopeOrNull } from "../utils/scope.js";
import { decideReconcileAction, decideWebhookAction } from "./provider-events.js";
import { env } from "../config/env.js";
import type {
  CreatePaymentInput,
  Payment,
  Environment,
  CreateRefundInput,
} from "../types/index.js";

/**
 * Cria uma cobranca.
 *
 * ORDEM DAS OPERACOES (mudou, e o motivo importa):
 *
 *   1. grava a linha em `payments` — status pending, sem txid;
 *   2. chama o adquirente, usando o id local como `external_id`;
 *   3. grava txid, QR Code e taxas na mesma linha.
 *
 * Antes era 2 -> 1, e isso criava tres problemas reais:
 *
 * a) Corrida com o webhook. O webhook da NexusPag chega por `txid`, que so
 *    existe depois do passo 2. Se a confirmacao chegasse antes do insert (PIX
 *    pago em segundos, insert lento), o evento nao casava com nada e ficava
 *    esperando alguem clicar em "reprocessar" no ADM. Gravando a linha ANTES
 *    da chamada, o pagamento local ja existe no instante em que a NexusPag
 *    passa a conhecer a cobranca — a ordem "webhook antes da persistencia"
 *    deixa de ser possivel. E, como o `external_id` tambem vai gravado antes,
 *    o webhook casa por txid OU por external_id (ver routes/webhooks.ts).
 *
 * b) Corrida de idempotencia. Duas requisicoes simultaneas com a mesma
 *    Idempotency-Key passavam as duas pelo middleware (nenhuma via a outra,
 *    porque nenhuma linha existia ainda) e criavam DUAS cobrancas no
 *    adquirente. Agora a primeira escrita vence e a segunda bate na
 *    UNIQUE(organization_id, environment, idempotency_key) da migration 013:
 *    o 23505 e tratado aqui como "ja existe", e a resposta devolve a mesma
 *    cobranca. O banco vira o arbitro, que e o unico lugar onde duas
 *    requisicoes simultaneas realmente se enxergam.
 *
 * c) Cobranca duplicada no adquirente. O `external_id` e, pela doc da
 *    NexusPag, chave de idempotencia: reenviar o mesmo valor devolve a
 *    transacao existente em vez de criar outra. Usamos o id local (UUID) —
 *    ver comentario em buildProviderExternalId.
 *
 * Se o passo 2 falhar de forma ambigua (timeout, 502), a linha fica pendente
 * sem txid e a reconciliacao automatica resolve depois
 * (reconcileOrphanPixCharges, chamada pela funcao agendada da Netlify).
 */
export async function createPayment(
  organizationId: string,
  environment: Environment,
  input: CreatePaymentInput
): Promise<Payment> {
  if (!input.amount || input.amount <= 0) {
    throw new AppError(400, "validation_error", "Informe um valor valido para a cobranca.");
  }

  const currency = (input.currency || "BRL").toUpperCase();
  const provider = getProvider(environment);
  const paymentType = input.payment_method?.type === "pix" ? "pix" : "card";

  const paymentId = uuidv4();
  const providerExternalId = buildProviderExternalId(paymentId);

  // ---------- 1. Persistencia local primeiro ----------
  const { data: created, error: insertError } = await supabaseAdmin
    .from("payments")
    .insert({
      id: paymentId,
      organization_id: organizationId,
      customer_id: input.customer_id || null,
      environment,
      amount: input.amount,
      currency,
      status: "pending",
      description: input.description || null,
      idempotency_key: input.idempotency_key || null,
      provider: provider.name,
      provider_external_id: providerExternalId,
      fee_amount: 0,
      net_amount: null,
      metadata: input.metadata || {},
      payment_type: paymentType,
    })
    .select()
    .single();

  if (insertError) {
    // 23505 = unique_violation. Com a migration 013 a unique e
    // (organization_id, environment, idempotency_key): quem chegou primeiro
    // ja gravou, e esta requisicao devolve a MESMA cobranca em vez de criar
    // outra. E o fecho da corrida que o middleware de idempotencia sozinho
    // nao consegue fechar.
    if (insertError.code === "23505" && input.idempotency_key) {
      const existing = await getPaymentByIdempotencyKey(
        organizationId,
        environment,
        input.idempotency_key
      );
      if (existing) return existing;
    }
    console.error("Create payment error (insert):", insertError);
    throw new AppError(500, "api_error", "Nao foi possivel registrar a cobranca. Tente novamente.");
  }

  // ---------- 2. Adquirente ----------
  let providerResult;
  try {
    providerResult = await provider.createPayment({
      amount: input.amount,
      currency,
      paymentMethodToken: input.payment_method?.token,
      metadata: input.metadata,
      description: input.description,
      externalId: providerExternalId,
      webhookUrl: `${env.API_BASE_URL}/v1/webhooks/nexuspag`,
      expirationSeconds: paymentType === "pix" ? input.expires_in_seconds || 3600 : undefined,
    });
  } catch (err) {
    // A falha pode ser determinista (400 do adquirente) ou ambigua (timeout).
    // Nao da para distinguir com seguranca a partir de um Error generico, e
    // marcar como "failed" uma cobranca que o adquirente criou faria o
    // pagamento do cliente sumir do painel. Entao a linha fica PENDENTE sem
    // txid e a reconciliacao decide, consultando o adquirente pelo
    // external_id (GET /api/pix/{id} aceita external_id — doc da NexusPag).
    console.error("[payments] provider.createPayment falhou:", {
      provider: provider.name,
      environment,
      organizationId,
      paymentId,
      error: err instanceof Error ? err.message : err,
    });

    if (err instanceof AppError) throw err;

    throw new AppError(
      502,
      "provider_error",
      "Nao foi possivel gerar a cobranca no momento. Tente novamente em instantes."
    );
  }

  // Taxa: para PIX usamos a que a propria NexusPag devolveu; fora isso, o
  // calculo interno de exemplo (1,5% + R$ 0,50).
  const feeAmount = providerResult.pix?.feeAmountCents ?? Math.round(input.amount * 0.015) + 50;
  const netAmount = providerResult.pix?.netAmountCents ?? input.amount - feeAmount;

  // ---------- 3. Completa a linha com o que so o adquirente sabe ----------
  const nowIso = new Date().toISOString();
  const { data: payment, error: updateError } = await supabaseAdmin
    .from("payments")
    .update({
      status: providerResult.status,
      provider_payment_id: providerResult.providerPaymentId,
      provider_response: providerResult.rawResponse,
      fee_amount: feeAmount,
      net_amount: netAmount,
      provider_txid: providerResult.pix?.txid || null,
      pix_copy_paste: providerResult.pix?.copyPaste || null,
      pix_qr_code_base64: providerResult.pix?.qrCodeBase64 || null,
      expires_at: providerResult.pix?.expiresAt || null,
      authorized_at: providerResult.status === "succeeded" ? nowIso : null,
      captured_at: providerResult.status === "succeeded" ? nowIso : null,
      failed_at: providerResult.status === "failed" ? nowIso : null,
      paid_at: providerResult.status === "succeeded" ? nowIso : null,
    })
    .eq("id", paymentId)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .select()
    .single();

  if (updateError || !payment) {
    // A cobranca EXISTE no adquirente. Nao devolvemos erro silencioso: a
    // linha fica pendente sem txid e a reconciliacao vai busca-la pelo
    // external_id na proxima passada do job.
    console.error("Create payment error (update pos-provider):", {
      paymentId,
      providerExternalId,
      error: updateError,
    });
    throw new AppError(
      500,
      "api_error",
      "A cobranca foi criada, mas houve falha ao registra-la. Consulte em instantes antes de tentar de novo."
    );
  }

  // Ledger so para pagamento que ja nasce aprovado (cartao no sandbox).
  // PIX credita na confirmacao, em markPixPaymentSucceeded.
  if (payment.status === "succeeded") {
    await supabaseAdmin.from("balance_transactions").insert({
      organization_id: organizationId,
      environment,
      type: "charge",
      amount: input.amount,
      currency,
      net: netAmount,
      fee: feeAmount,
      payment_id: payment.id,
      description: input.description || "Payment",
      available_on: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // T+2
    });
  }

  const eventType =
    payment.status === "succeeded"
      ? "payment.succeeded"
      : payment.status === "failed"
        ? "payment.failed"
        : payment.status === "pending"
          ? "payment.pending"
          : "payment.created";

  dispatchWebhook(organizationId, environment, eventType, payment).catch(console.error);

  return payment as Payment;
}

/**
 * `external_id` enviado ao adquirente.
 *
 * Usamos o id LOCAL da cobranca (UUID), nunca a referencia do lojista.
 * Motivo: pela doc da NexusPag o `external_id` e chave de idempotencia do
 * dono da API key — e a API key da NexusPag e UMA so, da plataforma, usada
 * por todas as organizacoes do FluxPay. Se mandassemos a referencia do
 * lojista, duas empresas diferentes emitindo "pedido-1" colidiriam: a segunda
 * receberia de volta a cobranca da primeira (a doc diz explicitamente que o
 * mesmo external_id devolve a transacao existente, sem criar outra). O UUID
 * local e unico por cobranca, por empresa e por ambiente.
 *
 * Sobre prefixar "test:"/"live:": NAO e necessario e nao foi feito. O
 * ambiente "test" nunca chega a NexusPag (providers/index.ts manda test para
 * o sandbox e recusa sandbox em live), e o UUID ja e globalmente unico. A doc
 * da NexusPag nao descreve nenhum conceito de ambiente para external_id —
 * inventar um prefixo seria assumir comportamento nao documentado.
 */
export function buildProviderExternalId(paymentId: string): string {
  return paymentId;
}

/** Busca por chave de idempotencia DENTRO da organizacao e do ambiente. */
export async function getPaymentByIdempotencyKey(
  organizationId: string,
  environment: Environment,
  idempotencyKey: string
): Promise<Payment | null> {
  const { data } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  return inScopeOrNull(data as Payment | null, organizationId, environment);
}

/**
 * Busca uma cobranca da organizacao.
 *
 * O parametro `environment` NAO e opcional por acaso: sem ele, uma chave
 * sk_test_ conseguia ler — e, via cancelPayment/createRefund, ESCREVER — em
 * cobrancas do ambiente de producao da mesma empresa. A regra da API e que a
 * chave decide o ambiente; ela precisa valer tambem na leitura por id.
 */
export async function getPayment(
  organizationId: string,
  paymentId: string,
  environment: Environment
): Promise<Payment> {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .maybeSingle();

  // Filtro na query (defesa principal) + conferencia depois da leitura
  // (utils/scope.ts): se um `.eq()` for perdido numa refatoracao, o recurso e
  // recusado em vez de vazar para o outro ambiente.
  const payment = inScopeOrNull(data as Payment | null, organizationId, environment);

  if (error || !payment) {
    throw new AppError(404, "not_found", "Cobranca nao encontrada.");
  }

  return payment;
}

export async function listPayments(
  organizationId: string,
  environment: Environment,
  options: { limit?: number; starting_after?: string; status?: string } = {}
): Promise<{ data: Payment[]; has_more: boolean }> {
  const limit = Math.min(options.limit || 20, 100);

  let query = supabaseAdmin
    .from("payments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (options.status) {
    query = query.eq("status", options.status);
  }

  if (options.starting_after) {
    // O cursor tambem e escopado: sem organization_id/environment aqui, um id
    // de OUTRA empresa ou do outro ambiente servia de cursor e devolvia o
    // instante de criacao daquela cobranca. Cursor fora do escopo e tratado
    // como cursor invalido.
    const { data: cursor } = await supabaseAdmin
      .from("payments")
      .select("created_at")
      .eq("id", options.starting_after)
      .eq("organization_id", organizationId)
      .eq("environment", environment)
      .maybeSingle();

    if (!cursor) {
      throw new AppError(400, "validation_error", "starting_after nao corresponde a uma cobranca deste ambiente.");
    }

    query = query.lt("created_at", cursor.created_at);
  }

  const { data, error } = await query;

  if (error) {
    throw new AppError(500, "api_error", "Nao foi possivel carregar as cobrancas.");
  }

  const hasMore = (data?.length || 0) > limit;
  const results = (data || []).slice(0, limit) as Payment[];

  return { data: results, has_more: hasMore };
}

export async function cancelPayment(
  organizationId: string,
  paymentId: string,
  environment: Environment
): Promise<Payment> {
  const payment = await getPayment(organizationId, paymentId, environment);

  if (!["pending", "processing"].includes(payment.status)) {
    throw new AppError(400, "invalid_request", "So e possivel cancelar uma cobranca que ainda esta pendente.");
  }

  const { data, error } = await supabaseAdmin
    .from("payments")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
    })
    .eq("id", paymentId)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .select()
    .single();

  if (error || !data) {
    throw new AppError(500, "api_error", "Nao foi possivel cancelar a cobranca. Tente novamente.");
  }

  dispatchWebhook(organizationId, payment.environment, "payment.canceled", data).catch(console.error);

  return data as Payment;
}

export async function createRefund(
  organizationId: string,
  paymentId: string,
  environment: Environment,
  input: CreateRefundInput
): Promise<unknown> {
  const payment = await getPayment(organizationId, paymentId, environment);

  if (!["succeeded", "partially_refunded"].includes(payment.status)) {
    throw new AppError(400, "invalid_request", "So e possivel reembolsar uma cobranca ja aprovada.");
  }

  const refundAmount = input.amount ?? payment.amount;

  if (refundAmount <= 0 || refundAmount > payment.amount) {
    throw new AppError(400, "validation_error", "Valor de reembolso invalido.");
  }

  const provider = getProvider(payment.environment);
  const providerResult = await provider.refundPayment({
    providerPaymentId: payment.provider_payment_id!,
    amount: refundAmount,
  });

  const { data: refund, error } = await supabaseAdmin
    .from("refunds")
    .insert({
      organization_id: organizationId,
      payment_id: paymentId,
      environment: payment.environment,
      amount: refundAmount,
      currency: payment.currency,
      status: providerResult.status,
      reason: input.reason || null,
      provider_refund_id: providerResult.providerRefundId,
      provider_response: providerResult.rawResponse,
      metadata: input.metadata || {},
    })
    .select()
    .single();

  if (error) {
    throw new AppError(500, "api_error", "Nao foi possivel registrar o reembolso. Tente novamente.");
  }

  // Update payment status
  const newStatus = refundAmount >= payment.amount ? "refunded" : "partially_refunded";
  await supabaseAdmin
    .from("payments")
    .update({ status: newStatus })
    .eq("id", paymentId);

  // Ledger
  await supabaseAdmin.from("balance_transactions").insert({
    organization_id: organizationId,
    environment: payment.environment,
    type: "refund",
    amount: -refundAmount,
    currency: payment.currency,
    net: -refundAmount,
    fee: 0,
    payment_id: paymentId,
    refund_id: refund.id,
    description: input.reason || "Refund",
  });

  dispatchWebhook(organizationId, payment.environment, "payment.refunded", {
    payment,
    refund,
  }).catch(console.error);

  return refund;
}

// ============================================================
// Confirmacao assincrona de PIX — chamada pelo webhook de entrada
// da NexusPag (routes/webhooks.ts -> POST /v1/webhooks/nexuspag).
// Cartao confirma na hora (createPayment); PIX so confirma quando
// o adquirente avisa que o cliente pagou.
// ============================================================

/**
 * Encontra a cobranca local a que um evento do adquirente se refere.
 *
 * Procura por `provider_txid` E por `provider_external_id`, nessa ordem.
 *
 * O external_id e o que fecha a janela de corrida: ele e gravado ANTES da
 * chamada ao adquirente (ver createPayment), enquanto o txid so existe depois
 * da resposta. Se a confirmacao chegar no intervalo entre a chamada e a
 * gravacao do txid, a busca por txid falha e a por external_id acerta — a
 * confirmacao nao se perde e ninguem precisa reprocessar nada a mao.
 *
 * Nao escopamos por organizacao/ambiente aqui de proposito: quem chama e o
 * webhook do adquirente, que nao tem (nem deveria ter) esse contexto. O
 * escopo vem do proprio registro encontrado.
 */
export async function getPaymentByProviderReference(reference: {
  txid?: string | null;
  externalId?: string | null;
}): Promise<Payment | null> {
  if (reference.txid) {
    const { data } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("provider_txid", reference.txid)
      .maybeSingle();
    if (data) return data as Payment;
  }

  if (reference.externalId) {
    const { data } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("provider_external_id", reference.externalId)
      .maybeSingle();
    if (data) return data as Payment;
  }

  return null;
}

/** Compatibilidade: busca so por txid. Prefira getPaymentByProviderReference. */
export async function getPaymentByProviderTxid(txid: string): Promise<Payment | null> {
  return getPaymentByProviderReference({ txid });
}

export async function markPixPaymentSucceeded(payment: Payment): Promise<void> {
  // A confirmação + crédito no ledger precisam acontecer na mesma transação.
  // Webhooks/retries podem chegar simultaneamente; fazer UPDATE e INSERT
  // separados no Node permite que duas execuções creditem o mesmo pagamento.
  const { data: updated, error } = await supabaseAdmin.rpc(
    "fluxpay_confirm_pix_payment",
    {
      p_payment_id: payment.id,
      p_organization_id: payment.organization_id,
      p_environment: payment.environment,
    }
  );

  if (error || !updated) {
    console.error("Falha ao confirmar PIX:", error);
    throw new Error("Falha ao confirmar pagamento PIX");
  }

  const confirmedPayment = Array.isArray(updated) ? updated[0] : updated;

  dispatchWebhook(
    payment.organization_id,
    payment.environment,
    "payment.succeeded",
    confirmedPayment
  ).catch(console.error);
}

/**
 * Confirma uma cobranca PIX SIMULADA a partir do painel (ambiente de teste).
 *
 * Mesmas travas da versao do checkout: environment "test" E provider
 * "sandbox". Qualquer outra combinacao responde 404 — inclusive uma cobranca
 * real em producao, que so o webhook da NexusPag confirma.
 */
export async function simulateSandboxPayment(
  organizationId: string,
  paymentId: string
): Promise<Payment> {
  // Sempre "test": esta funcao so existe para o provider sandbox, e checar o
  // ambiente ja na consulta impede que um id de producao sequer seja lido aqui.
  const payment = await getPayment(organizationId, paymentId, "test");

  if (payment.environment !== "test" || payment.provider !== "sandbox") {
    throw new AppError(404, "not_found", "Recurso nao encontrado.");
  }

  if (payment.status === "succeeded") return payment;

  if (payment.status !== "pending") {
    throw new AppError(409, "invalid_request", "Esta cobranca nao esta mais pendente.");
  }

  await markPixPaymentSucceeded(payment);

  return getPayment(organizationId, paymentId, "test");
}

export async function markPixPaymentFailedOrExpired(
  payment: Payment,
  reason: "failed" | "expired"
): Promise<void> {
  if (["succeeded", "failed", "expired"].includes(payment.status)) return; // idempotente

  const { data: updated, error } = await supabaseAdmin
    .from("payments")
    .update({
      status: reason,
      failed_at: reason === "failed" ? new Date().toISOString() : null,
      expired_at: reason === "expired" ? new Date().toISOString() : null,
    })
    .eq("id", payment.id)
    .select()
    .single();

  if (error || !updated) return;

  dispatchWebhook(
    payment.organization_id,
    payment.environment,
    reason === "failed" ? "payment.failed" : "payment.canceled",
    updated
  ).catch(console.error);
}

// ============================================================
// RECONCILIACAO AUTOMATICA
//
// Chamada pela funcao agendada da Netlify (netlify/functions/scheduled-jobs.ts),
// a cada 10 minutos. Nada aqui depende de alguem abrir o ADM e clicar em
// "reprocessar" — o ADM continua existindo para inspecao e para o caso raro,
// mas nao e mais o caminho normal de recuperacao.
// ============================================================

/** Janela antes de concluir qualquer coisa sobre uma cobranca sem txid. */
const ORPHAN_GRACE_SECONDS = 5 * 60;

/**
 * Cobranca "orfa": linha local em `pending`, tipo pix, SEM `provider_txid`.
 *
 * Acontece quando a chamada ao adquirente falhou de forma ambigua (timeout,
 * 502) ou quando o processo caiu entre a chamada e a gravacao do txid. Como a
 * cobranca pode existir do lado da NexusPag, nao da para simplesmente marcar
 * como falha: o desempate e consultar GET /api/pix/{id} usando o
 * `external_id` — endpoint documentado, cujo {id} aceita UUID interno, txid
 * OU external_id (docs/nexuspag-api.md, "Consultar PIX").
 */
export async function reconcileOrphanPixCharges(): Promise<{
  checked: number;
  confirmed: number;
  attached: number;
  failed: number;
}> {
  const cutoff = new Date(Date.now() - ORPHAN_GRACE_SECONDS * 1000).toISOString();

  const { data: orphans, error } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("status", "pending")
    .eq("payment_type", "pix")
    .is("provider_txid", null)
    .lt("created_at", cutoff)
    .limit(50);

  const result = { checked: 0, confirmed: 0, attached: 0, failed: 0 };

  if (error) {
    console.error("[reconcile] falha ao listar cobrancas orfas:", error);
    return result;
  }

  for (const row of (orphans || []) as Payment[]) {
    result.checked += 1;

    const reference = row.provider_external_id || row.id;
    let providerStatus: Parameters<typeof decideReconcileAction>[0]["providerStatus"];
    let providerPix: { txid: string; copyPaste: string; qrCodeBase64: string; expiresAt: string; feeAmountCents: number; netAmountCents: number } | undefined;
    let providerPaymentId: string | undefined;

    try {
      if (row.environment === "test") {
        // Sandbox nao tem onde consultar: nao existe cobranca de verdade em
        // adquirente nenhum. Se a criacao falhou, a cobranca simplesmente nao
        // existe — encerra em vez de ficar consultando um provider simulado a
        // cada 10 minutos para sempre.
        providerStatus = "not_found";
      } else {
        const provider = getProvider(row.environment);
        const consulted = await provider.getPayment(reference);
        providerPix = consulted.pix;
        providerPaymentId = consulted.providerPaymentId;
        providerStatus =
          consulted.status === "succeeded"
            ? "paid"
            : consulted.status === "expired"
              ? "expired"
              : consulted.status === "failed" || consulted.status === "canceled"
                ? "failed"
                : "pending";
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A mensagem de 404 do adapter e explicita ("nao encontrada na NexusPag").
      // Qualquer outra falha e tratada como indisponibilidade: nao concluimos
      // nada sobre a cobranca de ninguem por causa de uma queda de rede.
      providerStatus = /nao encontrada|not found|404/i.test(message) ? "not_found" : "unreachable";
    }

    const ageSeconds = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 1000);
    const decision = decideReconcileAction({
      ageSeconds,
      graceSeconds: ORPHAN_GRACE_SECONDS,
      providerStatus,
    });

    if (decision.action === "wait") continue;

    if (decision.action === "fail") {
      await markPixPaymentFailedOrExpired(row, providerStatus === "expired" ? "expired" : "failed");
      result.failed += 1;
      console.warn("[reconcile] cobranca encerrada:", { paymentId: row.id, reason: decision.reason });
      continue;
    }

    // "attach" e "confirm" compartilham a gravacao dos dados do adquirente:
    // sem isso o proximo webhook continuaria sem txid para casar.
    if (providerPix || providerPaymentId) {
      const { data: attached } = await supabaseAdmin
        .from("payments")
        .update({
          provider_payment_id: providerPaymentId ?? row.provider_payment_id ?? null,
          provider_txid: providerPix?.txid ?? null,
          pix_copy_paste: providerPix?.copyPaste ?? row.pix_copy_paste ?? null,
          pix_qr_code_base64: providerPix?.qrCodeBase64 ?? row.pix_qr_code_base64 ?? null,
          expires_at: providerPix?.expiresAt ?? row.expires_at ?? null,
          fee_amount: providerPix?.feeAmountCents ?? row.fee_amount,
          net_amount: providerPix?.netAmountCents ?? row.net_amount ?? null,
        })
        .eq("id", row.id)
        .select()
        .single();

      if (attached) Object.assign(row, attached as Payment);
      result.attached += 1;
    }

    if (decision.action === "confirm") {
      await markPixPaymentSucceeded(row);
      result.confirmed += 1;
    }
  }

  return result;
}

/**
 * Reprocessa eventos do adquirente que ficaram sem par.
 *
 * Sao as linhas de `provider_events` com `processed_at` nulo: chegaram,
 * tiveram a assinatura validada e foram gravadas (a dedupe por
 * UNIQUE(provider, provider_event_id) continua intacta), mas nao encontraram
 * cobranca local naquele instante. Em vez de ficarem esperando uma acao
 * manual no ADM, sao tentadas de novo aqui a cada passada do job.
 */
export async function reprocessUnmatchedProviderEvents(): Promise<{
  checked: number;
  confirmed: number;
}> {
  const { data: events, error } = await supabaseAdmin
    .from("provider_events")
    .select("id, event_type, payload, signature_valid, processed_at")
    .is("processed_at", null)
    .eq("signature_valid", true)
    .order("received_at", { ascending: true })
    .limit(100);

  const result = { checked: 0, confirmed: 0 };

  if (error) {
    console.error("[reconcile] falha ao listar provider_events pendentes:", error);
    return result;
  }

  for (const event of (events || []) as {
    id: string;
    event_type: string | null;
    payload: { event?: string; status?: string; txid?: string; external_id?: string } | null;
  }[]) {
    result.checked += 1;

    const payload = event.payload || {};
    const eventType = payload.event || event.event_type || "unknown";

    const payment = await getPaymentByProviderReference({
      txid: payload.txid,
      externalId: payload.external_id,
    });

    const decision = decideWebhookAction({
      eventType,
      status: payload.status,
      payment: payment ? { id: payment.id, status: payment.status } : null,
      alreadyProcessed: false,
    });

    if (decision.action === "retry_later") continue;

    if (decision.action === "confirm") {
      await markPixPaymentSucceeded(payment as Payment);
      result.confirmed += 1;
    }

    await supabaseAdmin
      .from("provider_events")
      .update({
        processed_at: new Date().toISOString(),
        processing_error: decision.action === "confirm" ? null : `reconciliado: ${decision.action}`,
        payment_id: payment?.id ?? null,
        organization_id: payment?.organization_id ?? null,
        environment: payment?.environment ?? null,
      })
      .eq("id", event.id);
  }

  return result;
}
