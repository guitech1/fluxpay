"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
import { ReleaseBalanceButton } from "./ReleaseBalanceButton";

const short = (v: string | null | undefined) => (v ? v.slice(0, 8) : "—");

const ACTIONS: { status: string; label: string; description: string }[] = [
  { status: "suspended", label: "Suspender", description: "Bloqueio temporário: a API para de aceitar cobranças e as ações do painel ficam bloqueadas." },
  { status: "banned", label: "Banir", description: "Bloqueio definitivo, para fraude confirmada." },
  { status: "disabled", label: "Desativar", description: "Encerramento a pedido do próprio lojista." },
  { status: "pending", label: "Voltar para pendente", description: "Conta volta a aguardar liberação." },
  { status: "active", label: "Reativar", description: "A conta volta a operar normalmente." },
];

interface OrgDetail {
  organization: {
    id: string;
    name: string;
    slug: string;
    legal_name?: string | null;
    document?: string | null;
    email: string;
    phone?: string | null;
    website?: string | null;
    country?: string | null;
    timezone?: string | null;
    default_currency?: string | null;
    status: string;
    status_reason: string | null;
    status_changed_at: string | null;
    created_at: string;
    kyc_required?: boolean;
    kyc_status?: string;
    kyc_verified_at?: string | null;
    kyc_document_type?: string | null;
    kyc_document_masked?: string | null;
    kyc_rejection_reason?: string | null;
    public_bio?: string | null;
    public_work?: string | null;
    public_avatar_url?: string | null;
    public_profile_enabled?: boolean | null;
    public_display_name?: string | null;
  };
  environment?: "test" | "live";
  members: {
    id: string;
    role: string;
    created_at: string;
    users?: { id?: string; email: string; full_name?: string | null } | null;
  }[];
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
  api_keys?: {
    id: string;
    name: string;
    key_type: string;
    environment: string;
    key_prefix: string;
    last_used_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }[];
  webhook_endpoints?: {
    id: string;
    url: string;
    events: string[] | null;
    description: string | null;
    enabled: boolean;
    created_at: string;
  }[];
  api_logs?: {
    id: string;
    method: string;
    path: string;
    status_code: number;
    duration_ms: number | null;
    ip_address: string | null;
    created_at: string;
  }[];
  refunds?: {
    id: string;
    payment_id: string;
    amount: number;
    currency: string;
    status: string;
    reason: string | null;
    created_at: string;
  }[];
  disputes?: {
    id: string;
    payment_id: string;
    amount: number;
    currency: string;
    status: string;
    reason: string | null;
    created_at: string;
  }[];
  admin_history: {
    id: string;
    admin_email: string | null;
    action: string;
    reason: string | null;
    created_at: string;
  }[];
}

function kycLabel(status?: string) {
  switch (status) {
    case "verified":
      return "Verificado";
    case "pending":
      return "Pendente";
    case "rejected":
      return "Rejeitado";
    default:
      return "Não iniciado";
  }
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-2 border-b border-flux-border/60 last:border-0">
      <dt className="text-xs uppercase tracking-wider text-flux-muted sm:w-40 shrink-0">{label}</dt>
      <dd className="text-sm break-all font-mono sm:font-sans">{value ?? "—"}</dd>
    </div>
  );
}

export function OrganizationDetailPanel({ id, canAct }: { id: string; canAct: boolean }) {
  const { data, loading, error, reload } = useAdminData<OrgDetail>(`/organizations/${id}`);
  const [action, setAction] = useState<(typeof ACTIONS)[number] | null>(null);
  const [kycBusy, setKycBusy] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) return <Failed message={error} />;
  if (!data) return null;

  const org = data.organization;
  const env = data.environment || "live";

  async function changeStatus(status: string, reason: string) {
    await adminFetch(`/organizations/${id}/status`, {
      method: "POST",
      body: { status, reason },
    });
    reload();
  }

  async function postKyc(body: Record<string, unknown>) {
    setKycBusy(true);
    setKycError(null);
    try {
      await adminFetch(`/organizations/${id}/kyc`, { method: "POST", body });
      reload();
    } catch (err) {
      setKycError(err instanceof Error ? err.message : "Falha ao atualizar KYC.");
    } finally {
      setKycBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <Link
        href="/admin/organizations"
        className="inline-flex items-center gap-1.5 text-sm text-flux-muted hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar para contas
      </Link>

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
            <ReleaseBalanceButton organizationId={id} organizationName={org.name} onDone={reload} />
            {ACTIONS.filter((a) => a.status !== org.status).map((a) => (
              <button key={a.status} className="btn-secondary text-sm" onClick={() => setAction(a)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card space-y-1">
        <h2 className="font-medium mb-3">Identificadores e cadastro</h2>
        <dl>
          <InfoRow label="ID da organização" value={<span className="font-mono text-xs">{org.id}</span>} />
          <InfoRow label="Slug" value={org.slug} />
          <InfoRow label="Nome fantasia" value={org.name} />
          <InfoRow label="Razão social" value={org.legal_name || "—"} />
          <InfoRow label="Documento" value={org.document || "—"} />
          <InfoRow label="E-mail" value={org.email} />
          <InfoRow label="Telefone" value={org.phone || "—"} />
          <InfoRow label="Website" value={org.website || "—"} />
          <InfoRow label="País" value={org.country || "—"} />
          <InfoRow label="Fuso" value={org.timezone || "—"} />
          <InfoRow label="Moeda padrão" value={org.default_currency || "—"} />
          <InfoRow label="Ambiente ADM" value={env} />
          <InfoRow label="Criada em" value={formatDate(org.created_at)} />
        </dl>
      </div>

      <div className="card space-y-1">
        <h2 className="font-medium mb-3">Perfil público</h2>
        <dl>
          <InfoRow
            label="Perfil ativo"
            value={org.public_profile_enabled ? "Sim" : "Não"}
          />
          <InfoRow label="Nome público" value={org.public_display_name || "—"} />
          <InfoRow label="Trabalho" value={org.public_work || "—"} />
          <InfoRow label="Bio" value={org.public_bio || "—"} />
          <InfoRow
            label="Avatar URL"
            value={
              org.public_avatar_url ? (
                <a href={org.public_avatar_url} className="text-flux-red hover:underline break-all" target="_blank" rel="noreferrer">
                  {org.public_avatar_url}
                </a>
              ) : (
                "—"
              )
            }
          />
          <InfoRow
            label="Link público"
            value={
              org.public_profile_enabled && org.slug ? (
                <Link href={`/u/${org.slug}`} className="text-flux-red hover:underline">
                  /u/{org.slug}
                </Link>
              ) : (
                "—"
              )
            }
          />
        </dl>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Verificação de identidade (KYC)</h2>
            <p className="text-sm text-flux-muted mt-1">
              Quando exigido, o lojista não acessa o painel até verificar (PIX R$ 2 ou aprovação
              manual).
            </p>
          </div>
          <span className="text-sm">
            Status: <strong>{kycLabel(org.kyc_status)}</strong>
            {org.kyc_document_masked ? ` · ${org.kyc_document_masked}` : ""}
          </span>
        </div>
        {org.kyc_rejection_reason && (
          <p className="text-sm text-amber-200/90">Motivo: {org.kyc_rejection_reason}</p>
        )}
        {kycError && <p className="text-sm text-red-300">{kycError}</p>}
        {canAct && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={kycBusy}
              onClick={() =>
                postKyc({
                  kyc_required: !org.kyc_required,
                  reason: org.kyc_required
                    ? "Remover exigencia de KYC pela ficha da conta"
                    : "Exigir KYC pela ficha da conta",
                })
              }
            >
              {org.kyc_required ? "Deixar de exigir KYC" : "Exigir KYC"}
            </button>
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={kycBusy || org.kyc_status === "verified"}
              onClick={() =>
                postKyc({ action: "approve", note: "Aprovacao manual pelo ADM" })
              }
            >
              Aprovar KYC
            </button>
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={kycBusy}
              onClick={() => {
                const reason = window.prompt("Motivo da rejeição (mín. 5 caracteres)");
                if (reason && reason.trim().length >= 5) {
                  postKyc({ action: "reject", reason: reason.trim() });
                }
              }}
            >
              Rejeitar
            </button>
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={kycBusy}
              onClick={() => {
                const reason = window.prompt("Motivo para pedir verificação de novo");
                if (reason && reason.trim().length >= 5) {
                  postKyc({ action: "reset", reason: reason.trim() });
                }
              }}
            >
              Pedir de novo
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Object.entries(data.balance_by_currency).length > 0 ? (
          Object.entries(data.balance_by_currency).map(([currency, net]) => (
            <Metric
              key={currency}
              label={`Saldo líquido (${currency}) · ${env}`}
              value={formatCurrency(Number(net), currency)}
              hint="Soma das movimentações do ambiente selecionado no ADM"
            />
          ))
        ) : (
          <Metric
            label={`Saldo líquido · ${env}`}
            value={formatCurrency(0)}
            hint="Sem movimentações neste ambiente"
          />
        )}
        <Metric label="Pagamentos (recentes)" value={String(data.payments.length)} />
        <Metric label="Membros" value={String(data.members.length)} />
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Membros</h2>
        <AdminTable headers={["User ID", "E-mail", "Nome", "Papel", "Membership ID", "Desde"]}>
          {data.members.map((m) => (
            <tr key={m.id}>
              <td className="px-5 py-3 font-mono text-xs text-flux-muted">{m.users?.id || "—"}</td>
              <td className="px-5 py-3">{m.users?.email || "—"}</td>
              <td className="px-5 py-3 text-flux-muted">{m.users?.full_name || "—"}</td>
              <td className="px-5 py-3 capitalize text-flux-muted">{m.role}</td>
              <td className="px-5 py-3 font-mono text-xs text-flux-muted">{m.id}</td>
              <td className="px-5 py-3 text-flux-muted">{formatDate(m.created_at)}</td>
            </tr>
          ))}
        </AdminTable>
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Pagamentos</h2>
        <AdminTable headers={["ID", "Valor", "Taxa", "Método", "Status", "Data"]}>
          {data.payments.map((p) => (
            <tr key={p.id}>
              <td className="px-5 py-3 font-mono text-xs text-flux-muted">{p.id}</td>
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
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Movimentações (ledger)</h2>
        <AdminTable headers={["ID", "Tipo", "Valor", "Líquido", "Descrição", "Data"]}>
          {data.balance_transactions.map((t) => (
            <tr key={t.id}>
              <td className="px-5 py-3 font-mono text-xs text-flux-muted">{short(t.id)}</td>
              <td className="px-5 py-3 capitalize">{t.type}</td>
              <td className="px-5 py-3">{formatCurrency(t.amount, t.currency)}</td>
              <td className="px-5 py-3 text-flux-muted">{formatCurrency(t.net, t.currency)}</td>
              <td className="px-5 py-3 text-flux-muted">{t.description || "—"}</td>
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(t.created_at)}</td>
            </tr>
          ))}
        </AdminTable>
      </div>

      {(data.api_keys?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium">API Keys (prefixos — sem segredo)</h2>
          <AdminTable headers={["ID", "Nome", "Tipo", "Prefixo", "Revogada", "Criada"]}>
            {(data.api_keys || []).map((k) => (
              <tr key={k.id}>
                <td className="px-5 py-3 font-mono text-xs text-flux-muted">{short(k.id)}</td>
                <td className="px-5 py-3">{k.name}</td>
                <td className="px-5 py-3 text-flux-muted">{k.key_type}</td>
                <td className="px-5 py-3 font-mono text-xs">{k.key_prefix}</td>
                <td className="px-5 py-3 text-flux-muted">{k.revoked_at ? formatDate(k.revoked_at) : "—"}</td>
                <td className="px-5 py-3 text-flux-muted">{formatDate(k.created_at)}</td>
              </tr>
            ))}
          </AdminTable>
        </div>
      )}

      {(data.webhook_endpoints?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium">Webhooks</h2>
          <AdminTable headers={["ID", "URL", "Ativo", "Criado"]}>
            {(data.webhook_endpoints || []).map((w) => (
              <tr key={w.id}>
                <td className="px-5 py-3 font-mono text-xs text-flux-muted">{short(w.id)}</td>
                <td className="px-5 py-3 text-xs break-all">{w.url}</td>
                <td className="px-5 py-3">{w.enabled ? "Sim" : "Não"}</td>
                <td className="px-5 py-3 text-flux-muted">{formatDate(w.created_at)}</td>
              </tr>
            ))}
          </AdminTable>
        </div>
      )}

      {(data.refunds?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium">Reembolsos</h2>
          <AdminTable headers={["ID", "Payment", "Valor", "Status", "Data"]}>
            {(data.refunds || []).map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 font-mono text-xs text-flux-muted">{short(r.id)}</td>
                <td className="px-5 py-3 font-mono text-xs text-flux-muted">{short(r.payment_id)}</td>
                <td className="px-5 py-3">{formatCurrency(r.amount, r.currency)}</td>
                <td className="px-5 py-3">{r.status}</td>
                <td className="px-5 py-3 text-flux-muted">{formatDate(r.created_at)}</td>
              </tr>
            ))}
          </AdminTable>
        </div>
      )}

      {(data.disputes?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium">Disputas</h2>
          <AdminTable headers={["ID", "Payment", "Valor", "Status", "Data"]}>
            {(data.disputes || []).map((d) => (
              <tr key={d.id}>
                <td className="px-5 py-3 font-mono text-xs text-flux-muted">{short(d.id)}</td>
                <td className="px-5 py-3 font-mono text-xs text-flux-muted">{short(d.payment_id)}</td>
                <td className="px-5 py-3">{formatCurrency(d.amount, d.currency)}</td>
                <td className="px-5 py-3">{d.status}</td>
                <td className="px-5 py-3 text-flux-muted">{formatDate(d.created_at)}</td>
              </tr>
            ))}
          </AdminTable>
        </div>
      )}

      {(data.admin_history?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium">Histórico administrativo</h2>
          <AdminTable headers={["Ação", "Admin", "Motivo", "Quando"]}>
            {data.admin_history.map((h) => (
              <tr key={h.id}>
                <td className="px-5 py-3 font-mono text-xs">{h.action}</td>
                <td className="px-5 py-3 text-flux-muted">{h.admin_email || "—"}</td>
                <td className="px-5 py-3 text-flux-muted max-w-[240px] truncate">{h.reason || "—"}</td>
                <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(h.created_at)}</td>
              </tr>
            ))}
          </AdminTable>
        </div>
      )}

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
