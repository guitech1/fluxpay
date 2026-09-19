"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Copy, Check, Key } from "lucide-react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { formatDate } from "@/lib/utils";
import { Table, Mono, EmptyState } from "./ui";
import type { ApiKey, Environment } from "@/lib/types";

/**
 * Criacao passa pelo backend (/dashboard-api/api-keys) porque o segredo e
 * gerado e "hasheado" la — a migration 010 revogou o INSERT direto em
 * api_keys para o usuario logado. Revogacao, sim, o painel faz direto:
 * a mesma migration concedeu UPDATE apenas da coluna revoked_at.
 */
export function ApiKeysManager({
  apiKeys,
  environment,
  canWrite,
}: {
  apiKeys: ApiKey[];
  environment: Environment;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [keyType, setKeyType] = useState<"secret" | "publishable">("secret");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    if (!name.trim()) {
      setError("Dê um nome para identificar a chave.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await dashboardFetch<{ data: { key: string } }>("/api-keys", {
        method: "POST",
        body: { name: name.trim(), key_type: keyType },
      });
      setCreatedKey(res.data.key);
      setCreating(false);
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar a chave.");
    } finally {
      setBusy(false);
    }
  }

  /*
   * A revogação passa pelo backend (/dashboard-api/api-keys/:id/revoke).
   * Antes era um UPDATE direto pelo Supabase client com `.eq("id", ...)`: a
   * RLS confere se a pessoa pertence à empresa, mas não sabe em qual ambiente
   * o painel está — uma chave de produção podia ser revogada a partir da
   * visão de testes, bastando o id. O servidor valida organização +
   * ambiente + id antes de escrever.
   */
  async function revoke(key: ApiKey) {
    if (!window.confirm(`Revogar "${key.name}"? Integrações que usam essa chave param na hora.`)) {
      return;
    }
    try {
      await dashboardFetch(`/api-keys/${key.id}/revoke`, { method: "POST" });
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Não foi possível revogar a chave.");
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="card bg-amber-500/5 border-amber-500/20">
        <p className="text-sm text-amber-200/90">
          <strong>Importante:</strong> chaves secretas (sk_) aparecem uma única vez, no momento da
          criação — depois disso só guardamos o hash. Chaves criadas aqui pertencem ao ambiente{" "}
          <strong>{environment === "live" ? "de produção" : "de testes"}</strong>.
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
            Nova chave
          </button>
        </div>
      )}

      {apiKeys.length === 0 ? (
        <EmptyState
          icon={Key}
          title="Nenhuma chave neste ambiente"
          description="Crie uma chave para o seu sistema se autenticar na API. A chave secreta é exibida uma única vez, no momento da criação."
        />
      ) : (
        <Table headers={["Nome", "Tipo", "Prefixo", "Último uso", "Criada em", "Status", ""]}>
          {apiKeys.map((k) => (
            <tr key={k.id} className="hover:bg-flux-gray/40">
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-flux-muted" />
                  {k.name}
                </div>
              </td>
              <td className="px-6 py-4 text-flux-muted">
                {k.key_type === "secret" ? "Secreta" : "Publicável"}
              </td>
              <td className="px-6 py-4">
                <Mono>{k.key_prefix}••••••••</Mono>
              </td>
              <td className="px-6 py-4 text-flux-muted whitespace-nowrap">
                {k.last_used_at ? formatDate(k.last_used_at) : "Nunca usada"}
              </td>
              <td className="px-6 py-4 text-flux-muted whitespace-nowrap">{formatDate(k.created_at)}</td>
              <td className="px-6 py-4">
                {k.revoked_at ? (
                  <span className="badge bg-gray-500/10 text-gray-400">Revogada</span>
                ) : (
                  <span className="badge-success">Ativa</span>
                )}
              </td>
              <td className="px-6 py-4 text-right">
                {canWrite && !k.revoked_at ? (
                  <button
                    className="text-xs text-flux-muted hover:text-red-400 underline underline-offset-2"
                    onClick={() => revoke(k)}
                  >
                    Revogar
                  </button>
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
          <div className="card w-full max-w-md space-y-4">
            <h3 className="font-medium">Nova chave de API</h3>

            <div>
              <label className="block text-sm font-medium mb-1.5">Nome</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Backend de produção"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Tipo</label>
              <select
                className="input"
                value={keyType}
                onChange={(e) => setKeyType(e.target.value as "secret" | "publishable")}
              >
                <option value="secret">Secreta (sk_) — servidor</option>
                <option value="publishable">Publicável (pk_) — sem endpoint ainda</option>
              </select>
              <p className="text-xs text-flux-muted mt-1.5 leading-relaxed">
                Todos os endpoints da API exigem chave secreta, inclusive os de leitura
                (cobranças, clientes e saldo são dados privados da empresa). Nenhuma rota aceita
                chave publicável hoje — crie uma só se você já sabe para quê.
              </p>
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
                Criar chave
              </button>
            </div>
          </div>
        </div>
      )}

      {createdKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="card w-full max-w-lg space-y-4">
            <h3 className="font-medium">Copie sua chave agora</h3>
            <p className="text-sm text-flux-muted">
              Esta é a única vez que ela aparece. Guarde em um gerenciador de secrets — se perder,
              revogue e crie outra.
            </p>
            <div className="flex items-center gap-2 bg-flux-gray border border-flux-border rounded-lg px-3 py-2">
              <code className="flex-1 font-mono text-xs break-all">{createdKey}</code>
              <button className="text-flux-muted hover:text-white" onClick={() => copy(createdKey)}>
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary text-sm" onClick={() => setCreatedKey(null)}>
                Já guardei
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
