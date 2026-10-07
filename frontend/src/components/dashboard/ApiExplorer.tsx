"use client";

import { useState } from "react";
import { CopyButton } from "@/components/dashboard/ui-client";

/**
 * API Explorer using ONLY real FluxPay /v1 endpoints.
 * Does not invent routes. User provides their own secret key locally
 * (never stored). Defaults to test-safe paths.
 */
const ENDPOINTS = [
  { method: "POST" as const, path: "/v1/payments", body: '{\n  "amount": 4990,\n  "currency": "BRL",\n  "description": "Teste Explorer",\n  "payment_method": { "type": "pix" }\n}' },
  { method: "GET" as const, path: "/v1/payments", body: "" },
  { method: "GET" as const, path: "/v1/balance", body: "" },
  { method: "GET" as const, path: "/v1/customers", body: "" },
  { method: "GET" as const, path: "/v1/webhooks/endpoints", body: "" },
];

export function ApiExplorer({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [endpointIdx, setEndpointIdx] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [body, setBody] = useState(ENDPOINTS[0].body);
  const [response, setResponse] = useState<string>("");
  const [status, setStatus] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [envGuard, setEnvGuard] = useState(true);

  const ep = ENDPOINTS[endpointIdx];

  async function run() {
    if (!apiKey.startsWith("sk_")) {
      setResponse("Informe uma chave secreta sk_test_ ou sk_live_.");
      return;
    }
    if (envGuard && apiKey.startsWith("sk_live_")) {
      setResponse(
        "Protecao ativa: chamadas com sk_live_ estao bloqueadas neste explorer. Desative a protecao apenas se tiver certeza."
      );
      return;
    }
    setBusy(true);
    setResponse("");
    setStatus(null);
    try {
      const init: RequestInit = {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `explorer-${Date.now()}`,
        },
      };
      if (ep.method === "POST" && body.trim()) {
        init.body = body;
      }
      const res = await fetch(`${apiBaseUrl}${ep.path}`, init);
      setStatus(res.status);
      const text = await res.text();
      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponse(text);
      }
    } catch (e) {
      setResponse((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="font-medium">API Explorer</h3>
        <p className="text-sm text-flux-muted mt-1">
          Endpoints reais da FluxPay. A chave fica so no seu navegador e nao e salva.
        </p>
      </div>

      <div>
        <label className="label">Endpoint</label>
        <select
          className="input"
          value={endpointIdx}
          onChange={(e) => {
            const i = Number(e.target.value);
            setEndpointIdx(i);
            setBody(ENDPOINTS[i].body);
          }}
        >
          {ENDPOINTS.map((e, i) => (
            <option key={e.path + e.method} value={i}>
              {e.method} {e.path}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">API Key (sk_...)</label>
        <input
          className="input font-mono text-sm"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk_test_..."
          autoComplete="off"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-flux-muted">
        <input
          type="checkbox"
          checked={envGuard}
          onChange={(e) => setEnvGuard(e.target.checked)}
        />
        Bloquear chamadas com chave live (recomendado)
      </label>

      {ep.method === "POST" && (
        <div>
          <label className="label">Body</label>
          <textarea
            className="input font-mono text-xs min-h-[140px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
      )}

      <button type="button" className="btn-primary" disabled={busy} onClick={() => void run()}>
        {busy ? "Executando..." : "Executar"}
      </button>

      {(status !== null || response) && (
        <div className="rounded-lg border border-flux-border bg-flux-black overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-flux-border">
            <span className="text-xs text-flux-muted">
              {status !== null ? `HTTP ${status}` : "Resposta"}
            </span>
            {response && <CopyButton value={response} className="text-xs" />}
          </div>
          <pre className="p-4 overflow-x-auto text-xs font-mono whitespace-pre-wrap">{response}</pre>
        </div>
      )}
    </div>
  );
}
