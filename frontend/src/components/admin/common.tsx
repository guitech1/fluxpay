"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { adminFetch } from "@/lib/admin-api";

export { adminFetch };

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
    <div className="card border-red-500/20 bg-red-500/5 text-sm text-red-300 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
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
      <div className="text-sm text-flux-muted mb-1">{label}</div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="text-xs text-flux-muted mt-1">{hint}</div>}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  pending: "Pendente",
  suspended: "Suspensa",
  banned: "Banida",
  disabled: "Desativada",
};

const STATUS_STYLES: Record<string, string> = {
  active: "badge-success",
  pending: "badge-pending",
  suspended: "badge bg-amber-500/10 text-amber-400",
  banned: "badge-failed",
  disabled: "badge bg-gray-500/10 text-gray-400",
};

export function AccountStatusBadge({ status }: { status: string }) {
  return (
    <span className={STATUS_STYLES[status] || "badge bg-gray-500/10 text-gray-400"}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function ReasonDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 10) {
      setError("Informe um motivo com pelo menos 10 caracteres.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar a ação.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-xl border border-flux-border bg-flux-dark p-5 space-y-4 shadow-xl">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-flux-muted mt-1">{description}</p>
        </div>
        <div>
          <label className="label" htmlFor="admin-reason">
            Motivo
          </label>
          <textarea
            id="admin-reason"
            className="input min-h-[96px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Descreva o motivo (obrigatório)"
            maxLength={500}
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="btn-primary text-sm" onClick={submit} disabled={loading}>
            {loading ? "Salvando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
