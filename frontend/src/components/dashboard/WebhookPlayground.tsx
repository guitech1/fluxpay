"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FlaskConical, Loader2, X } from "lucide-react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { formatDate } from "@/lib/utils";
import type { WebhookEndpoint } from "@/lib/types";

const SAMPLE_EVENTS = [
  "payment.succeeded",
  "payment.pending",
  "payment.failed",
  "payment.expired",
];

export type PlaygroundDelivery = {
  id: string;
  status: string;
  attempt_count: number | null;
  response_status: number | null;
  created_at: string;
  request_body?: unknown;
  response_body?: string | null;
  webhook_events?: { type: string } | null;
};

export function WebhookPlayground({
  endpoints,
  canWrite,
  deliveries = [],
}: {
  endpoints: WebhookEndpoint[];
  canWrite: boolean;
  deliveries?: PlaygroundDelivery[];
}) {
  const active = endpoints.filter((e) => e.enabled);
  const [endpointId, setEndpointId] = useState(active[0]?.id || "");
  const [eventType, setEventType] = useState("payment.succeeded");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [selected, setSelected] = useState<PlaygroundDelivery | null>(null);

  const pulses = useMemo(() => {
    const list = [...deliveries].slice(0, 40).reverse();
    return list;
  }, [deliveries]);

  async function sendTest() {
    if (!endpointId) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await dashboardFetch<{ data: { ok?: boolean; status?: number; message?: string } }>(
        `/webhooks/endpoints/${endpointId}/test`,
        {
          method: "POST",
          body: { event_type: eventType },
        }
      );
      const ok = Boolean(res.data?.ok ?? (res.data?.status && res.data.status < 300));
      setResult({
        ok,
        message:
          res.data?.message ||
          (ok
            ? `Entrega ok${res.data?.status ? ` (HTTP ${res.data.status})` : ""}`
            : `Falha${res.data?.status ? ` (HTTP ${res.data.status})` : ""}`),
      });
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Falha ao enviar teste",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0">
          <FlaskConical className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-medium">Playground · osciloscópio</h2>
          <p className="text-sm text-flux-muted mt-1">
            Cada entrega vira um pulso na timeline. Verde = ok · Vermelho = falhou. Clique para ver o
            payload.
          </p>
        </div>
      </div>

      {/* Oscilloscope */}
      <div
        className="relative rounded-xl border border-flux-border bg-[#070b12] px-3 pt-4 pb-2 overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.04) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        <div className="flex items-end gap-[3px] h-24 sm:h-28">
          {pulses.length === 0 ? (
            <p className="text-xs text-flux-muted self-center w-full text-center py-6">
              Ainda sem entregas — envie um teste para ver os pulsos.
            </p>
          ) : (
            pulses.map((d) => {
              const ok = d.status === "success";
              const failed = d.status === "failed";
              const h = ok ? 72 : failed ? 56 : 36;
              return (
                <button
                  key={d.id}
                  type="button"
                  title={`${d.webhook_events?.type || "evento"} · ${d.status}`}
                  onClick={() => setSelected(d)}
                  className="flex-1 min-w-[6px] max-w-[18px] rounded-t-sm transition-opacity hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
                  style={{
                    height: h,
                    opacity: selected?.id === d.id ? 1 : 0.85,
                    background: ok
                      ? "linear-gradient(180deg, #6ee7b7 0%, #059669 100%)"
                      : failed
                        ? "linear-gradient(180deg, #fca5a5 0%, #dc2626 100%)"
                        : "linear-gradient(180deg, #fcd34d 0%, #d97706 100%)",
                    boxShadow: ok
                      ? "0 0 12px rgba(16,185,129,0.35)"
                      : failed
                        ? "0 0 12px rgba(239,68,68,0.4)"
                        : "0 0 8px rgba(245,158,11,0.25)",
                  }}
                />
              );
            })
          )}
        </div>
        <div className="flex justify-between text-[0.65rem] text-flux-muted mt-1 px-0.5">
          <span>mais antigo</span>
          <span>agora</span>
        </div>
      </div>

      {!active.length ? (
        <p className="text-sm text-flux-muted">Nenhum endpoint ativo. Crie um acima e deixe-o ligado.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Endpoint</label>
            <select
              className="input font-mono text-xs"
              value={endpointId}
              onChange={(e) => setEndpointId(e.target.value)}
              disabled={!canWrite}
            >
              {active.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.url}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Evento</label>
            <select
              className="input font-mono text-xs"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              disabled={!canWrite}
            >
              {SAMPLE_EVENTS.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {result && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm flex items-start gap-2 ${
            result.ok
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-200"
              : "bg-red-500/10 border-red-500/25 text-red-200"
          }`}
        >
          {result.ok && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{result.message}</span>
        </div>
      )}

      {canWrite && (
        <div className="flex justify-end">
          <button
            type="button"
            className="btn-primary text-sm flex items-center gap-2"
            disabled={busy || !active.length}
            onClick={sendTest}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Enviar evento de teste
          </button>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 py-6">
          <div className="card w-full max-w-lg space-y-3 relative max-h-[85vh] overflow-y-auto">
            <button
              type="button"
              className="absolute top-3 right-3 text-flux-muted hover:text-white"
              onClick={() => setSelected(null)}
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-medium pr-8">Pulso · entrega</h3>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-flux-muted">Evento</dt>
                <dd className="font-mono text-xs">{selected.webhook_events?.type || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-flux-muted">Status</dt>
                <dd
                  className={
                    selected.status === "success"
                      ? "text-emerald-300"
                      : selected.status === "failed"
                        ? "text-red-300"
                        : "text-amber-300"
                  }
                >
                  {selected.status}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-flux-muted">HTTP</dt>
                <dd>{selected.response_status ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-flux-muted">Tentativas</dt>
                <dd>{selected.attempt_count ?? 0}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-flux-muted">Quando</dt>
                <dd>{formatDate(selected.created_at)}</dd>
              </div>
            </dl>
            <div>
              <p className="text-xs font-semibold text-flux-muted mb-1.5">Payload</p>
              <pre className="text-[0.7rem] font-mono bg-black/50 border border-flux-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                {selected.request_body
                  ? JSON.stringify(selected.request_body, null, 2)
                  : selected.response_body || "(payload não armazenado nesta entrega)"}
              </pre>
            </div>
            <button type="button" className="btn-primary text-sm w-full" onClick={() => setSelected(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
