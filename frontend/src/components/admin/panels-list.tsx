"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCcw, Search, ShieldAlert } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  useAdminData,
  Loading,
  Failed,
  AdminTable,
  Metric,
  AccountStatusBadge,
} from "./common";

interface OverviewData {
  environment: "test" | "live";
  metrics: Record<string, number>;
  maintenance: { enabled: boolean; message: string; scope: string };
  recent_organizations: { id: string; name: string; slug: string; status: string; created_at: string }[];
  recent_admin_actions: {
    id: string;
    admin_email: string | null;
    action: string;
    target_label: string | null;
    reason: string | null;
    created_at: string;
  }[];
}

export function OverviewPanel() {
  const { data, loading, error, reload } = useAdminData<OverviewData>("/overview");

  if (loading) return <Loading />;
  if (error) return <Failed message={error} />;
  if (!data) return null;

  const m = data.metrics || {};

  return (
    <div className="space-y-6">
      {data.maintenance?.enabled && (
        <div className="card border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium text-amber-200">
              Plataforma em manutenção (escopo: {data.maintenance.scope})
            </div>
            <div className="text-amber-200/80 mt-0.5">{data.maintenance.message}</div>
            <Link href="/admin/settings" className="text-flux-red hover:underline text-xs">
              Ir para as configurações
            </Link>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button className="btn-secondary text-sm flex items-center gap-2" onClick={reload}>
          <RefreshCcw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric
          label="Contas"
          value={String(m.organizations ?? 0)}
          hint={`${m.organizations_active ?? 0} ativas · ${m.organizations_blocked ?? 0} bloqueadas`}
        />
        <Metric label="Usuários" value={String(m.users ?? 0)} />
        <Metric
          label="Volume aprovado"
          value={formatCurrency(Number(m.volume_succeeded_cents ?? 0))}
          hint={`${formatCurrency(Number(m.volume_24h_cents ?? 0))} nas últimas 24h`}
        />
        <Metric
          label="Taxas acumuladas"
          value={formatCurrency(Number(m.fees_cents ?? 0))}
          hint="Receita bruta da plataforma"
        />
        <Metric
          label="Pagamentos"
          value={String(m.payments_total ?? 0)}
          hint={`${m.payments_succeeded ?? 0} aprovados · ${m.payments_pending ?? 0} pendentes`}
        />
        <Metric label="Reembolsos" value={String(m.refunds ?? 0)} />
        <Metric
          label="Webhooks com falha"
          value={String(m.webhook_failures ?? 0)}
          hint={`${m.provider_events_unprocessed ?? 0} eventos do adquirente sem processar`}
        />
        <Metric
          label="Erros de API (24h)"
          value={String(m.api_errors_24h ?? 0)}
          hint={`${m.disputes_open ?? 0} disputas abertas`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="font-medium">Contas recentes</h2>
          <AdminTable headers={["Conta", "Status", "Criada em"]}>
            {data.recent_organizations.map((o) => (
              <tr key={o.id} className="hover:bg-flux-gray/40">
                <td className="px-5 py-3">
                  <Link href={`/admin/organizations/${o.id}`} className="hover:underline">
                    {o.name}
                  </Link>
                  <div className="text-xs text-flux-muted">{o.slug}</div>
                </td>
                <td className="px-5 py-3">
                  <AccountStatusBadge status={o.status} />
                </td>
                <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(o.created_at)}</td>
              </tr>
            ))}
          </AdminTable>
        </div>

        <div className="space-y-3">
          <h2 className="font-medium">Últimas ações administrativas</h2>
          <AdminTable headers={["Ação", "Alvo", "Admin", "Quando"]}>
            {data.recent_admin_actions.map((a) => (
              <tr key={a.id} className="hover:bg-flux-gray/40">
                <td className="px-5 py-3 font-mono text-xs">{a.action}</td>
                <td className="px-5 py-3">{a.target_label || "—"}</td>
                <td className="px-5 py-3 text-flux-muted">{a.admin_email || "—"}</td>
                <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(a.created_at)}</td>
              </tr>
            ))}
          </AdminTable>
        </div>
      </div>
    </div>
  );
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  email: string;
  document: string | null;
  status: string;
  status_reason: string | null;
  created_at: string;
}

const STATUS_FILTERS = ["all", "active", "pending", "suspended", "banned", "disabled"];
const STATUS_FILTER_LABELS: Record<string, string> = {
  all: "Todos os status",
  active: "Ativas",
  pending: "Em análise",
  suspended: "Suspensas",
  banned: "Banidas",
  disabled: "Desativadas",
};

export function OrganizationsPanel() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const query = `/organizations?status=${status}&search=${encodeURIComponent(search)}`;
  const { data, loading, error, reload } = useAdminData<OrgRow[]>(query);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-flux-muted" />
          <input
            className="input pl-9"
            placeholder="Buscar por nome, slug, e-mail ou CNPJ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {STATUS_FILTER_LABELS[s] ?? s}
            </option>
          ))}
        </select>
        <button className="btn-secondary text-sm" onClick={reload}>
          Buscar
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <Failed message={error} />
      ) : (
        <AdminTable headers={["Conta", "E-mail", "CNPJ", "Status", "Motivo", "Criada em"]}>
          {(data || []).map((o) => (
            <tr key={o.id} className="hover:bg-flux-gray/40">
              <td className="px-5 py-3">
                <Link href={`/admin/organizations/${o.id}`} className="hover:underline font-medium">
                  {o.name}
                </Link>
                <div className="text-xs text-flux-muted">{o.slug}</div>
              </td>
              <td className="px-5 py-3 text-flux-muted">{o.email}</td>
              <td className="px-5 py-3 text-flux-muted">{o.document || "—"}</td>
              <td className="px-5 py-3">
                <AccountStatusBadge status={o.status} />
              </td>
              <td className="px-5 py-3 text-flux-muted max-w-[240px] truncate">{o.status_reason || "—"}</td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(o.created_at)}</td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
