"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Loader2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  useAdminData,
  Loading,
  Failed,
  AdminTable,
} from "./common";
import { StatusBadge } from "@/components/dashboard/ui";
import { AccountStatusBadge, ReasonDialog, adminFetch } from "./common";

const short = (v: string | null | undefined) => (v ? v.slice(0, 8) : "—");

function ReasonDialogTrigger({
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        className="btn-secondary text-sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {confirmLabel}
      </button>
    );
  }
  return (
    <ReasonDialog
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      onClose={() => setOpen(false)}
      onConfirm={onConfirm}
    />
  );
}

export function UsersPanel({ canAct }: { canAct: boolean }) {
  const [search, setSearch] = useState("");
  const [pendingAction, setPendingAction] = useState<{ id: string; status: string; label: string } | null>(null);
  const { data, loading, error, reload } = useAdminData<{
    users: { id: string; email: string; full_name: string | null; status: string; status_reason: string | null; created_at: string }[];
  }>(`/users?search=${encodeURIComponent(search)}`);

  async function setStatus(id: string, status: string, reason: string) {
    await adminFetch(`/users/${id}/status`, { method: "POST", body: { status, reason } });
    await reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-flux-muted" />
          <input className="input pl-9" placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn-secondary text-sm" onClick={reload}>Buscar</button>
      </div>
      {loading ? <Loading /> : error ? <Failed message={error} /> : (
        <AdminTable headers={["Usuário", "Status", "Criado em", "Ações"]}>
          {(data?.users || []).map((u) => (
            <tr key={u.id}>
              <td className="px-5 py-3">{u.full_name || u.email}<div className="text-xs text-flux-muted">{u.email}</div></td>
              <td className="px-5 py-3"><AccountStatusBadge status={u.status} /></td>
              <td className="px-5 py-3 text-flux-muted">{formatDate(u.created_at)}</td>
              <td className="px-5 py-3">
                <div className="flex flex-wrap gap-1">
                  {canAct && u.status !== "active" && <button className="btn-secondary text-xs" onClick={() => setPendingAction({ id: u.id, status: "active", label: "Reativar usuário" })}>Reativar</button>}
                  {canAct && u.status === "active" && <button className="btn-secondary text-xs" onClick={() => setPendingAction({ id: u.id, status: "suspended", label: "Suspender usuário" })}>Suspender</button>}
                  {canAct && u.status !== "banned" && <button className="btn-secondary text-xs" onClick={() => setPendingAction({ id: u.id, status: "banned", label: "Banir usuário" })}>Banir</button>}
                  {canAct && u.status !== "disabled" && <button className="btn-secondary text-xs" onClick={() => setPendingAction({ id: u.id, status: "disabled", label: "Desativar usuário" })}>Desativar</button>}
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
      {pendingAction && (
        <ReasonDialog
          title={pendingAction.label}
          description="Essa alteração afeta o acesso operacional do usuário e ficará registrada na auditoria."
          confirmLabel={pendingAction.label}
          onClose={() => setPendingAction(null)}
          onConfirm={(reason) => setStatus(pendingAction.id, pendingAction.status, reason)}
        />
      )}
    </div>
  );
}
export function PaymentsPanel({ canAct }: { canAct: boolean }) {
  const { data, loading, error, reload } = useAdminData<
    { id: string; amount: number; currency: string; status: string; organization_id: string; created_at: string; organizations?: { name: string } | null }[]
  >("/payments");
  const [pendingPayment, setPendingPayment] = useState<string | null>(null);

  async function release(id: string, reason: string) {
    await adminFetch(`/payments/${id}/release`, { method: "POST", body: { reason } });
    await reload();
  }

  return (
    <div className="space-y-4">
      <button className="btn-secondary text-sm" onClick={reload}>Atualizar</button>
      {loading ? <Loading /> : error ? <Failed message={error} /> : (
        <AdminTable headers={["ID", "Conta", "Valor", "Status", "Data", "Ações"]}>
          {(data || []).map((r) => (
            <tr key={r.id}>
              <td className="px-5 py-3 font-mono text-xs">{short(r.id)}</td>
              <td className="px-5 py-3"><Link href={`/admin/organizations/${r.organization_id}`} className="hover:underline">{r.organizations?.name || short(r.organization_id)}</Link></td>
              <td className="px-5 py-3">{formatCurrency(r.amount, r.currency)}</td>
              <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
              <td className="px-5 py-3 text-flux-muted">{formatDate(r.created_at)}</td>
              <td className="px-5 py-3">
                {canAct && r.status === "succeeded" && (
                  <button className="btn-secondary text-xs" onClick={() => setPendingPayment(r.id)}>
                    Liberar saldo
                  </button>
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
      {pendingPayment && (
        <ReasonDialog
          title="Liberar saldo"
          description="A ação antecipa apenas a disponibilidade do saldo de um pagamento já confirmado. O status e os valores do pagamento não serão alterados."
          confirmLabel="Liberar saldo"
          onClose={() => setPendingPayment(null)}
          onConfirm={(reason) => release(pendingPayment, reason)}
        />
      )}
    </div>
  );
}

export function WebhooksPanel({ canAct: _canAct }: { canAct: boolean }) {
  const { data, loading, error, reload } = useAdminData<{ deliveries: unknown[]; provider_events: unknown[] }>("/webhooks");
  if (loading) return <Loading />;
  if (error) return <Failed message={error} />;
  return (
    <div className="space-y-4">
      <button className="btn-secondary text-sm" onClick={reload}>Atualizar</button>
      <p className="text-sm text-flux-muted">Entregas: {(data?.deliveries || []).length} · Eventos adquirente: {(data?.provider_events || []).length}</p>
    </div>
  );
}

export function SecurityPanel() {
  const { data, loading, error } = useAdminData<{ admins: { user_id: string; role: string; users?: { email: string } | null }[] }>("/security");
  if (loading) return <Loading />;
  if (error) return <Failed message={error} />;
  return (
    <AdminTable headers={["E-mail", "Papel"]}>
      {(data?.admins || []).map((a) => (
        <tr key={a.user_id}>
          <td className="px-5 py-3">{a.users?.email || short(a.user_id)}</td>
          <td className="px-5 py-3">{a.role}</td>
        </tr>
      ))}
    </AdminTable>
  );
}

export function AuditPanel() {
  const { data, loading, error, reload } = useAdminData<{ id: string; action: string; admin_email: string | null; created_at: string; reason: string | null }[]>("/audit");
  return (
    <div className="space-y-4">
      <button className="btn-secondary text-sm" onClick={reload}>Atualizar</button>
      {loading ? <Loading /> : error ? <Failed message={error} /> : (
        <AdminTable headers={["Quando", "Admin", "Ação", "Motivo"]}>
          {(data || []).map((row) => (
            <tr key={row.id}>
              <td className="px-5 py-3 text-flux-muted">{formatDate(row.created_at)}</td>
              <td className="px-5 py-3">{row.admin_email || "—"}</td>
              <td className="px-5 py-3 font-mono text-xs">{row.action}</td>
              <td className="px-5 py-3">{row.reason || "—"}</td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

export function SettingsPanel({ canConfigure }: { canConfigure: boolean }) {
  const { data, loading, error, reload } = useAdminData<{ key: string; value: any }[]>("/settings");
  const maintenance = data?.find((x) => x.key === "maintenance")?.value;

  const [saving, setSaving] = useState(false);

  async function save(enabled: boolean, reason: string) {
    if (!canConfigure) return;
    setSaving(true);
    try {
      await adminFetch("/settings/maintenance", {
        method: "PUT",
        body: {
          enabled,
          message: maintenance?.message || "A FluxPay está em manutenção. Voltamos em instantes.",
          allow_admins: maintenance?.allow_admins ?? true,
          scope: maintenance?.scope || "all",
          reason,
        },
      });
      await reload();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <Failed message={error} />;
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-medium">Modo de manutenção</div>
          <div className="text-sm text-flux-muted mt-1">
            Estado persistido em platform_settings e aplicado pelo backend e middleware do Next.
          </div>
        </div>
        {canConfigure ? (
          <ReasonDialogTrigger
            title={maintenance?.enabled ? "Desligar manutenção" : "Ligar manutenção"}
            description="A alteração é global e ficará registrada na auditoria."
            confirmLabel={maintenance?.enabled ? "Desligar" : "Ligar"}
            onConfirm={(reason) => save(!maintenance?.enabled, reason)}
            disabled={saving}
          />
        ) : (
          <button className="btn-secondary text-sm" disabled>
            Apenas superadmin
          </button>
        )}
      </div>
      <div className="card text-sm">
        Estado atual: <strong>{maintenance?.enabled ? "ATIVA" : "INATIVA"}</strong>
        <span className="text-flux-muted"> · escopo: {maintenance?.scope || "all"} · admins liberados: {maintenance?.allow_admins ? "sim" : "não"}</span>
      </div>
    </div>
  );
}
