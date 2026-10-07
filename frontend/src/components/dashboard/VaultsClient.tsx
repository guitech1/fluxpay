"use client";

import { useCallback, useEffect, useState } from "react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { formatCurrency } from "@/lib/utils";
import { Alert, SubmitButton } from "@/components/dashboard/ui-client";

type Vault = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  allocated_cents: number;
};

type BalanceInfo = {
  available_cents: number;
  allocated_cents: number;
  free_cents: number;
  currency: string;
};

export function VaultsClient({ canWrite }: { canWrite: boolean }) {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amountMap, setAmountMap] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await dashboardFetch<{ data: { vaults: Vault[]; balance: BalanceInfo } }>("/vaults");
      setVaults(res.data.vaults);
      setBalance(res.data.balance);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createVault(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    try {
      await dashboardFetch("/vaults", { method: "POST", body: { name } });
      setName("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function move(vaultId: string, direction: "allocate" | "release") {
    if (!canWrite) return;
    const raw = amountMap[vaultId] || "";
    const cents = Math.round(parseFloat(raw.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError("Informe um valor valido.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await dashboardFetch(`/vaults/${vaultId}/${direction}`, {
        method: "POST",
        body: { amount_cents: cents },
      });
      setAmountMap((m) => ({ ...m, [vaultId]: "" }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      {balance && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat label="Saldo disponivel" value={formatCurrency(balance.available_cents)} />
          <Stat label="Em cofres" value={formatCurrency(balance.allocated_cents)} />
          <Stat label="Livre" value={formatCurrency(balance.free_cents)} />
        </div>
      )}

      {canWrite && (
        <form onSubmit={createVault} className="card flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label className="label">Novo cofre</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Impostos, Reserva, Marketing"
              maxLength={80}
              required
            />
          </div>
          <SubmitButton type="submit" loading={busy} disabled={!name.trim()}>
            Criar
          </SubmitButton>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {vaults.map((v) => (
          <div key={v.id} className="card space-y-3">
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: v.color || "#EF4444" }}
              />
              <div className="min-w-0">
                <div className="font-medium truncate">{v.name}</div>
                {v.description && (
                  <div className="text-xs text-flux-muted truncate">{v.description}</div>
                )}
              </div>
              <div className="ml-auto font-semibold whitespace-nowrap">
                {formatCurrency(v.allocated_cents)}
              </div>
            </div>
            {canWrite && (
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="0,00"
                  value={amountMap[v.id] || ""}
                  onChange={(e) =>
                    setAmountMap((m) => ({ ...m, [v.id]: e.target.value }))
                  }
                  inputMode="decimal"
                />
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  disabled={busy}
                  onClick={() => void move(v.id, "allocate")}
                >
                  Alocar
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  disabled={busy}
                  onClick={() => void move(v.id, "release")}
                >
                  Liberar
                </button>
              </div>
            )}
          </div>
        ))}
        {vaults.length === 0 && (
          <p className="text-sm text-flux-muted col-span-full py-8 text-center">
            Nenhum cofre criado neste ambiente.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-[10px] uppercase tracking-wider text-flux-muted">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
