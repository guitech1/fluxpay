/**
 * Web Push — envio de notificacoes reais de PIX e testes de demonstracao.
 * Nao cria cobrancas nem altera saldo. Idempotencia via push_notification_log.event_key.
 */
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import webpush from "web-push";
import { vapidConfigured, getVapidPublicKey } from "./vapid-config.js";

export { vapidConfigured, getVapidPublicKey };

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
    if (error.code === "23505") return false;
    console.error("[push] log insert failed:", error.message);
    return true;
  }
  return true;
}

async function sendToSubscription(
  sub: SubRow,
  payload: { title: string; body: string; data?: Record<string, unknown> }
): Promise<"ok" | "gone" | "error"> {
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
      return "gone";
    }
    console.error("[push] send failed:", err?.message || err);
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
    console.error("[push] upsert subscription:", error.message);
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
  const { data } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  return (data || []) as SubRow[];
}

/**
 * Notifica membros da organizacao com subscricao push valida.
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

  const { data: members } = await supabaseAdmin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", params.organizationId)
    .in("role", ["owner", "admin", "developer", "viewer", "member"]);

  const userIds = [...new Set((members || []).map((m: any) => m.user_id).filter(Boolean))];

  let subs: SubRow[] = [];
  if (userIds.length) {
    const { data } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", userIds);
    subs = (data || []) as SubRow[];
  }
  const { data: orgSubs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .eq("organization_id", params.organizationId);
  const seen = new Set(subs.map((s) => s.id));
  for (const s of (orgSubs || []) as SubRow[]) {
    if (!seen.has(s.id)) subs.push(s);
  }
  if (!subs.length) {
    console.warn(
      "[push] nenhuma subscricao para org",
      params.organizationId,
      "users",
      userIds.length
    );
    return { sent: 0, skipped: false };
  }

  const tpl = TEMPLATES[params.kind];
  const payload = {
    title: tpl.title,
    body: tpl.body(params.amountLabel),
    data: { kind: params.kind, url: "/dashboard/payments" },
  };

  let sent = 0;
  for (const sub of subs) {
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
  if (!vapidConfigured()) {
    throw new AppError(
      503,
      "config_error",
      "Web Push nao configurado neste ambiente (faltam VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY ou VAPID_SUBJECT). Defina no Netlify e faca deploy."
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
    data: { kind: params.kind, demo: true },
  };

  let sent = 0;
  for (const sub of subs) {
    const r = await sendToSubscription(sub, payload);
    if (r === "ok") sent += 1;
  }
  if (sent === 0) {
    throw new AppError(
      502,
      "push_delivery_failed",
      "Nenhuma notificacao foi entregue. As subscricoes podem estar expiradas — desative e reative as notificacoes no navegador."
    );
  }
  return { sent };
}
