"use client";

import { useState } from "react";
import { FlaskConical, Loader2, CheckCircle2 } from "lucide-react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { friendlyError } from "@/lib/labels";
import type { WebhookEndpoint } from "@/lib/types";

const SAMPLE_EVENTS = [
  "payment.succeeded",
  "payment.pending",
  "payment.failed",
  "payment.created",
] as const;

export function WebhookPlayground({
  endpoints,
  canWrite,
}: {
  endpoints: WebhookEndpoint[];
  canWrite: boolean;
}) {
  const active = endpoints.filter((e) => e.enabled);
  const [endpointId, setEndpointId] = useState(active[0]?.id || "");
  const [eventType, setEventType] = useState<string>("payment.succeeded");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    status?: number;
    message: string;
  } | null>(null);

  async function sendTest() {
    if (!endpointId) {
      setResult({ ok: false, message: "Cadastre e ative um endpoint primeiro." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await dashboardFetch<{
        data: { http_status?: number; delivered: boolean; message?: string };
      }>(`/webhooks/endpoints/${endpointId}/test`, {
        method: "POST",
        body: { event_type: eventType },
      });
      setResult({
        ok: res.data.delivered,
        status: res.data.http_status,
        message:
          res.data.message ||
          (res.data.delivered
            ? `Evento de teste enviado (HTTP ${res.data.http_status ?? "—"})."`
            : "Entrega não confirmada."),
      });
    } catch (e) {
      setResult({ ok: false, message: friendlyError(e, "Falha ao enviar teste.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0">
          <FlaskConical className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-medium">Playground de webhooks</h2>
          <p className="text-sm text-flux-muted mt-1">
            Envie um evento de teste com assinatura HMAC real para validar seu endpoint sem criar
            cobrança.
          </p>
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
    </div>
  );
}
