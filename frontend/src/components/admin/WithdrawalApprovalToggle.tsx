"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";

export function WithdrawalApprovalToggle({
  organizationId,
  canAct,
}: {
  organizationId: string;
  canAct: boolean;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch<{ data: { requires_manual_withdrawal_approval: boolean } }>(
          `/organizations/${organizationId}/withdrawal-approval`
        );
        if (!cancelled) setEnabled(Boolean(res.data.requires_manual_withdrawal_approval));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Falha ao carregar");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  async function toggle() {
    if (enabled === null || !canAct) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: { requires_manual_withdrawal_approval: boolean } }>(
        `/organizations/${organizationId}/withdrawal-approval`,
        {
          method: "PATCH",
          body: {
            enabled: !enabled,
            reason: !enabled
              ? "Ativar aprovacao manual de saque pela ficha da org"
              : "Desativar aprovacao manual de saque pela ficha da org",
          },
        }
      );
      setEnabled(Boolean(res.data.requires_manual_withdrawal_approval));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="font-medium">Aprovação manual de saques</h2>
        <p className="text-sm text-flux-muted mt-1">
          Quando ativo, novos saques desta organização ficam pendentes até um administrador aprovar.
          Quando inativo, o sistema tenta executar automaticamente após reservar o saldo.
        </p>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm">
          Status:{" "}
          <strong>
            {enabled === null ? "…" : enabled ? "Aprovação manual obrigatória" : "Execução automática"}
          </strong>
        </span>
        {canAct && (
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={busy || enabled === null}
            onClick={toggle}
          >
            {busy ? "Salvando…" : enabled ? "Desativar aprovação manual" : "Exigir aprovação manual"}
          </button>
        )}
      </div>
    </div>
  );
}
