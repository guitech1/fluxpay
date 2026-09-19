"use client";

import { useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import { formatCurrency } from "@/lib/utils";
import { ReasonDialog } from "./common";

export function ReleaseBalanceButton({
  organizationId,
  organizationName,
  onDone,
}: {
  organizationId: string;
  organizationName: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function release(reason: string) {
    setMsg(null);
    const res = await adminFetch<{
      data: {
        released_count: number;
        released_net: number;
        currency?: string;
        message?: string;
      };
    }>(`/organizations/${organizationId}/balance/release`, {
      method: "POST",
      body: { reason },
    });
    if (res.data.released_count === 0) {
      setMsg(res.data.message || "Nada a liberar neste ambiente.");
    } else {
      setMsg(
        `Liberadas ${res.data.released_count} movimentação(ões). Total líquido: ${formatCurrency(
          res.data.released_net,
          res.data.currency || "BRL"
        )}.`
      );
    }
    onDone?.();
  }

  return (
    <>
      <button type="button" className="btn-secondary text-sm" onClick={() => setOpen(true)}>
        Liberar saldo a liberar
      </button>
      {msg && <p className="text-sm text-emerald-300/90 mt-2 w-full">{msg}</p>}
      {open && (
        <ReasonDialog
          title={`Liberar saldo a liberar — ${organizationName}`}
          description="Antecipa a data de liberação de todas as movimentações ainda bloqueadas neste ambiente. O valor passa a Disponível na carteira do lojista. Exige motivo e fica no histórico administrativo."
          confirmLabel="Liberar agora"
          onConfirm={async (reason) => {
            await release(reason);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
