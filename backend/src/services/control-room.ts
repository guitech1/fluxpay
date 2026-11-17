import { supabaseAdmin } from "../config/supabase.js";
import { getAdapter, listAcquirerConfigs, resolveActiveIds } from "../providers/index.js";
import type { Environment } from "../types/index.js";

export async function getControlRoomSnapshot(environment: Environment) {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();

  const [
    pixIn,
    withdrawals,
    webhookFails,
    queueRows,
    apiLatency,
    activeIds,
  ] = await Promise.all([
    supabaseAdmin
      .from("payments")
      .select(
        "id, amount, status, created_at, paid_at, organization_id, provider, payer_name, environment"
      )
      .eq("environment", environment)
      .eq("payment_type", "pix")
      .order("created_at", { ascending: false })
      .limit(25),
    supabaseAdmin
      .from("withdrawal_requests")
      .select(
        "id, amount, net, status, created_at, organization_id, environment, failure_reason, provider_reference"
      )
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(25),
    supabaseAdmin
      .from("webhook_deliveries")
      .select(
        "id, status, attempt_count, response_status, created_at, next_retry_at, webhook_events(type, organization_id)"
      )
      .in("status", ["failed", "retrying", "pending"])
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("payments")
      .select("id, amount, created_at, organization_id, provider, provider_response, status")
      .eq("environment", environment)
      .eq("status", "pending")
      .eq("provider", "queued")
      .order("created_at", { ascending: true })
      .limit(40),
    supabaseAdmin
      .from("api_logs")
      .select("duration_ms, status_code, path, created_at")
      .eq("environment", environment)
      .gte("created_at", fiveMinAgo)
      .order("created_at", { ascending: false })
      .limit(80),
    resolveActiveIds().catch(() => [] as string[]),
  ]);

  // Contagens 1h
  const [{ count: pixHour }, { count: paidHour }, { count: wdHour }, { count: wdFailedHour }] =
    await Promise.all([
      supabaseAdmin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("environment", environment)
        .eq("payment_type", "pix")
        .gte("created_at", hourAgo),
      supabaseAdmin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("environment", environment)
        .eq("status", "succeeded")
        .gte("paid_at", hourAgo),
      supabaseAdmin
        .from("withdrawal_requests")
        .select("id", { count: "exact", head: true })
        .eq("environment", environment)
        .gte("created_at", hourAgo),
      supabaseAdmin
        .from("withdrawal_requests")
        .select("id", { count: "exact", head: true })
        .eq("environment", environment)
        .eq("status", "failed")
        .gte("created_at", hourAgo),
    ]);

  const durations = (apiLatency.data || [])
    .map((r) => Number(r.duration_ms))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const avgLatencyMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;
  const p95LatencyMs =
    durations.length > 0
      ? (() => {
          const s = [...durations].sort((a, b) => a - b);
          return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
        })()
      : null;

  const queue = (queueRows.data || []).map((r) => {
    const pr = (r.provider_response || {}) as Record<string, unknown>;
    return {
      id: r.id as string,
      amount: Number(r.amount) || 0,
      organization_id: r.organization_id as string,
      created_at: r.created_at as string,
      retry_count: typeof pr.retry_count === "number" ? pr.retry_count : 0,
      next_retry_at: typeof pr.next_retry_at === "string" ? pr.next_retry_at : null,
      queue_state: (pr.queue_state as string) || "queued",
      last_error: typeof pr.error === "string" ? pr.error : null,
    };
  });

  // Health check paralelo (timeout curto por adquirente)
  const configs = listAcquirerConfigs().filter((c) => c.id !== "sandbox");
  const acquirerHealth = await Promise.all(
    configs.map(async (c) => {
      const adapter = getAdapter(c.id);
      const inActive = (activeIds as string[]).includes(c.id);
      if (!adapter?.healthCheck) {
        return {
          id: c.id,
          displayName: c.displayName,
          configured: c.configured,
          active: inActive,
          status: c.configured ? "unknown" : "unconfigured",
          latencyMs: null as number | null,
        };
      }
      try {
        const t0 = Date.now();
        const h = await Promise.race([
          adapter.healthCheck(),
          new Promise<{ status: string }>((resolve) =>
            setTimeout(() => resolve({ status: "timeout" }), 4500)
          ),
        ]);
        return {
          id: c.id,
          displayName: c.displayName,
          configured: c.configured,
          active: inActive,
          status: h.status || "unknown",
          latencyMs: Date.now() - t0,
        };
      } catch {
        return {
          id: c.id,
          displayName: c.displayName,
          configured: c.configured,
          active: inActive,
          status: "down",
          latencyMs: null as number | null,
        };
      }
    })
  );

  const degraded = acquirerHealth.filter(
    (a) => a.active && ["down", "degraded", "timeout"].includes(String(a.status))
  );

  return {
    generated_at: new Date().toISOString(),
    environment,
    metrics: {
      pix_created_1h: pixHour ?? 0,
      pix_paid_1h: paidHour ?? 0,
      withdrawals_1h: wdHour ?? 0,
      withdrawals_failed_1h: wdFailedHour ?? 0,
      queue_depth: queue.length,
      webhook_issues: (webhookFails.data || []).length,
      avg_latency_ms: avgLatencyMs,
      p95_latency_ms: p95LatencyMs,
      degraded_acquirers: degraded.length,
    },
    acquirers: acquirerHealth,
    queue,
    pix_in: (pixIn.data || []).map((p) => ({
      id: p.id,
      amount: Number(p.amount) || 0,
      status: p.status,
      created_at: p.created_at,
      paid_at: p.paid_at,
      organization_id: p.organization_id,
      provider: p.provider,
      payer_name: p.payer_name,
    })),
    withdrawals_out: (withdrawals.data || []).map((w) => ({
      id: w.id,
      amount: Number(w.amount) || 0,
      net: Number(w.net) || 0,
      status: w.status,
      created_at: w.created_at,
      organization_id: w.organization_id,
      failure_reason: w.failure_reason,
    })),
    webhook_issues: (webhookFails.data || []).map((d) => ({
      id: d.id,
      status: d.status,
      attempt_count: d.attempt_count,
      response_status: d.response_status,
      created_at: d.created_at,
      next_retry_at: d.next_retry_at,
      event_type: (d.webhook_events as { type?: string } | null)?.type ?? null,
      organization_id:
        (d.webhook_events as { organization_id?: string } | null)?.organization_id ?? null,
    })),
  };
}
