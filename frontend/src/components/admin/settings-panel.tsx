"use client";

import { useState } from "react";
import {
  useAdminData,
  Loading,
  Failed,
} from "./common";
import { ReasonDialog, adminFetch } from "./common";

function ReasonDialogTrigger({
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled,
  danger,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void>;
  disabled?: boolean;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        className={danger ? "btn-primary text-sm bg-red-600 hover:bg-red-500" : "btn-secondary text-sm"}
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

type SettingsPayload = {
  maintenance?: {
    enabled?: boolean;
    message?: string;
    scope?: string;
    allow_admins?: boolean;
  };
  stop_withdrawals?: {
    enabled?: boolean;
    message?: string;
    updated_at?: string | null;
  };
};

export function SettingsPanel({ canConfigure }: { canConfigure: boolean }) {
  const { data, loading, error, reload } = useAdminData<SettingsPayload>("/settings");
  const maintenance = data?.maintenance;
  const stopWd = data?.stop_withdrawals;

  const [savingMaint, setSavingMaint] = useState(false);
  const [savingStop, setSavingStop] = useState(false);

  async function saveMaintenance(enabled: boolean, reason: string) {
    if (!canConfigure) return;
    setSavingMaint(true);
    try {
      await adminFetch("/settings/maintenance", {
        method: "PUT",
        body: {
          enabled,
          message:
            maintenance?.message ||
            "A FluxPay está em manutenção. Voltamos em instantes.",
          allow_admins: maintenance?.allow_admins ?? true,
          scope: maintenance?.scope || "all",
          reason,
        },
      });
      await reload();
    } finally {
      setSavingMaint(false);
    }
  }

  async function saveStopWithdrawals(enabled: boolean, reason: string) {
    setSavingStop(true);
    try {
      await adminFetch("/settings/stop-withdrawals", {
        method: "PUT",
        body: {
          enabled,
          message: stopWd?.message || "transações em manutenção, aguarde.",
          reason,
        },
      });
      await reload();
    } finally {
      setSavingStop(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <Failed message={error} />;

  return (
    <div className="space-y-4">
      {/* Manutenção global do site */}
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-medium">Modo de manutenção</div>
          <div className="text-sm text-flux-muted mt-1">
            Bloqueia API e/ou dashboard conforme o escopo. Persistido em platform_settings.
          </div>
        </div>
        {canConfigure ? (
          <ReasonDialogTrigger
            title={maintenance?.enabled ? "Desligar manutenção" : "Ligar manutenção"}
            description="A alteração é global e ficará registrada na auditoria."
            confirmLabel={maintenance?.enabled ? "Desligar" : "Ligar"}
            onConfirm={(reason) => saveMaintenance(!maintenance?.enabled, reason)}
            disabled={savingMaint}
          />
        ) : (
          <button className="btn-secondary text-sm" disabled>
            Apenas superadmin
          </button>
        )}
      </div>
      <div className="card text-sm">
        Estado atual: <strong>{maintenance?.enabled ? "ATIVA" : "INATIVA"}</strong>
        <span className="text-flux-muted">
          {" "}· escopo: {maintenance?.scope || "all"} · admins liberados:{" "}
          {maintenance?.allow_admins ? "sim" : "não"}
        </span>
      </div>

      {/* Parar TODOS os saques */}
      <div className="card flex flex-wrap items-center justify-between gap-4 border-amber-500/20">
        <div>
          <div className="font-medium">Parar todos os saques</div>
          <div className="text-sm text-flux-muted mt-1">
            Bloqueia saque da carteira principal, subcontas Smoke e PIX/transferência da carteira
            digital. Quem tentar recebe: «transações em manutenção, aguarde.»
          </div>
        </div>
        <ReasonDialogTrigger
          title={stopWd?.enabled ? "Liberar saques de novo" : "Parar todos os saques"}
          description={
            stopWd?.enabled
              ? "Saques e PIX out voltam a funcionar imediatamente."
              : "Nenhuma conta consegue sacar até você desligar. Fica registrado na auditoria."
          }
          confirmLabel={stopWd?.enabled ? "Liberar saques" : "Parar saques"}
          onConfirm={(reason) => saveStopWithdrawals(!stopWd?.enabled, reason)}
          disabled={savingStop}
          danger={!stopWd?.enabled}
        />
      </div>
      <div className="card text-sm">
        Saques:{" "}
        <strong className={stopWd?.enabled ? "text-amber-400" : ""}>
          {stopWd?.enabled ? "BLOQUEADOS" : "LIBERADOS"}
        </strong>
        {stopWd?.updated_at && (
          <span className="text-flux-muted">
            {" "}· atualizado em {new Date(stopWd.updated_at).toLocaleString("pt-BR")}
          </span>
        )}
      </div>
    </div>
  );
}
