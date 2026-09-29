"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";

interface CardItem {
  id: string;
  full_name: string;
  phone: string;
  status: string;
  card_number: string | null;
  card_number_display: string | null;
  rejection_reason: string | null;
  email: string | null;
  organization_name: string | null;
  organization_id: string;
  user_id: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  blocked_at: string | null;
}

export default function AdminFluxPayCardPage() {
  const [items, setItems] = useState<CardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = filter ? `?status=${encodeURIComponent(filter)}` : "";
      const data = await adminFetch<{ items: CardItem[]; total: number }>(
        `/fluxpay-card${q}`
      );
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(id: string, path: string, body?: unknown) {
    setBusyId(id);
    setError(null);
    try {
      await adminFetch(`/fluxpay-card/${id}/${path}`, {
        method: "POST",
        body: body ?? {},
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">FluxPay Card</h1>
          <p className="text-sm text-flux-muted mt-1">
            Solicitacoes e gestao de carteiras internas
          </p>
        </div>
        <select
          className="input w-auto text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="pending_review">Em analise</option>
          <option value="approved">Aprovadas</option>
          <option value="rejected">Rejeitadas</option>
          <option value="blocked">Bloqueadas</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-flux-muted py-12 text-center">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="card text-center text-sm text-flux-muted py-12">
          Nenhuma carteira encontrada.
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-flux-muted">{total} registro(s)</p>
          {items.map((c) => (
            <div key={c.id} className="card space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="font-medium truncate">{c.full_name}</div>
                  <div className="text-xs text-flux-muted space-y-0.5">
                    <div>Email: {c.email || "—"}</div>
                    <div>Telefone: {c.phone}</div>
                    <div>Organizacao: {c.organization_name || c.organization_id}</div>
                    <div className="font-mono text-[10px]">Org ID: {c.organization_id}</div>
                    <div>
                      Solicitacao: {new Date(c.created_at).toLocaleString("pt-BR")}
                    </div>
                    {c.reviewed_at && (
                      <div>
                        Revisao: {new Date(c.reviewed_at).toLocaleString("pt-BR")}
                      </div>
                    )}
                    {c.card_number_display && (
                      <div className="font-mono">Cartao: {c.card_number_display}</div>
                    )}
                    {c.rejection_reason && (
                      <div>Motivo rejeicao: {c.rejection_reason}</div>
                    )}
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {c.status === "pending_review" && (
                  <>
                    <button
                      type="button"
                      className="btn-primary text-sm"
                      disabled={busyId === c.id}
                      onClick={() => action(c.id, "approve")}
                    >
                      Aprovar
                    </button>
                    <div className="flex gap-2 flex-1 min-w-[200px]">
                      <input
                        className="input text-sm flex-1"
                        placeholder="Motivo da rejeicao (opcional)"
                        value={rejectReason[c.id] || ""}
                        onChange={(e) =>
                          setRejectReason((r) => ({ ...r, [c.id]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        disabled={busyId === c.id}
                        onClick={() =>
                          action(c.id, "reject", {
                            reason: rejectReason[c.id] || null,
                          })
                        }
                      >
                        Rejeitar
                      </button>
                    </div>
                  </>
                )}
                {c.status === "approved" && (
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    disabled={busyId === c.id}
                    onClick={() => action(c.id, "block")}
                  >
                    Bloquear
                  </button>
                )}
                {c.status === "blocked" && (
                  <button
                    type="button"
                    className="btn-primary text-sm"
                    disabled={busyId === c.id}
                    onClick={() => action(c.id, "unblock")}
                  >
                    Desbloquear
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending_review: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    rejected: "bg-red-500/15 text-red-300 border-red-500/30",
    blocked: "bg-white/10 text-white/70 border-white/20",
  };
  const labels: Record<string, string> = {
    pending_review: "Em analise",
    approved: "Aprovada",
    rejected: "Rejeitada",
    blocked: "Bloqueada",
  };
  return (
    <span
      className={`text-[11px] uppercase tracking-wider px-2.5 py-1 rounded border shrink-0 ${map[status] || "bg-white/5 text-white/60 border-white/10"}`}
    >
      {labels[status] || status}
    </span>
  );
}
