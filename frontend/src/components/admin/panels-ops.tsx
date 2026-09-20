"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  useAdminData,
  Loading,
  Failed,
  AdminTable,
} from "./common";
import { StatusBadge } from "@/components/dashboard/ui";

const short = (v: string | null | undefined) => (v ? v.slice(0, 8) : "—");

export function UsersPanel() {
  const [search, setSearch] = useState("");
  const { data, loading, error, reload } = useAdminData<{
    users: { id: string; email: string; full_name: string | null; status: string; status_reason: string | null; created_at: string }[];
  }>(`/users?search=${encodeURIComponent(search)}`);

  async function setStatus(id: string, status: string) {
    const reason = window.prompt("Motivo obrigatório (mínimo 10 caracteres):")?.trim() || "";
    if (reason.length < 10) return;
    await adminFetch(`/users/${id}/status`, { method: "POST", body: { status, reason } });
    reload();
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
                  {u.status !== "active" && <button className="btn-secondary text-xs" onClick={() => setStatus(u.id, "active")}>Reativar</button>}
                  {u.status === "active" && <button className="btn-secondary text-xs" onClick={() => setStatus(u.id, "suspended")}>Suspender</button>}
                  {u.status !== "banned" && <button className="btn-secondary text-xs" onClick={() => setStatus(u.id, "banned")}>Banir</button>}
                  {u.status !== "disabled" && <button className="btn-secondary text-xs" onClick={() => setStatus(u.id, "disabled")}>Desativar</button>}
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
export function PaymentsPanel() {
  const { data, loading, error, reload } = useAdminData<
    { id: string; amount: number; currency: string; status: string; organization_id: string; created_at: string; organizations?: { name: string } | null }[]
  >("/payments");
  return (
    <div className="space-y-4">
      <button className="btn-secondary text-sm" onClick={reload}>Atualizar</button>
      {loading ? <Loading /> : error ? <Failed message={error} /> : (
        <AdminTable headers={["ID", "Conta", "Valor", "Status", "Data"]}>
          {(data || []).map((r) => (
            <tr key={r.id}>
              <td className="px-5 py-3 font-mono text-xs">{short(r.id)}</td>
              <td className="px-5 py-3"><Link href={`/admin/organizations/${r.organization_id}`} className="hover:underline">{r.organizations?.name || short(r.organization_id)}</Link></td>
              <td className="px-5 py-3">{formatCurrency(r.amount, r.currency)}</td>
              <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
              <td className="px-5 py-3 text-flux-muted">{formatDate(r.created_at)}</td>
            </tr>
          ))}
        </AdminTable>
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

export function SettingsPanel({ canConfigure: _c }: { canConfigure: boolean }) {
  return (
    <div className="card text-sm text-flux-muted">
      Configurações de manutenção permanecem em /admin/settings (implementação completa no backend).
    </div>
  );
}
