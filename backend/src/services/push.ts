/**
 * Web Push — envio de notificacoes reais de PIX e testes de demonstracao.
 * Nao cria cobrancas nem altera saldo. Idempotencia via push_notification_log.event_key.
 *
 * web-push e dependencia estatica (nao dynamic import) para o esbuild da Netlify
 * incluir o pacote no bundle da function.
 */
import webpush from "web-push";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";

export type PushKind = "pix_generated" | "sale_paid" | "test_pix" | "test_sale";

const TEMPLATES: Record<
  PushKind,
  { title: string; body: (extra?: string) => string }
> = {
  pix_generated: {
    title: "NOVO PIX GERADO! ⏳📋",
    body: () => "Aguardando o cliente concluir o pagamento.",
  },
  sale_paid: {
    title: "💰 Venda Paga",
    body: (extra) =>
      extra
        ? `DINHEIRO NA TELA! 🤑🔥\n${extra}\nPagamento aprovado! Bora vender mais!`
        : "DINHEIRO NA TELA! 🤑🔥\nPagamento aprovado! Bora vender mais!",
  },
  test_pix: {
    title: "NOVO PIX GERADO! ⏳📋",
    body: () => "Aguardando o cliente concluir o pagamento.",
  },
  test_sale: {
    title: "💰 Venda Paga",
    body: (extra) =>
      extra
        ? `DINHEIRO NA TELA! 🤑🔥\n${extra}\nPagamento aprovado! Bora vender mais!`
        : "DINHEIRO NA TELA! 🤑🔥\nPagamento aprovado! Bora vender mais!",
  },
};

function vapidConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

/** Log once at cold start so Netlify function logs show missing VAPID clearly. */
let vapidWarned = false;
function warnIfVapidMissing(): void {
  if (vapidWarned) return;
  if (!vapidConfigured()) {
    vapidWarned = true;
    console.warn(
      "[push] VAPID nao configurado (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT). " +
        "Notificacoes push ficarao desactivadas ate as variaveis estarem no ambiente da function."
    );
  }
}

export function getVapidPublicKey(): string | null {
  warnIfVapidMissing();
  return process.env.VAPID_PUBLIC_KEY || null;
}

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function claimEventKey(
  eventKey: string,
  kind: PushKind,
  userId?: string,
  orgId?: string
): Promise<boolean> {
  const { error } = await supabaseAdmin.from("push_notification_log").insert({
    event_key: eventKey,
    kind,
    user_id: userId || null,
    organization_id: orgId || null,
  });
  if (error) {
    if (error.code === "23505") return false; // já enviado
    console.error("[push] log insert failed:", error.message);
    // Em falha de log, ainda tentamos enviar (melhor notificar a mais do que nunca)
    return true;
  }
  return true;
}

/**
 * Envia via web-push. Retorna "ok" | "gone" | "error".
 * Remove subscricao 404/410 automaticamente.
 */
async function sendToSubscription(
  sub: SubRow,
  payload: { title: string; body: string; data?: Record<string, unknown> }
): Promise<"ok" | "gone" | "error"> {
  warnIfVapidMissing();
  if (!vapidConfigured()) {
    console.warn("[push] VAPID nao configurado — skip envio");
    return "error";
  }

  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    );

    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
      }),
      { TTL: 60 * 60 }
    );

    await supabaseAdmin
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", sub.id);

    return "ok";
  } catch (err: any) {
    const status = err?.statusCode || err?.status;
    if (status === 404 || status === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
      console.warn("[push] subscription gone, removed:", sub.id);
      return "gone";
    }
    console.error("[push] send failed:", err?.message || err, "status=", status);
    return "error";
  }
}

export async function upsertSubscription(params: {
  userId: string;
  organizationId?: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<void> {
  if (!params.endpoint || !params.p256dh || !params.auth) {
    throw new AppError(400, "validation_error", "Subscricao incompleta (endpoint/keys).");
  }

  const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
    {
      user_id: params.userId,
      organization_id: params.organizationId || null,
      endpoint: params.endpoint,
      p256dh: params.p256dh,
      auth: params.auth,
      user_agent: params.userAgent || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    console.error("[push] upsert subscription:", error.message, error.code, error.details);
    throw new AppError(500, "api_error", "Nao foi possivel guardar a subscricao de notificacoes.");
  }
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
}

export async function listUserSubscriptions(userId: string): Promise<SubRow[]> {
  const { data, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) {
    console.error("[push] listUserSubscriptions:", error.message);
    return [];
  }
  return (data || []) as SubRow[];
}

/**
 * Notifica todos os membros (owner/admin/developer) da organizacao com subscricao valida.
 */
export async function notifyOrganizationMembers(params: {
  organizationId: string;
  kind: PushKind;
  eventKey: string;
  amountLabel?: string;
}): Promise<{ sent: number; skipped: boolean }> {
  const allowed = await claimEventKey(
    params.eventKey,
    params.kind,
    undefined,
    params.organizationId
  );
  if (!allowed) return { sent: 0, skipped: true };

  const { data: members, error: membersErr } = await supabaseAdmin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", params.organizationId)
    .in("role", ["owner", "admin", "developer"]);

  if (membersErr) {
    console.error("[push] organization_members:", membersErr.message);
  }

  const userIds = [...new Set((members || []).map((m: any) => m.user_id).filter(Boolean))];
  if (!userIds.length) {
    console.warn("[push] no members for org", params.organizationId);
    return { sent: 0, skipped: false };
  }

  const { data: subs, error: subsErr } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (subsErr) {
    console.error("[push] list org subs:", subsErr.message);
  }

  if (!(subs || []).length) {
    console.warn("[push] no subscriptions for org members", params.organizationId);
    return { sent: 0, skipped: false };
  }

  const tpl = TEMPLATES[params.kind];
  const payload = {
    title: tpl.title,
    body: tpl.body(params.amountLabel),
    data: { kind: params.kind, url: "/dashboard/payments" },
  };

  let sent = 0;
  for (const sub of (subs || []) as SubRow[]) {
    const r = await sendToSubscription(sub, payload);
    if (r === "ok") sent += 1;
  }
  return { sent, skipped: false };
}

/** Teste de demonstracao — so para o proprio utilizador autenticado. */
export async function sendTestNotification(params: {
  userId: string;
  kind: "test_pix" | "test_sale";
  amountLabel?: string;
}): Promise<{ sent: number }> {
  warnIfVapidMissing();
  if (!vapidConfigured()) {
    throw new AppError(
      503,
      "config_error",
      "Notificacoes push nao estao configuradas neste ambiente (VAPID em falta)."
    );
  }

  const eventKey = `test:${params.userId}:${params.kind}:${Date.now()}`;
  await claimEventKey(eventKey, params.kind, params.userId);

  const subs = await listUserSubscriptions(params.userId);
  if (!subs.length) {
    throw new AppError(
      400,
      "validation_error",
      "Nenhuma subscricao push activa. Ative as notificacoes no navegador primeiro."
    );
  }

  const tpl = TEMPLATES[params.kind];
  const payload = {
    title: tpl.title,
    body: tpl.body(params.amountLabel),
    data: { kind: params.kind, demo: true, url: "/dashboard/payments" },
  };

  let sent = 0;
  for (const sub of subs) {
    const r = await sendToSubscription(sub, payload);
    if (r === "ok") sent += 1;
  }

  if (sent === 0) {
    throw new AppError(
      502,
      "api_error",
      "Nenhuma notificacao foi entregue. A subscricao pode ter expirado — desactive e reactive as notificacoes."
    );
  }

  return { sent };
}
