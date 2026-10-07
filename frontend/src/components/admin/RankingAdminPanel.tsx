"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * ADM ranking panel — uses /admin-api/ranking/* with platform admin session.
 * Expects adminFetch helper similar to other admin panels.
 */
export function RankingAdminPanel({
  adminFetch,
}: {
  adminFetch: <T>(path: string, init?: RequestInit & { body?: unknown }) => Promise<T>;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [manualCents, setManualCents] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch<{ data: any[] }>("/ranking/participants");
      setRows(res.data || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addParticipant(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminFetch("/ranking/participants", {
        method: "POST",
        body: {
          display_name: name,
          organization_id: orgId || null,
          manual_amount_cents: orgId
            ? null
            : Math.round(parseFloat(manualCents.replace(",", ".") || "0") * 100),
          is_active: true,
        },
      });
      setName("");
      setOrgId("");
      setManualCents("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(id: string, is_active: boolean) {
    setBusy(true);
    try {
      await adminFetch(`/ranking/participants/${id}`, {
        method: "PATCH",
        body: { is_active: !is_active, display_name: rows.find((r) => r.id === id)?.display_name || "Participante" },
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await adminFetch(`/ranking/participants/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="font-medium text-lg">Ranking — participantes</h2>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <form onSubmit={addParticipant} className="card space-y-3">
        <input
          className="input"
          placeholder="Nome de exibicao"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="input font-mono text-sm"
          placeholder="Organization ID (opcional — usuario existente)"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
        />
        {!orgId && (
          <input
            className="input"
            placeholder="Valor manual (R$)"
            value={manualCents}
            onChange={(e) => setManualCents(e.target.value)}
          />
        )}
        <button type="submit" className="btn-primary" disabled={busy}>
          Adicionar participante
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-flux-muted border-b border-flux-border">
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 pr-3">Org</th>
              <th className="py-2 pr-3">Ativo</th>
              <th className="py-2">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-flux-border/50">
                <td className="py-2 pr-3">{r.display_name}</td>
                <td className="py-2 pr-3 font-mono text-xs">{r.organization_id || "—"}</td>
                <td className="py-2 pr-3">{r.is_active ? "Sim" : "Nao"}</td>
                <td className="py-2 space-x-2">
                  <button
                    type="button"
                    className="text-xs text-flux-accent"
                    onClick={() => void toggleActive(r.id, r.is_active)}
                  >
                    {r.is_active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-400"
                    onClick={() => void remove(r.id)}
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
