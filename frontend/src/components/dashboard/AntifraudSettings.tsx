"use client";

import { useEffect, useState } from "react";
import { Shield, Loader2 } from "lucide-react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { friendlyError } from "@/lib/labels";

export type AntifraudRules = {
  /** Conta nova (poucos dias): limite de PIX criados por hora */
  newAccountMaxPixPerHour: { enabled: boolean; max: number; newAccountDays: number };
  /** Pedir confirmação se o CPF/documento já foi negado antes */
  confirmDeniedCpf: { enabled: boolean };
};

const DEFAULTS: AntifraudRules = {
  newAccountMaxPixPerHour: { enabled: true, max: 10, newAccountDays: 7 },
  confirmDeniedCpf: { enabled: true },
};

export function AntifraudSettings({ canWrite }: { canWrite: boolean }) {
  const [rules, setRules] = useState<AntifraudRules>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await dashboardFetch<{ data: AntifraudRules }>("/antifraud/rules");
        if (!cancelled && res?.data) setRules({ ...DEFAULTS, ...res.data });
      } catch {
        /* usa defaults locais */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!canWrite) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await dashboardFetch("/antifraud/rules", { method: "PUT", body: rules });
      setMsg("Regras salvas. Já valem nas próximas cobranças.");
    } catch (e) {
      setErr(friendlyError(e, "Não foi possível salvar as regras."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card flex items-center gap-2 text-flux-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando regras…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-flux-red/10 text-flux-red flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-medium">Motor antifraude</h2>
          <p className="text-sm text-flux-muted mt-1">
            Regras suas, ligue ou desligue sem precisar de programador. A FluxPay aplica antes de
            gerar o PIX.
          </p>
        </div>
      </div>

      <div className="card space-y-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 accent-flux-red"
            checked={rules.newAccountMaxPixPerHour.enabled}
            disabled={!canWrite}
            onChange={(e) =>
              setRules((r) => ({
                ...r,
                newAccountMaxPixPerHour: {
                  ...r.newAccountMaxPixPerHour,
                  enabled: e.target.checked,
                },
              }))
            }
          />
          <span className="min-w-0">
            <span className="font-medium text-sm block">Limite de PIX em conta nova</span>
            <span className="text-sm text-flux-muted block mt-0.5">
              Contas com menos de{" "}
              <input
                type="number"
                min={1}
                max={90}
                className="input inline-block w-16 mx-1 py-0.5 px-2 min-h-0 text-sm"
                disabled={!canWrite || !rules.newAccountMaxPixPerHour.enabled}
                value={rules.newAccountMaxPixPerHour.newAccountDays}
                onChange={(e) =>
                  setRules((r) => ({
                    ...r,
                    newAccountMaxPixPerHour: {
                      ...r.newAccountMaxPixPerHour,
                      newAccountDays: Math.max(1, Number(e.target.value) || 7),
                    },
                  }))
                }
              />{" "}
              dias não podem gerar mais de{" "}
              <input
                type="number"
                min={1}
                max={500}
                className="input inline-block w-16 mx-1 py-0.5 px-2 min-h-0 text-sm"
                disabled={!canWrite || !rules.newAccountMaxPixPerHour.enabled}
                value={rules.newAccountMaxPixPerHour.max}
                onChange={(e) =>
                  setRules((r) => ({
                    ...r,
                    newAccountMaxPixPerHour: {
                      ...r.newAccountMaxPixPerHour,
                      max: Math.max(1, Number(e.target.value) || 10),
                    },
                  }))
                }
              />{" "}
              PIX por hora.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer border-t border-flux-border pt-5">
          <input
            type="checkbox"
            className="mt-1 accent-flux-red"
            checked={rules.confirmDeniedCpf.enabled}
            disabled={!canWrite}
            onChange={(e) =>
              setRules((r) => ({
                ...r,
                confirmDeniedCpf: { enabled: e.target.checked },
              }))
            }
          />
          <span className="min-w-0">
            <span className="font-medium text-sm block">Confirmação se CPF já foi negado</span>
            <span className="text-sm text-flux-muted block mt-0.5">
              Se o documento do pagador já teve cobrança recusada nesta conta, a API exige o campo{" "}
              <code className="font-mono text-xs text-white">confirm_denied_payer: true</code> para
              seguir. Sem isso, a cobrança é bloqueada com aviso claro.
            </span>
          </span>
        </label>

        {err && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
            {err}
          </div>
        )}
        {msg && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-300">
            {msg}
          </div>
        )}

        {canWrite && (
          <div className="flex justify-end">
            <button className="btn-primary text-sm flex items-center gap-2" onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar regras
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
