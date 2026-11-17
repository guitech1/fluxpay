"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Radio,
  RefreshCw,
  Server,
  Webhook,
} from "lucide-react";
import { adminFetch } from "@/lib/admin-api";
import { formatCurrency, formatDate } from "@/lib/utils";

type Snapshot = {
  generated_at: string;
  environment: string;
  metrics: {
    pix_created_1h: number;
    pix_paid_1h: number;
    withdrawals_1h: number;
    withdrawals_failed_1h: number;
    queue_depth: number;
    webhook_issues: number;
    avg_latency_ms: number | null;
    p95_latency_ms: number | null;
    degraded_acquirers: number;
  };
  acquirers: Array<{
    id: string;
    displayName: string;
    configured: boolean;
    active: boolean;
    status: string;
    latencyMs: number | null;
  }>;
  queue: Array<{
    id: string;
    amount: number;
    organization_id: string;
    created_at: string;
    retry_count: number;
    next_retry_at: string | null;
    queue_state: string;
    last_error: string | null;
  }>;
  pix_in: Array<{
    id: string;
    amount: number;
    status: string;
    created_at: string;
    paid_at: string | null;
    organization_id: string;
    provider: string | null;
    payer_name: string | null;
  }>;
  withdrawals_out: Array<{
    id: string;
    amount: number;
    net: number;
    status: string;
    created_at: string;
    organization_id: string;
    failure_reason: string | null;
  }>;
  webhook_issues: Array<{
    id: string;
    status: string;
    attempt_count: number | null;
    response_status: number | null;
    created_at: string;
    next_retry_at: string | null;
    event_type: string | null;
    organization_id: string | null;
  }>;
};

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (["succeeded", "completed", "success", "healthy"].includes(s)) return "text-emerald-300";
  if (["failed", "down", "timeout", "exhausted"].includes(s)) return "text-red-300";
  if (["pending", "processing", "retrying", "queued", "degraded", "unknown"].includes(s))
    return "text-amber-300";
  return "text-flux-muted";
}

function acquirerBadge(status: string): string {
  const s = status.toLowerCase();
  if (s === "healthy") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (s === "degraded" || s === "timeout") return "bg-amber-500/15 text-amber-200 border-amber-500/30";
  if (s === "down") return "bg-red-500/15 text-red-300 border-red-500/30";
  if (s === "unconfigured") return "bg-flux-gray text-flux-muted border-flux-border";
  return "bg-flux-gray text-flux-muted border-flux-border";
}

export function ControlRoomPanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await adminFetch<{ data: Snapshot }>("/control-room");
      setData(res.data);
      setError(null);
      setTick((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar sala de controle");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const id = setInterval(() => load(true), 5000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="card flex items-center gap-2 text-flux-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Abrindo sala de controle…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card border border-red-500/30 text-red-200 text-sm">{error}</div>
    );
  }

  if (!data) return null;

  const m = data.metrics;
  const systemAlert =
    m.degraded_acquirers > 0 || m.queue_depth > 0 || m.webhook_issues > 5 || m.withdrawals_failed_1h > 0;

  return (
    <div className="space-y-5">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-flux-muted">
          <Radio className={`w-4 h-4 ${systemAlert ? "text-red-400 animate-pulse" : "text-emerald-400"}`} />
          <span>
            Ao vivo · atualiza a cada 5s · tick {tick} ·{" "}
            {formatDate(data.generated_at)}
          </span>
        </div>
        <button
          type="button"
          className="btn-secondary text-xs flex items-center gap-1.5"
          onClick={() => load(true)}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar
        </button>
      </div>

      {systemAlert && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Sistema sob atenção</p>
            <p className="text-red-100/80 text-xs mt-0.5">
              {m.degraded_acquirers > 0 && `${m.degraded_acquirers} adquirente(s) degradada(s). `}
              {m.queue_depth > 0 && `Fila local: ${m.queue_depth}. `}
              {m.webhook_issues > 0 && `Webhooks com problema: ${m.webhook_issues}. `}
              {m.withdrawals_failed_1h > 0 && `Saques falhos (1h): ${m.withdrawals_failed_1h}.`}
            </p>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Kpi label="PIX criados 1h" value={String(m.pix_created_1h)} icon={ArrowDownLeft} />
        <Kpi label="PIX pagos 1h" value={String(m.pix_paid_1h)} icon={Activity} tone="ok" />
        <Kpi label="Saques 1h" value={String(m.withdrawals_1h)} icon={ArrowUpRight} />
        <Kpi
          label="Saques falhos 1h"
          value={String(m.withdrawals_failed_1h)}
          icon={AlertTriangle}
          tone={m.withdrawals_failed_1h > 0 ? "bad" : "default"}
        />
        <Kpi
          label="Fila PIX"
          value={String(m.queue_depth)}
          icon={Server}
          tone={m.queue_depth > 0 ? "warn" : "default"}
        />
        <Kpi
          label="Webhooks issue"
          value={String(m.webhook_issues)}
          icon={Webhook}
          tone={m.webhook_issues > 0 ? "warn" : "default"}
        />
        <Kpi
          label="Latência média"
          value={m.avg_latency_ms != null ? `${m.avg_latency_ms} ms` : "—"}
          icon={Activity}
        />
        <Kpi
          label="Latência p95"
          value={m.p95_latency_ms != null ? `${m.p95_latency_ms} ms` : "—"}
          icon={Activity}
        />
      </div>

      {/* Acquirers */}
      <section className="card space-y-3">
        <h2 className="font-medium text-sm flex items-center gap-2">
          <Server className="w-4 h-4 text-flux-muted" /> Adquirentes
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {data.acquirers.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-flux-border bg-flux-gray/30 px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium">{a.displayName}</p>
                <p className="text-[0.7rem] text-flux-muted">
                  {a.active ? "no pool ativo" : "fora do pool"}
                  {a.latencyMs != null ? ` · ${a.latencyMs} ms` : ""}
                </p>
              </div>
              <span
                className={`text-[0.65rem] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${acquirerBadge(a.status)}`}
              >
                {a.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* PIX in */}
        <Feed
          title="PIX entrando"
          icon={ArrowDownLeft}
          empty="Nenhum PIX recente neste ambiente."
          rows={data.pix_in.map((p) => ({
            id: p.id,
            primary: formatCurrency(p.amount),
            secondary: p.payer_name || p.organization_id.slice(0, 8),
            meta: `${p.status}${p.provider ? ` · ${p.provider}` : ""}`,
            when: p.created_at,
            tone: statusTone(p.status),
          }))}
        />

        {/* Withdrawals */}
        <Feed
          title="Saques saindo"
          icon={ArrowUpRight}
          empty="Nenhum saque recente."
          rows={data.withdrawals_out.map((w) => ({
            id: w.id,
            primary: formatCurrency(w.amount),
            secondary: w.failure_reason?.slice(0, 48) || w.organization_id.slice(0, 8),
            meta: w.status,
            when: w.created_at,
            tone: statusTone(w.status),
          }))}
        />

        {/* Queue */}
        <Feed
          title={`Fila local (${data.queue.length})`}
          icon={Server}
          empty="Fila vazia — sem PIX aguardando adquirente."
          rows={data.queue.map((q) => ({
            id: q.id,
            primary: formatCurrency(q.amount),
            secondary: q.last_error?.slice(0, 56) || q.queue_state,
            meta: `retry ${q.retry_count}${q.next_retry_at ? ` · next ${formatDate(q.next_retry_at)}` : ""}`,
            when: q.created_at,
            tone: "text-amber-300",
          }))}
        />

        {/* Webhooks */}
        <Feed
          title="Webhooks com problema"
          icon={Webhook}
          empty="Nenhuma entrega falha/pendente."
          rows={data.webhook_issues.map((d) => ({
            id: d.id,
            primary: d.event_type || "evento",
            secondary: `HTTP ${d.response_status ?? "—"} · tent. ${d.attempt_count ?? 0}`,
            meta: d.status,
            when: d.created_at,
            tone: statusTone(d.status),
          }))}
        />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: "default" | "ok" | "warn" | "bad";
}) {
  const tones = {
    default: "text-white",
    ok: "text-emerald-300",
    warn: "text-amber-300",
    bad: "text-red-300",
  };
  return (
    <div className="rounded-xl border border-flux-border bg-flux-dark/80 px-3 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[0.65rem] uppercase tracking-wider text-flux-muted">{label}</span>
        <Icon className="w-3.5 h-3.5 text-flux-muted" />
      </div>
      <p className={`text-lg font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function Feed({
  title,
  icon: Icon,
  empty,
  rows,
}: {
  title: string;
  icon: React.ElementType;
  empty: string;
  rows: Array<{ id: string; primary: string; secondary: string; meta: string; when: string; tone: string }>;
}) {
  return (
    <section className="card space-y-3 min-h-[280px]">
      <h2 className="font-medium text-sm flex items-center gap-2">
        <Icon className="w-4 h-4 text-flux-muted" /> {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-flux-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-flux-border/80 max-h-[340px] overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id} className="py-2.5 flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold tabular-nums">{r.primary}</p>
                <p className="text-xs text-flux-muted truncate">{r.secondary}</p>
                <p className={`text-[0.7rem] mt-0.5 ${r.tone}`}>{r.meta}</p>
              </div>
              <time className="text-[0.65rem] text-flux-muted whitespace-nowrap shrink-0">
                {formatDate(r.when)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
