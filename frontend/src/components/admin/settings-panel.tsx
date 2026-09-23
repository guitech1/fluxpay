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

export function SettingsPanel({ canConfigure }: { canConfigure: boolean }) {
  // Backend GET /settings devolve { data: { maintenance: {...} } }, NÃO um array de {key,value}.
  // O .find() anterior assumia array e quebrava com "l.find is not a function" em produção.
  const { data, loading, error, reload } = useAdminData<{
    maintenance?: {
      enabled?: boolean;
      message?: string;
      scope?: string;
      allow_admins?: boolean;
    };
  }>("/settings");
  const maintenance = data?.maintenance;

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
