"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Copy, Check, Trash2, Webhook, KeyRound } from "lucide-react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { formatDate } from "@/lib/utils";
import { Table, EmptyState } from "./ui";
import { WEBHOOK_EVENTS, type WebhookEndpoint } from "@/lib/types";

/**
 * Criação gera o segredo HMAC (generateWebhookSecret).
 * O secret aparece uma vez no modal; use "Gerar secret" para rotacionar.
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
  const [secretTitle, setSecretTitle] = useState("Segredo de assinatura");
  const [copied, setCopied] = useState(false);

  function toggleEvent(event: string) {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }

  async function copySecret(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
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
      setSecretTitle("Segredo gerado — copie agora");
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

  async function rotateSecret(endpoint: WebhookEndpoint) {
    if (
      !confirm(
        "Gerar um novo secret? O secret antigo deixa de valer na hora. Atualize seu servidor antes de receber novos eventos."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await dashboardFetch<{ data: { secret: string } }>(
        `/webhooks/endpoints/${endpoint.id}/rotate-secret`,
        { method: "POST", body: {} }
      );
      setSecretTitle("Novo secret gerado — copie agora");
      setSecret(res.data.secret);
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar o secret.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(endpoint: WebhookEndpoint) {
    setBusy(true);
    setError(null);
    try {
      await dashboardFetch(`/webhooks/endpoints/${endpoint.id}`, {
        method: "PATCH",
        body: { enabled: !endpoint.enabled },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar o endpoint.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(endpoint: WebhookEndpoint) {
    if (!confirm("Remover este endpoint? As entregas param na hora.")) return;
    setBusy(true);
    setError(null);
    try {
      await dashboardFetch(`/webhooks/endpoints/${endpoint.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover o endpoint.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-flux-border bg-flux-card/50 px-4 py-3 text-sm text-flux-muted leading-relaxed">
        <p>
          <strong className="text-white">Secret HMAC:</strong> é gerado automaticamente ao criar o
          endpoint (e também pelo botão <strong className="text-white">Gerar secret</strong>). Use
          para validar o header{" "}
          <code className="font-mono text-xs text-white">FluxPay-Signature</code> quando o pagamento
          for pago (<code className="font-mono text-xs text-white">payment.succeeded</code>).
        </p>
      </div>

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

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {endpoints.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="Nenhum endpoint configurado"
          description="Cadastre uma URL. Ao criar, a FluxPay gera o secret de assinatura para você validar os eventos."
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
                  <div className="flex items-center justify-end gap-3 flex-wrap">
                    <button
                      type="button"
                      className="text-xs text-sky-300 hover:text-sky-200 underline underline-offset-2 inline-flex items-center gap-1"
                      disabled={busy}
                      onClick={() => rotateSecret(e)}
                      title="Gera um novo secret HMAC"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      Gerar secret
                    </button>
                    <button
                      type="button"
                      className="text-xs text-flux-muted hover:text-white underline underline-offset-2"
                      disabled={busy}
                      onClick={() => toggleEnabled(e)}
                    >
                      {e.enabled ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      className="text-flux-muted hover:text-red-400"
                      disabled={busy}
                      onClick={() => remove(e)}
                    >
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="card w-full max-w-lg space-y-4">
            <h3 className="font-medium">Novo endpoint de webhook</h3>
            <p className="text-sm text-flux-muted">
              Ao criar, geramos automaticamente um <strong className="text-white">secret</strong>{" "}
              (HMAC). Ele aparece uma vez — use para validar{" "}
              <code className="font-mono text-xs">FluxPay-Signature</code> no seu servidor.
            </p>

            <div>
              <label className="block text-sm font-medium mb-1.5">URL do endpoint</label>
              <input
                className="input font-mono text-sm"
                placeholder="https://seu-servidor.com/webhooks/fluxpay"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Descrição (opcional)</label>
              <input
                className="input text-sm"
                placeholder="Produção — pagamento pago"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Eventos</label>
              <div className="flex flex-wrap gap-2">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label
                    key={ev}
                    className={`text-xs px-2.5 py-1.5 rounded-full border cursor-pointer ${
                      events.includes(ev)
                        ? "border-sky-400/50 bg-sky-500/15 text-sky-100"
                        : "border-flux-border text-flux-muted"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={events.includes(ev)}
                      onChange={() => toggleEvent(ev)}
                    />
                    {ev}
                  </label>
                ))}
              </div>
              <p className="text-xs text-flux-muted mt-2">
                Marque <code className="font-mono">payment.succeeded</code> para ser notificado quando
                o PIX for pago.
              </p>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                className="btn-secondary text-sm"
                onClick={() => setCreating(false)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                className="btn-primary text-sm flex items-center gap-2"
                onClick={create}
                disabled={busy}
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar e gerar secret
              </button>
            </div>
          </div>
        </div>
      )}

      {secret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="card w-full max-w-lg space-y-4">
            <h3 className="font-medium">{secretTitle}</h3>
            <p className="text-sm text-flux-muted">
              Valide o header <code className="font-mono text-xs">FluxPay-Signature</code> (HMAC-SHA256).
              Este valor <strong className="text-white">não será mostrado de novo</strong> — copie e
              guarde no seu servidor.
            </p>
            <div className="flex items-center gap-2 bg-flux-gray border border-flux-border rounded-lg px-3 py-2">
              <code className="flex-1 font-mono text-xs break-all">{secret}</code>
              <button
                type="button"
                className="text-flux-muted hover:text-white"
                onClick={() => copySecret(secret)}
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
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
