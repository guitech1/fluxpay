"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { adminFetch } from "@/lib/admin-api";

/** Busca dados do /admin-api com estados de carregamento, erro e recarga. */
export function useAdminData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await adminFetch<{ data: T }>(path);
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}

export function Loading() {
  return (
    <div className="card py-12 flex justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-flux-muted" />
    </div>
  );
}

export function Failed({ message }: { message: string }) {
  return (
    <div className="card border-red-500/20 bg-red-500/5 flex items-start gap-3 text-sm text-red-300">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function AdminTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-flux-muted border-b border-flux-border bg-flux-gray/30">
              {headers.map((h) => (
                <th key={h} className="px-5 py-3 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-flux-border">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <div className="text-sm text-flux-muted">{label}</div>
      <div className="text-2xl font-semibold tracking-tight mt-2">{value}</div>
      {hint && <div className="text-xs text-flux-muted mt-1">{hint}</div>}
    </div>
  );
}

const ACCOUNT_STATUS: Record<string, { label: string; className: string }> = {
  active: { label: "Ativa", className: "badge-success" },
  pending: { label: "Pendente", className: "badge-pending" },
  suspended: { label: "Suspensa", className: "badge bg-amber-500/10 text-amber-400" },
  banned: { label: "Banida", className: "badge-failed" },
  disabled: { label: "Desativada", className: "badge bg-gray-500/10 text-gray-400" },
};

export function AccountStatusBadge({ status }: { status: string }) {
  const s = ACCOUNT_STATUS[status] || { label: status, className: "badge" };
  return <span className={s.className}>{s.label}</span>;
}

/**
 * Diálogo de confirmação com MOTIVO OBRIGATÓRIO (mínimo de 10 caracteres, o
 * mesmo que o backend valida). Toda ação sensível do ADM passa por aqui, e o
 * motivo vai parar na trilha de auditoria junto com o estado antes/depois.
 */
export function ReasonDialog({
  title,
  description,
  confirmLabel = "Confirmar",
  onConfirm,
  onClose,
}: {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (reason.trim().length < 10) {
      setError("Descreva o motivo com pelo menos 10 caracteres — ele fica registrado na auditoria.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="card w-full max-w-lg space-y-4">
        <h3 className="font-medium">{title}</h3>
        {description && <div className="text-sm text-flux-muted">{description}</div>}

        <div>
          <label className="block text-sm font-medium mb-1.5">Motivo (obrigatório)</label>
          <textarea
            className="input min-h-[90px] resize-y"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: denúncia de fraude confirmada no chamado #1234"
            autoFocus
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary text-sm" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn-primary text-sm flex items-center gap-2" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export { adminFetch } from "@/lib/admin-api";
