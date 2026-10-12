"use client";

import { useCallback, useEffect, useState } from "react";

type Participant = {
  id: string;
  organization_id: string | null;
  display_name: string;
  avatar_url: string | null;
  manual_amount_cents: number | null;
  score_override: number | null;
  is_active: boolean;
  created_at: string;
};

type BoardRow = {
  position: number;
  id: string;
  display_name: string;
  amount_cents: number;
  score: number;
  score_level_label: string;
  source: string;
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function RankingAdminPanel({
  adminFetch,
}: {
  adminFetch: <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;
}) {
  const [rows, setRows] = useState<Participant[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [manualReais, setManualReais] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, boardRes] = await Promise.all([
        adminFetch<{ data: Participant[] }>("/ranking/participants"),
        adminFetch<{ data: BoardRow[] }>("/ranking/board"),
      ]);
      setRows(listRes.data || []);
      setBoard(boardRes.data || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
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
      const body: Record<string, unknown> = {
        display_name: name.trim(),
        is_active: true,
      };
      if (orgId.trim()) {
        body.organization_id = orgId.trim();
      } else {
        const reais = parseFloat(manualReais.replace(",", ".") || "0");
        if (!Number.isFinite(reais) || reais < 0) {
          throw new Error("Informe um valor manual valido ou um Organization ID.");
        }
        body.manual_amount_cents = Math.round(reais * 100);
      }
      await adminFetch("/ranking/participants", { method: "POST", body });
      setName("");
      setOrgId("");
      setManualReais("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: Participant) {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/ranking/participants/${row.id}`, {
        method: "PATCH",
        body: {
          display_name: row.display_name,
          is_active: !row.is_active,
          organization_id: row.organization_id,
          manual_amount_cents: row.manual_amount_cents,
        },
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remover este participante do ranking?")) return;
    setBusy(true);
    setError(null);
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
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={addParticipant} className="card space-y-4">
        <h2 className="font-medium">Adicionar participante</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Nome de exibicao</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={80}
              disabled={busy}
            />
          </div>
          <div>
            <label className="label">Organization ID (usuario existente)</label>
            <input
              className="input font-mono text-sm"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              placeholder="UUID da organizacao (opcional)"
              disabled={busy}
            />
          </div>
        </div>
        {!orgId.trim() && (
          <div>
            <label className="label">Valor manual (R$) — apenas sem organizacao</label>
            <input
              className="input"
              value={manualReais}
              onChange={(e) => setManualReais(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              disabled={busy}
            />
          </div>
        )}
        <button type="submit" className="btn-primary" disabled={busy || name.trim().length < 2}>
          {busy ? "Salvando..." : "Adicionar ao ranking"}
        </button>
      </form>

      <div className="card space-y-3">
        <h2 className="font-medium">Board atual (calculado)</h2>
        {loading ? (
          <p className="text-sm text-flux-muted py-6 text-center">Carregando...</p>
        ) : board.length === 0 ? (
          <p className="text-sm text-flux-muted py-6 text-center">Nenhum participante ativo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-flux-muted border-b border-flux-border">
                  <th className="py-2 pr-3">Pos.</th>
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3 text-right">Volume</th>
                  <th className="py-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {board.map((b) => (
                  <tr key={b.id} className="border-b border-flux-border/50">
                    <td className="py-2 pr-3 font-mono text-flux-muted">{b.position}</td>
                    <td className="py-2 pr-3">{b.display_name}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {formatBRL(b.amount_cents)}
                    </td>
                    <td className="py-2 text-right">
                      {b.score} <span className="text-flux-muted text-xs">{b.score_level_label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">Todos os participantes</h2>
        {loading ? (
          <p className="text-sm text-flux-muted py-6 text-center">Carregando...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-flux-muted py-6 text-center">Nenhum participante cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-flux-muted border-b border-flux-border">
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Org</th>
                  <th className="py-2 pr-3">Manual</th>
                  <th className="py-2 pr-3">Ativo</th>
                  <th className="py-2">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-flux-border/50">
                    <td className="py-2 pr-3">{r.display_name}</td>
                    <td className="py-2 pr-3 font-mono text-[11px] max-w-[140px] truncate">
                      {r.organization_id || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.organization_id
                        ? "auto"
                        : formatBRL(r.manual_amount_cents || 0)}
                    </td>
                    <td className="py-2 pr-3">{r.is_active ? "Sim" : "Nao"}</td>
                    <td className="py-2 space-x-3">
                      <button
                        type="button"
                        className="text-xs text-flux-accent hover:underline"
                        disabled={busy}
                        onClick={() => void toggleActive(r)}
                      >
                        {r.is_active ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-400 hover:underline"
                        disabled={busy}
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
        )}
      </div>
    </div>
  );
}
