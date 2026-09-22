"use client";

import { useState } from "react";
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
    email: string;
    status: string;
    status_reason: string | null;
    status_changed_at: string | null;
    created_at: string;
    kyc_required?: boolean;
    kyc_status?: string;
    kyc_verified_at?: string | null;
    kyc_document_masked?: string | null;
    kyc_rejection_reason?: string | null;
  };
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

export function OrganizationDetailPanel({ id, canAct }: { id: string; canAct: boolean }) {
  const { data, loading, error, reload } = useAdminData<OrgDetail>(`/organizations/${id}`);
  const [action, setAction] = useState<(typeof ACTIONS)[number] | null>(null);
  const [kycBusy, setKycBusy] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);

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

      <div className="space-y-3">
        <h2 className="font-medium">Membros</h2>
        <AdminTable headers={["Usuário", "Papel", "Desde"]}>
          {data.members.map((m) => (
            <tr key={m.id}>
              <td className="px-5 py-3">{m.users?.email || "—"}</td>
              <td className="px-5 py-3 capitalize text-flux-muted">{m.role}</td>
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
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Movimentações</h2>
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
      </div>

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
