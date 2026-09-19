"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Copy, Check, Trash2, Webhook } from "lucide-react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { Table, EmptyState } from "./ui";
import { WEBHOOK_EVENTS, type WebhookEndpoint } from "@/lib/types";

/**
 * Criacao passa pelo backend porque gera o segredo HMAC do endpoint
 * (generateWebhookSecret) — a migration 010 revogou o INSERT direto.
 * Editar url/eventos/descricao/enabled e apagar o endpoint, sim, o painel faz
 * direto: a mesma migration concedeu UPDATE dessas colunas especificas.
 */
export function WebhooksManager({
  endpoints,
  canWrite,
}: {
  endpoints: WebhookEndpoint[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>(["payment.succeeded"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleEvent(event: string) {
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  }

  async function create() {
    if (!url.trim() || events.length === 0) {
      setError("Informe a URL e ao menos um evento.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await dashboardFetch<{ data: { secret?: string } }>("/webhooks/endpoints", {
        method: "POST",
        body: { url: url.trim(), events, description: description.trim() || undefined },
      });
      setSecret(res.data.secret ?? null);
      setCreating(false);
      setUrl("");
      setDescription("");
      setEvents(["payment.succeeded"]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar o endpoint.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(endpoint: WebhookEndpoint) {
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("webhook_endpoints")
      .update({ enabled: !endpoint.enabled })
      .eq("id", endpoint.id);
    if (dbError) {
      window.alert(`Não foi possível atualizar: ${dbError.message}`);
      return;
    }
    router.refresh();
  }

  async function remove(endpoint: WebhookEndpoint) {
    if (!window.confirm(`Apagar o endpoint ${endpoint.url}?`)) return;
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("webhook_endpoints")
      .delete()
      .eq("id", endpoint.id);
    if (dbError) {
      window.alert(`Não foi possível apagar: ${dbError.message}`);
      return;
    }
    router.refresh();
  }

  async function copySecret(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <button
            className="btn-primary flex items-center gap-2 text-sm"
            onClick={() => {
              setError(null);
              setCreating(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Novo endpoint
          </button>
        </div>
      )}

      {endpoints.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="Nenhum endpoint configurado"
          description="Cadastre uma URL para receber os eventos de pagamento assim que eles acontecerem, em vez de consultar a API de tempos em tempos."
        />
      ) : (
        <Table headers={["URL", "Eventos", "Descrição", "Criado em", "Status", ""]}>
          {endpoints.map((e) => (
            <tr key={e.id} className="hover:bg-flux-gray/40">
              <td className="px-6 py-4 font-mono text-xs break-all max-w-[280px]">{e.url}</td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap gap-1 max-w-[260px]">
                  {e.events.map((ev) => (
                    <span key={ev} className="badge bg-flux-gray-light text-flux-muted">
                      {ev}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-6 py-4 text-flux-muted">{e.description || "—"}</td>
              <td className="px-6 py-4 text-flux-muted whitespace-nowrap">{formatDate(e.created_at)}</td>
              <td className="px-6 py-4">
                {e.enabled ? (
                  <span className="badge-success">Ativo</span>
                ) : (
                  <span className="badge bg-gray-500/10 text-gray-400">Desativado</span>
                )}
              </td>
              <td className="px-6 py-4 text-right">
                {canWrite ? (
                  <div className="flex items-center justify-end gap-3">
                    <button
                      className="text-xs text-flux-muted hover:text-white underline underline-offset-2"
                      onClick={() => toggleEnabled(e)}
                    >
                      {e.enabled ? "Desativar" : "Ativar"}
                    </button>
                    <button className="text-flux-muted hover:text-red-400" onClick={() => remove(e)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-flux-muted text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 overflow-y-auto">
          <div className="card w-full max-w-lg space-y-4">
            <h3 className="font-medium">Novo endpoint de webhook</h3>

            <div>
              <label className="block text-sm font-medium mb-1.5">URL</label>
              <input
                className="input font-mono text-sm"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://seusite.com.br/webhooks/fluxpay"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Descrição <span className="text-flux-muted font-normal">(opcional)</span>
              </label>
              <input
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Eventos</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-sm text-flux-muted">
                    <input
                      type="checkbox"
                      className="accent-flux-red"
                      checked={events.includes(ev)}
                      onChange={() => toggleEvent(ev)}
                    />
                    <span className="font-mono text-xs">{ev}</span>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button className="btn-secondary text-sm" onClick={() => setCreating(false)} disabled={busy}>
                Cancelar
              </button>
              <button className="btn-primary text-sm flex items-center gap-2" onClick={create} disabled={busy}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar endpoint
              </button>
            </div>
          </div>
        </div>
      )}

      {secret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="card w-full max-w-lg space-y-4">
            <h3 className="font-medium">Segredo de assinatura</h3>
            <p className="text-sm text-flux-muted">
              Use este segredo para validar o header <code>FluxPay-Signature</code> (HMAC-SHA256 de{" "}
              <code>&quot;timestamp.corpo&quot;</code>). Ele aparece uma única vez.
            </p>
            <div className="flex items-center gap-2 bg-flux-gray border border-flux-border rounded-lg px-3 py-2">
              <code className="flex-1 font-mono text-xs break-all">{secret}</code>
              <button className="text-flux-muted hover:text-white" onClick={() => copySecret(secret)}>
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary text-sm" onClick={() => setSecret(null)}>
                Já guardei
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
