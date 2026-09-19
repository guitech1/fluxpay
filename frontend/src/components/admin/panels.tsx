"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { RefreshCcw, Search, ShieldAlert, Power } from "lucide-react";
import { adminFetch } from "@/lib/admin-api";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  useAdminData,
  Loading,
  Failed,
  AdminTable,
  Metric,
  AccountStatusBadge,
  ReasonDialog,
} from "./common";
import { StatusBadge } from "@/components/dashboard/ui";

const short = (v: string | null | undefined) => (v ? v.slice(0, 8) : "—");

// ============================================================
// VISAO GERAL
// ============================================================
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
                <td className="px-5 py-3 text-flux-muted whitespace-nowrap">
                  {formatDate(o.created_at)}
                </td>
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
                <td className="px-5 py-3 text-flux-muted whitespace-nowrap">
                  {formatDate(a.created_at)}
                </td>
              </tr>
            ))}
          </AdminTable>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CONTAS
// ============================================================
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
              {s === "all" ? "Todos os status" : s}
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
              <td className="px-5 py-3 text-flux-muted max-w-[240px] truncate">
                {o.status_reason || "—"}
              </td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">
                {formatDate(o.created_at)}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

// ============================================================
// DETALHE DA CONTA
// ============================================================
interface OrgDetail {
  organization: OrgRow & {
    legal_name: string | null;
    phone: string | null;
    website: string | null;
    default_currency: string | null;
    status_changed_at: string | null;
  };
  environment: string;
  members: { id: string; role: string; created_at: string; users?: { email: string } | null }[];
  payments: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    payment_type: string | null;
    fee_amount: number | null;
    created_at: string;
  }[];
  balance_transactions: {
    id: string;
    type: string;
    amount: number;
    net: number;
    currency: string;
    description: string | null;
    created_at: string;
  }[];
  balance_by_currency: Record<string, number>;
  api_keys: {
    id: string;
    name: string;
    key_type: string;
    key_prefix: string;
    revoked_at: string | null;
    last_used_at: string | null;
  }[];
  webhook_endpoints: { id: string; url: string; enabled: boolean; events: string[] }[];
  api_logs: {
    id: string;
    method: string;
    path: string;
    status_code: number | null;
    created_at: string;
  }[];
  refunds: { id: string; payment_id: string; amount: number; currency: string; status: string; created_at: string }[];
  disputes: { id: string; payment_id: string; amount: number; currency: string; status: string; created_at: string }[];
  admin_history: {
    id: string;
    admin_email: string | null;
    action: string;
    reason: string | null;
    state_before: Record<string, unknown> | null;
    state_after: Record<string, unknown> | null;
    created_at: string;
  }[];
}

const ACTIONS: { status: string; label: string; description: string }[] = [
  { status: "suspended", label: "Suspender", description: "Bloqueio temporário: a API para de aceitar cobranças e as ações do painel ficam bloqueadas. A conta continua vendo o histórico." },
  { status: "banned", label: "Banir", description: "Bloqueio definitivo, para fraude confirmada. Mesmo efeito da suspensão, com intenção permanente." },
  { status: "disabled", label: "Desativar", description: "Encerramento a pedido do próprio lojista." },
  { status: "pending", label: "Voltar para pendente", description: "Conta volta a aguardar liberação." },
  { status: "active", label: "Reativar", description: "A conta volta a operar normalmente, API e painel liberados." },
];

export function OrganizationDetailPanel({ id, canAct }: { id: string; canAct: boolean }) {
  const { data, loading, error, reload } = useAdminData<OrgDetail>(`/organizations/${id}`);
  const [action, setAction] = useState<(typeof ACTIONS)[number] | null>(null);

  if (loading) return <Loading />;
  if (error) return <Failed message={error} />;
  if (!data) return null;

  const org = data.organization;

  async function changeStatus(status: string, reason: string) {
    await adminFetch(`/organizations/${id}/status`, {
      method: "POST",
      body: { status, reason },
    });
    reload();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
            <AccountStatusBadge status={org.status} />
          </div>
          <p className="text-flux-muted mt-1">
            {org.slug} · {org.email} · criada em {formatDate(org.created_at)}
          </p>
          {org.status_reason && (
            <p className="text-sm text-amber-300/90 mt-2">
              Motivo do status atual: {org.status_reason}
              {org.status_changed_at && ` (${formatDate(org.status_changed_at)})`}
            </p>
          )}
        </div>

        {canAct && (
          <div className="flex flex-wrap gap-2">
            {ACTIONS.filter((a) => a.status !== org.status).map((a) => (
              <button key={a.status} className="btn-secondary text-sm" onClick={() => setAction(a)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Object.entries(data.balance_by_currency).length > 0 ? (
          Object.entries(data.balance_by_currency).map(([currency, net]) => (
            <Metric
              key={currency}
              label={`Saldo líquido (${currency})`}
              value={formatCurrency(Number(net), currency)}
              hint="Soma das movimentações do ambiente"
            />
          ))
        ) : (
          <Metric label="Saldo líquido" value={formatCurrency(0)} hint="Sem movimentações" />
        )}
        <Metric label="Pagamentos (recentes)" value={String(data.payments.length)} />
        <Metric label="Membros" value={String(data.members.length)} />
      </div>

      <Section title="Membros">
        <AdminTable headers={["Usuário", "Papel", "Desde"]}>
          {data.members.map((m) => (
            <tr key={m.id}>
              <td className="px-5 py-3">{m.users?.email || "—"}</td>
              <td className="px-5 py-3 capitalize text-flux-muted">{m.role}</td>
              <td className="px-5 py-3 text-flux-muted">{formatDate(m.created_at)}</td>
            </tr>
          ))}
        </AdminTable>
      </Section>

      <Section title="Pagamentos">
        <AdminTable headers={["ID", "Valor", "Taxa", "Método", "Status", "Data"]}>
          {data.payments.map((p) => (
            <tr key={p.id}>
              <td className="px-5 py-3 font-mono text-xs text-flux-muted">{short(p.id)}</td>
              <td className="px-5 py-3">{formatCurrency(p.amount, p.currency)}</td>
              <td className="px-5 py-3 text-flux-muted">
                {p.fee_amount ? formatCurrency(p.fee_amount, p.currency) : "—"}
              </td>
              <td className="px-5 py-3 uppercase text-xs text-flux-muted">{p.payment_type || "—"}</td>
              <td className="px-5 py-3">
                <StatusBadge status={p.status} />
              </td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(p.created_at)}</td>
            </tr>
          ))}
        </AdminTable>
      </Section>

      <Section title="Movimentações">
        <AdminTable headers={["Tipo", "Valor", "Líquido", "Descrição", "Data"]}>
          {data.balance_transactions.map((t) => (
            <tr key={t.id}>
              <td className="px-5 py-3 capitalize">{t.type}</td>
              <td className="px-5 py-3">{formatCurrency(t.amount, t.currency)}</td>
              <td className="px-5 py-3 text-flux-muted">{formatCurrency(t.net, t.currency)}</td>
              <td className="px-5 py-3 text-flux-muted">{t.description || "—"}</td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(t.created_at)}</td>
            </tr>
          ))}
        </AdminTable>
      </Section>

      <Section title="Reembolsos e disputas">
        <AdminTable headers={["Tipo", "ID", "Pagamento", "Valor", "Status", "Data"]}>
          {[
            ...data.refunds.map((r) => ({ ...r, kind: "Reembolso" })),
            ...data.disputes.map((d) => ({ ...d, kind: "Disputa" })),
          ].map((r) => (
            <tr key={`${r.kind}-${r.id}`}>
              <td className="px-5 py-3">{r.kind}</td>
              <td className="px-5 py-3 font-mono text-xs text-flux-muted">{short(r.id)}</td>
              <td className="px-5 py-3 font-mono text-xs text-flux-muted">{short(r.payment_id)}</td>
              <td className="px-5 py-3">{formatCurrency(r.amount, r.currency)}</td>
              <td className="px-5 py-3">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(r.created_at)}</td>
            </tr>
          ))}
        </AdminTable>
      </Section>

      <Section title="Chaves de API e webhooks">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AdminTable headers={["Chave", "Tipo", "Prefixo", "Status"]}>
            {data.api_keys.map((k) => (
              <tr key={k.id}>
                <td className="px-5 py-3">{k.name}</td>
                <td className="px-5 py-3 text-flux-muted">{k.key_type}</td>
                <td className="px-5 py-3 font-mono text-xs text-flux-muted">{k.key_prefix}••••</td>
                <td className="px-5 py-3">
                  {k.revoked_at ? (
                    <span className="badge bg-gray-500/10 text-gray-400">Revogada</span>
                  ) : (
                    <span className="badge-success">Ativa</span>
                  )}
                </td>
              </tr>
            ))}
          </AdminTable>

          <AdminTable headers={["Endpoint", "Eventos", "Status"]}>
            {data.webhook_endpoints.map((w) => (
              <tr key={w.id}>
                <td className="px-5 py-3 font-mono text-xs break-all max-w-[240px]">{w.url}</td>
                <td className="px-5 py-3 text-flux-muted text-xs">{w.events.length}</td>
                <td className="px-5 py-3">
                  {w.enabled ? (
                    <span className="badge-success">Ativo</span>
                  ) : (
                    <span className="badge bg-gray-500/10 text-gray-400">Desativado</span>
                  )}
                </td>
              </tr>
            ))}
          </AdminTable>
        </div>
        <p className="text-xs text-flux-muted mt-2">
          Segredos não são exibidos aqui: o ADM vê que a credencial existe, nunca o valor dela.
        </p>
      </Section>

      <Section title="Logs de API">
        <AdminTable headers={["Método", "Rota", "Status", "Quando"]}>
          {data.api_logs.map((l) => (
            <tr key={l.id}>
              <td className="px-5 py-3 font-mono text-xs">{l.method}</td>
              <td className="px-5 py-3 font-mono text-xs">{l.path}</td>
              <td className="px-5 py-3 font-mono text-xs">{l.status_code ?? "—"}</td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(l.created_at)}</td>
            </tr>
          ))}
        </AdminTable>
      </Section>

      <Section title="Histórico administrativo desta conta">
        <AdminTable headers={["Ação", "Admin", "Motivo", "Antes → depois", "Quando"]}>
          {data.admin_history.map((h) => (
            <tr key={h.id}>
              <td className="px-5 py-3 font-mono text-xs">{h.action}</td>
              <td className="px-5 py-3 text-flux-muted">{h.admin_email || "—"}</td>
              <td className="px-5 py-3 max-w-[260px]">{h.reason || "—"}</td>
              <td className="px-5 py-3 text-xs text-flux-muted">
                {String(h.state_before?.status ?? "—")} → {String(h.state_after?.status ?? "—")}
              </td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(h.created_at)}</td>
            </tr>
          ))}
        </AdminTable>
      </Section>

      {action && (
        <ReasonDialog
          title={`${action.label} — ${org.name}`}
          description={action.description}
          confirmLabel={action.label}
          onConfirm={(reason) => changeStatus(action.status, reason)}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="font-medium">{title}</h2>
      {children}
    </div>
  );
}

// ============================================================
// USUARIOS
// ============================================================
interface UsersData {
  users: { id: string; email: string; full_name: string | null; created_at: string }[];
  memberships: {
    user_id: string;
    role: string;
    organizations?: { id: string; name: string; slug: string; status: string } | null;
  }[];
}

export function UsersPanel() {
  const [search, setSearch] = useState("");
  const { data, loading, error, reload } = useAdminData<UsersData>(
    `/users?search=${encodeURIComponent(search)}`
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-flux-muted" />
          <input
            className="input pl-9"
            placeholder="Buscar por e-mail ou nome"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-secondary text-sm" onClick={reload}>
          Buscar
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <Failed message={error} />
      ) : (
        <AdminTable headers={["Usuário", "Contas", "Criado em"]}>
          {(data?.users || []).map((u) => {
            const orgs = (data?.memberships || []).filter((m) => m.user_id === u.id);
            return (
              <tr key={u.id} className="hover:bg-flux-gray/40">
                <td className="px-5 py-3">
                  <div>{u.full_name || u.email}</div>
                  <div className="text-xs text-flux-muted">{u.email}</div>
                </td>
                <td className="px-5 py-3">
                  {orgs.length === 0 ? (
                    <span className="text-flux-muted">Sem empresa</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {orgs.map((m, i) =>
                        m.organizations ? (
                          <Link
                            key={i}
                            href={`/admin/organizations/${m.organizations.id}`}
                            className="badge bg-flux-gray-light text-flux-muted hover:text-white"
                          >
                            {m.organizations.name} · {m.role}
                          </Link>
                        ) : null
                      )}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3 text-flux-muted whitespace-nowrap">
                  {formatDate(u.created_at)}
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}
    </div>
  );
}

// ============================================================
// PAGAMENTOS (global) + reembolsos e disputas
// ============================================================
interface AdminPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payment_type: string | null;
  provider: string | null;
  provider_txid: string | null;
  fee_amount: number | null;
  created_at: string;
  organization_id: string;
  organizations?: { name: string; slug: string } | null;
}

export function PaymentsPanel() {
  const [tab, setTab] = useState<"payments" | "refunds" | "disputes">("payments");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const path =
    tab === "payments"
      ? `/payments?status=${status}&search=${encodeURIComponent(search)}`
      : `/${tab}`;

  const { data, loading, error, reload } = useAdminData<Record<string, unknown>[]>(path);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-flux-border bg-flux-gray p-0.5">
          {(
            [
              ["payments", "Pagamentos"],
              ["refunds", "Reembolsos"],
              ["disputes", "Disputas"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={
                tab === value
                  ? "px-3 py-1.5 rounded-md text-xs font-medium bg-flux-gray-light text-white"
                  : "px-3 py-1.5 rounded-md text-xs font-medium text-flux-muted hover:text-white"
              }
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "payments" && (
          <>
            <input
              className="input flex-1 min-w-[200px]"
              placeholder="Buscar por txid ou descrição"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              {["all", "succeeded", "pending", "failed", "expired", "refunded", "canceled"].map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "Todos os status" : s}
                </option>
              ))}
            </select>
          </>
        )}

        <button className="btn-secondary text-sm" onClick={reload}>
          Atualizar
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <Failed message={error} />
      ) : (
        <AdminTable
          headers={
            tab === "payments"
              ? ["ID", "Conta", "Valor", "Taxa", "Método", "Status", "Data"]
              : ["ID", "Conta", "Pagamento", "Valor", "Status", "Data"]
          }
        >
          {(data || []).map((row) => {
            const r = row as unknown as AdminPayment & { payment_id?: string };
            return (
              <tr key={r.id} className="hover:bg-flux-gray/40">
                <td className="px-5 py-3 font-mono text-xs text-flux-muted">{short(r.id)}</td>
                <td className="px-5 py-3">
                  <Link href={`/admin/organizations/${r.organization_id}`} className="hover:underline">
                    {r.organizations?.name || short(r.organization_id)}
                  </Link>
                </td>
                {tab === "payments" ? (
                  <>
                    <td className="px-5 py-3">{formatCurrency(r.amount, r.currency)}</td>
                    <td className="px-5 py-3 text-flux-muted">
                      {r.fee_amount ? formatCurrency(r.fee_amount, r.currency) : "—"}
                    </td>
                    <td className="px-5 py-3 uppercase text-xs text-flux-muted">
                      {r.payment_type || "—"}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-5 py-3 font-mono text-xs text-flux-muted">
                      {short(r.payment_id)}
                    </td>
                    <td className="px-5 py-3">{formatCurrency(r.amount, r.currency)}</td>
                  </>
                )}
                <td className="px-5 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-5 py-3 text-flux-muted whitespace-nowrap">
                  {formatDate(r.created_at)}
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}
    </div>
  );
}

// ============================================================
// WEBHOOKS
// ============================================================
interface WebhooksData {
  deliveries: {
    id: string;
    status: string;
    attempt_count: number | null;
    response_status: number | null;
    next_retry_at: string | null;
    created_at: string;
    webhook_events?: { type: string; organization_id: string } | null;
  }[];
  provider_events: {
    id: string;
    provider: string;
    provider_event_id: string;
    event_type: string | null;
    signature_valid: boolean;
    processed_at: string | null;
    processing_error: string | null;
    received_at: string;
    payment_id: string | null;
  }[];
}

export function WebhooksPanel({ canAct }: { canAct: boolean }) {
  const { data, loading, error, reload } = useAdminData<WebhooksData>("/webhooks");
  const [retry, setRetry] = useState<{ kind: "delivery" | "event"; id: string; label: string } | null>(
    null
  );

  if (loading) return <Loading />;
  if (error) return <Failed message={error} />;

  async function confirmRetry(reason: string) {
    if (!retry) return;
    const path =
      retry.kind === "delivery"
        ? `/webhooks/deliveries/${retry.id}/retry`
        : `/webhooks/provider-events/${retry.id}/reprocess`;
    await adminFetch(path, { method: "POST", body: { reason } });
    reload();
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Entregas de saída (FluxPay → lojista)</h2>
          <button className="btn-secondary text-sm" onClick={reload}>
            Atualizar
          </button>
        </div>
        <AdminTable headers={["ID", "Evento", "Tentativas", "Resposta", "Status", "Quando", ""]}>
          {(data?.deliveries || []).map((d) => (
            <tr key={d.id} className="hover:bg-flux-gray/40">
              <td className="px-5 py-3 font-mono text-xs text-flux-muted">{short(d.id)}</td>
              <td className="px-5 py-3 font-mono text-xs">{d.webhook_events?.type || "—"}</td>
              <td className="px-5 py-3 text-flux-muted">{d.attempt_count ?? 0}</td>
              <td className="px-5 py-3 text-flux-muted">{d.response_status ?? "—"}</td>
              <td className="px-5 py-3">
                <span
                  className={
                    d.status === "success"
                      ? "badge-success"
                      : d.status === "failed"
                        ? "badge-failed"
                        : "badge-pending"
                  }
                >
                  {d.status}
                </span>
              </td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(d.created_at)}</td>
              <td className="px-5 py-3 text-right">
                {canAct && d.status !== "success" ? (
                  <button
                    className="text-xs text-flux-muted hover:text-white underline underline-offset-2"
                    onClick={() =>
                      setRetry({ kind: "delivery", id: d.id, label: d.webhook_events?.type || d.id })
                    }
                  >
                    Reenviar
                  </button>
                ) : (
                  <span className="text-flux-muted text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Eventos recebidos do adquirente (NexusPag → FluxPay)</h2>
        <AdminTable
          headers={["txid / evento", "Tipo", "Assinatura", "Processado", "Erro", "Recebido", ""]}
        >
          {(data?.provider_events || []).map((e) => (
            <tr key={e.id} className="hover:bg-flux-gray/40">
              <td className="px-5 py-3 font-mono text-xs">{e.provider_event_id}</td>
              <td className="px-5 py-3 text-flux-muted text-xs">{e.event_type || "—"}</td>
              <td className="px-5 py-3">
                {e.signature_valid ? (
                  <span className="badge-success">Válida</span>
                ) : (
                  <span className="badge-failed">Inválida</span>
                )}
              </td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">
                {e.processed_at ? formatDate(e.processed_at) : "—"}
              </td>
              <td className="px-5 py-3 text-amber-300/80 max-w-[220px] truncate">
                {e.processing_error || "—"}
              </td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">
                {formatDate(e.received_at)}
              </td>
              <td className="px-5 py-3 text-right">
                {canAct && e.signature_valid && !e.payment_id ? (
                  <button
                    className="text-xs text-flux-muted hover:text-white underline underline-offset-2"
                    onClick={() =>
                      setRetry({ kind: "event", id: e.id, label: e.provider_event_id })
                    }
                  >
                    Reprocessar
                  </button>
                ) : (
                  <span className="text-flux-muted text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
        <p className="text-xs text-flux-muted">
          O reprocessamento só é aceito quando é comprovadamente seguro: assinatura validada na
          chegada, evento <code>payment.confirmed</code> com status <code>paid</code>, pagamento
          existente e ainda não confirmado. Fora disso o backend recusa, em vez de arriscar creditar
          o mesmo PIX duas vezes.
        </p>
      </div>

      {retry && (
        <ReasonDialog
          title={retry.kind === "delivery" ? "Reenviar webhook" : "Reprocessar evento do adquirente"}
          description={
            retry.kind === "delivery"
              ? `O lojista receberá o evento "${retry.label}" novamente. Consumidores de webhook precisam tratar repetição, então isso é seguro.`
              : `O evento ${retry.label} será processado de novo e pode confirmar um pagamento. Só prossiga se a conferência mostrar que o PIX foi realmente pago.`
          }
          confirmLabel={retry.kind === "delivery" ? "Reenviar" : "Reprocessar"}
          onConfirm={confirmRetry}
          onClose={() => setRetry(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// SEGURANCA
// ============================================================
interface SecurityData {
  server_errors: { id: string; method: string; path: string; status_code: number; ip_address: string | null; created_at: string }[];
  auth_failures: { id: string; method: string; path: string; status_code: number; ip_address: string | null; created_at: string }[];
  invalid_signatures: { id: string; provider: string; provider_event_id: string; received_at: string }[];
  admins: { user_id: string; role: string; note: string | null; created_at: string; users?: { email: string } | null }[];
}

export function SecurityPanel() {
  const { data, loading, error, reload } = useAdminData<SecurityData>("/security");

  if (loading) return <Loading />;
  if (error) return <Failed message={error} />;

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button className="btn-secondary text-sm" onClick={reload}>
          Atualizar
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Equipe com acesso ao ADM</h2>
        <AdminTable headers={["E-mail", "Papel", "Observação", "Desde"]}>
          {(data?.admins || []).map((a) => (
            <tr key={a.user_id}>
              <td className="px-5 py-3">{a.users?.email || short(a.user_id)}</td>
              <td className="px-5 py-3 capitalize text-flux-muted">{a.role}</td>
              <td className="px-5 py-3 text-flux-muted">{a.note || "—"}</td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(a.created_at)}</td>
            </tr>
          ))}
        </AdminTable>
        <p className="text-xs text-flux-muted">
          Administradores são cadastrados direto no banco (tabela <code>platform_admins</code>).
          Não há promoção pela interface de propósito: ninguém vira admin da plataforma sem alguém
          com acesso ao banco decidir isso.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Falhas de autenticação e permissão (401/403)</h2>
        <AdminTable headers={["Rota", "Status", "IP", "Quando"]}>
          {(data?.auth_failures || []).map((l) => (
            <tr key={l.id}>
              <td className="px-5 py-3 font-mono text-xs">
                {l.method} {l.path}
              </td>
              <td className="px-5 py-3 font-mono text-xs text-amber-400">{l.status_code}</td>
              <td className="px-5 py-3 text-flux-muted">{l.ip_address || "—"}</td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(l.created_at)}</td>
            </tr>
          ))}
        </AdminTable>
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Erros de servidor (5xx)</h2>
        <AdminTable headers={["Rota", "Status", "IP", "Quando"]}>
          {(data?.server_errors || []).map((l) => (
            <tr key={l.id}>
              <td className="px-5 py-3 font-mono text-xs">
                {l.method} {l.path}
              </td>
              <td className="px-5 py-3 font-mono text-xs text-red-400">{l.status_code}</td>
              <td className="px-5 py-3 text-flux-muted">{l.ip_address || "—"}</td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(l.created_at)}</td>
            </tr>
          ))}
        </AdminTable>
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Webhooks recebidos com assinatura inválida</h2>
        <AdminTable headers={["Provedor", "Evento", "Quando"]}>
          {(data?.invalid_signatures || []).map((e) => (
            <tr key={e.id}>
              <td className="px-5 py-3">{e.provider}</td>
              <td className="px-5 py-3 font-mono text-xs">{e.provider_event_id}</td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(e.received_at)}</td>
            </tr>
          ))}
        </AdminTable>
      </div>
    </div>
  );
}

// ============================================================
// AUDITORIA
// ============================================================
interface AuditRow {
  id: string;
  admin_email: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  target_label: string | null;
  reason: string | null;
  state_before: Record<string, unknown> | null;
  state_after: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export function AuditPanel() {
  const [action, setAction] = useState("all");
  const { data, loading, error, reload } = useAdminData<AuditRow[]>(`/audit?action=${action}`);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select className="input w-auto" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="all">Todas as ações</option>
          <option value="organization">Contas</option>
          <option value="webhook">Webhooks</option>
          <option value="platform">Plataforma</option>
        </select>
        <button className="btn-secondary text-sm" onClick={reload}>
          Atualizar
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <Failed message={error} />
      ) : (
        <AdminTable headers={["Quando", "Admin", "Ação", "Alvo", "Motivo", "IP", ""]}>
          {(data || []).map((row) => (
            <Fragment key={row.id}>
              <tr className="hover:bg-flux-gray/40">
                <td className="px-5 py-3 text-flux-muted whitespace-nowrap">
                  {formatDate(row.created_at)}
                </td>
                <td className="px-5 py-3">{row.admin_email || "—"}</td>
                <td className="px-5 py-3 font-mono text-xs">{row.action}</td>
                <td className="px-5 py-3">
                  {row.target_label || row.target_id || row.target_type}
                  <div className="text-xs text-flux-muted">{row.target_type}</div>
                </td>
                <td className="px-5 py-3 max-w-[260px]">{row.reason || "—"}</td>
                <td className="px-5 py-3 text-flux-muted">{row.ip_address || "—"}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    className="text-xs text-flux-muted hover:text-white underline underline-offset-2"
                    onClick={() => setOpen(open === row.id ? null : row.id)}
                  >
                    {open === row.id ? "Fechar" : "Detalhes"}
                  </button>
                </td>
              </tr>
              {open === row.id && (
                <tr className="bg-flux-gray/20">
                  <td colSpan={7} className="px-5 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                      <div>
                        <div className="text-flux-muted mb-1">Antes</div>
                        <pre className="whitespace-pre-wrap break-all">
                          {JSON.stringify(row.state_before ?? {}, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div className="text-flux-muted mb-1">Depois</div>
                        <pre className="whitespace-pre-wrap break-all">
                          {JSON.stringify(row.state_after ?? {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

// ============================================================
// CONFIGURACOES DA PLATAFORMA / MANUTENCAO
// ============================================================
interface SettingRow {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

export function SettingsPanel({ canConfigure }: { canConfigure: boolean }) {
  const { data, loading, error, reload } = useAdminData<SettingRow[]>("/settings");
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState<"all" | "api" | "dashboard">("all");
  const [allowAdmins, setAllowAdmins] = useState(true);
  const [confirming, setConfirming] = useState<"enable" | "disable" | null>(null);
  const [touched, setTouched] = useState(false);

  if (loading) return <Loading />;
  if (error) return <Failed message={error} />;

  const maintenance = (data || []).find((s) => s.key === "maintenance")?.value as
    | { enabled: boolean; message: string; allow_admins: boolean; scope: "all" | "api" | "dashboard" }
    | undefined;

  const current = {
    enabled: Boolean(maintenance?.enabled),
    message: maintenance?.message || "",
    allow_admins: maintenance?.allow_admins ?? true,
    scope: maintenance?.scope || "all",
  };

  // Primeira renderizacao: espelha o que esta salvo.
  if (!touched && (message !== current.message || scope !== current.scope)) {
    setMessage(current.message);
    setScope(current.scope);
    setAllowAdmins(current.allow_admins);
    setTouched(true);
  }

  async function apply(enabled: boolean, reason: string) {
    await adminFetch("/settings/maintenance", {
      method: "PUT",
      body: { enabled, message, allow_admins: allowAdmins, scope, reason },
    });
    reload();
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-medium flex items-center gap-2">
              <Power className="w-4 h-4" />
              Modo manutenção
            </h2>
            <p className="text-sm text-flux-muted mt-1">
              Com a manutenção ligada, a API e o painel dos lojistas respondem 503 com a mensagem
              abaixo. O ADM continua acessível (senão não haveria como desligar), e o webhook de
              entrada da NexusPag continua sendo aceito — recusá-lo faria o adquirente gastar
              tentativas e, no limite, perder a confirmação de um PIX já pago.
            </p>
          </div>
          <span className={current.enabled ? "badge-failed" : "badge-success"}>
            {current.enabled ? "Em manutenção" : "Operando"}
          </span>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Mensagem exibida</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={message}
            disabled={!canConfigure}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Escopo</label>
            <select
              className="input"
              value={scope}
              disabled={!canConfigure}
              onChange={(e) => setScope(e.target.value as "all" | "api" | "dashboard")}
            >
              <option value="all">Tudo (API + painel)</option>
              <option value="api">Somente a API (/v1/*)</option>
              <option value="dashboard">Somente o painel do lojista</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-flux-muted">
              <input
                type="checkbox"
                className="accent-flux-red"
                checked={allowAdmins}
                disabled={!canConfigure}
                onChange={(e) => setAllowAdmins(e.target.checked)}
              />
              Manter o ADM acessível durante a manutenção
            </label>
          </div>
        </div>

        {canConfigure ? (
          <div className="flex gap-2">
            {current.enabled ? (
              <button className="btn-primary text-sm" onClick={() => setConfirming("disable")}>
                Tirar da manutenção
              </button>
            ) : (
              <button className="btn-primary text-sm" onClick={() => setConfirming("enable")}>
                Colocar em manutenção
              </button>
            )}
            {current.enabled && (
              <button className="btn-secondary text-sm" onClick={() => setConfirming("enable")}>
                Salvar mensagem/escopo
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-flux-muted">
            Somente superadmin altera as configurações globais.
          </p>
        )}
      </div>

      <div className="card">
        <h2 className="font-medium mb-3">Outras configurações</h2>
        <div className="space-y-3 text-sm">
          {(data || [])
            .filter((s) => s.key !== "maintenance")
            .map((s) => (
              <div key={s.key}>
                <div className="text-flux-muted mb-1">
                  {s.key} · atualizado em {formatDate(s.updated_at)}
                </div>
                <pre className="font-mono text-xs bg-flux-gray border border-flux-border rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(s.value, null, 2)}
                </pre>
              </div>
            ))}
        </div>
      </div>

      {confirming && (
        <ReasonDialog
          title={confirming === "enable" ? "Colocar a plataforma em manutenção" : "Tirar da manutenção"}
          description={
            confirming === "enable"
              ? "Cobranças novas e ações do painel param imediatamente para todos os lojistas do escopo escolhido."
              : "A API e o painel voltam a operar normalmente."
          }
          confirmLabel={confirming === "enable" ? "Ativar manutenção" : "Desativar"}
          onConfirm={(reason) => apply(confirming === "enable", reason)}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
