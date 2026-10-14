"use client";

import { useState } from "react";
import { useAdminData, Loading, Failed, adminFetch } from "./common";

type AcquirerRow = {
  id: string;
  displayName: string;
  enabled: boolean;
  adminEnabled?: boolean;
  credentialEnv?: string | null;
  priority: number;
  environment: "test" | "live";
  costPercent: number;
  costFixedCents: number;
  minAmountCents: number;
  maxAmountCents: number;
  configured: boolean;
  healthStatus: string;
};

type FeeRule = {
  id?: string;
  mode: string;
  fluxpay_margin_percent?: number;
  fluxpay_fixed_cents?: number;
  custom_total_percent?: number | null;
  custom_total_fixed_cents?: number | null;
  active?: boolean;
  notes?: string | null;
};

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AcquirersPanel({ canConfigure }: { canConfigure: boolean }) {
  const { data, loading, error, reload } = useAdminData<AcquirerRow[]>("/acquirers");
  const rows = Array.isArray(data) ? data : [];
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function health(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      const res = await adminFetch<{ data: { status: string; latencyMs?: number; message?: string } }>(
        `/acquirers/${id}/health`,
        { method: "POST" }
      );
      setMsg(`${id}: ${res.data.status}${res.data.latencyMs != null ? ` (${res.data.latencyMs}ms)` : ""}${res.data.message ? ` — ${res.data.message}` : ""}`);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha no health check");
    } finally {
      setBusy(null);
    }
  }

  async function save(row: AcquirerRow, patch: Partial<AcquirerRow>) {
    if (!canConfigure || row.id === "sandbox") return;
    setBusy(row.id);
    setMsg(null);
    try {
      await adminFetch(`/acquirers/${row.id}`, {
        method: "PATCH",
        body: {
          costPercent: patch.costPercent ?? row.costPercent,
          costFixedCents: patch.costFixedCents ?? row.costFixedCents,
          enabled: patch.enabled ?? row.adminEnabled ?? row.enabled,
          priority: patch.priority ?? row.priority,
        },
      });
      await reload();
      setMsg(`Adquirente ${row.displayName} atualizado.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Loading />;
  if (error) return <Failed message={error} />;

  return (
    <div className="space-y-4">
      <div className="card text-sm text-flux-muted">
        Chaves vêm das variáveis de ambiente na Netlify (NEXUSPAG_API_KEY, PROFANUSPAY_API_KEY, etc.).
        Sem a chave, o adquirente aparece como não configurado e não pode ficar activo em produção.
        Prioridade menor = tenta primeiro no failover.
      </div>
      {msg && <div className="card text-sm">{msg}</div>}
      <div className="overflow-x-auto card p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-flux-border text-left text-flux-muted">
              <th className="p-3">Adquirente</th>
              <th className="p-3">Configurado</th>
              <th className="p-3">Ativo</th>
              <th className="p-3">Prioridade</th>
              <th className="p-3">Custo %</th>
              <th className="p-3">Custo fixo</th>
              <th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-flux-border/60">
                <td className="p-3">
                  <div className="font-medium">{row.displayName}</div>
                  <div className="text-xs text-flux-muted">{row.id} · {row.environment}</div>
                </td>
                <td className="p-3">
                  {row.configured
                    ? "sim"
                    : row.credentialEnv
                      ? `não (${row.credentialEnv})`
                      : "não"}
                </td>
                <td className="p-3">
                  {row.id === "sandbox" ? (
                    "sempre"
                  ) : canConfigure ? (
                    <input
                      type="checkbox"
                      checked={row.adminEnabled ?? row.enabled}
                      disabled={busy === row.id}
                      onChange={(e) => save(row, { enabled: e.target.checked })}
                    />
                  ) : (
                    row.enabled ? "sim" : "não"
                  )}
                </td>
                <td className="p-3">
                  {canConfigure && row.id !== "sandbox" ? (
                    <input
                      type="number"
                      className="input w-20"
                      defaultValue={row.priority}
                      disabled={busy === row.id}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== row.priority) save(row, { priority: v });
                      }}
                    />
                  ) : (
                    row.priority
                  )}
                </td>
                <td className="p-3">
                  {canConfigure && row.id !== "sandbox" ? (
                    <input
                      type="number"\tableofcontents step="0.01"
                      className="input w-24"
                      defaultValue={row.costPercent}
                      disabled={busy === row.id}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== row.costPercent) save(row, { costPercent: v });
                      }}
                    />
                  ) : (
                    `${row.costPercent}%`
                  )}
                </td>
                <td className="p-3">
                  {canConfigure && row.id !== "sandbox" ? (
                    <input
                      type="number"
                      className="input w-24"
                      defaultValue={row.costFixedCents}
                      disabled={busy === row.id}
                      onBlur={(e) => {
                        const v = Math.round(Number(e.target.value));
                        if (Number.isFinite(v) && v !== row.costFixedCents) save(row, { costFixedCents: v });
                      }}
                    />
                  ) : (
                    money(row.costFixedCents)
                  )}
                </td>
                <td className="p-3">
                  <button
                    className="btn-secondary text-xs"
                    disabled={busy === row.id || !row.configured}
                    onClick={() => health(row.id)}
                  >
                    Health
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-4 text-flux-muted" colSpan={7}>
                  Nenhum adquirente retornado pela API.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FeesPanel({ canConfigure }: { canConfigure: boolean }) {
  const { data, loading, error, reload } = useAdminData<FeeRule | null>("/fees/global");
  const [mode, setMode] = useState("provider_plus_margin");
  const [margin, setMargin] = useState("1");
  const [fixed, setFixed] = useState("0");
  const [customPct, setCustomPct] = useState("");
  const [customFixed, setCustomFixed] = useState("0");
  const [previewAmount, setPreviewAmount] = useState("10000");
  const [providerId, setProviderId] = useState("nexuspag");
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const rule = data;
  const hydrated = rule
    ? `${rule.mode}|${rule.fluxpay_margin_percent}|${rule.fluxpay_fixed_cents}`
    : "";
  const [lastHydrated, setLastHydrated] = useState("");
  if (rule && hydrated !== lastHydrated) {
    setLastHydrated(hydrated);
    setMode(rule.mode || "provider_plus_margin");
    setMargin(String(rule.fluxpay_margin_percent ?? 0));
    setFixed(String(rule.fluxpay_fixed_cents ?? 0));
    setCustomPct(rule.custom_total_percent != null ? String(rule.custom_total_percent) : "");
    setCustomFixed(String(rule.custom_total_fixed_cents ?? 0));
  }

  async function save() {
    if (!canConfigure) return;
    setSaving(true);
    setMsg(null);
    try {
      await adminFetch("/fees/global", {
        method: "PUT",
        body: {
          mode,
          fluxpayMarginPercent: Number(margin || 0),
          fluxpayFixedCents: Math.round(Number(fixed || 0)),
          customTotalPercent: customPct === "" ? null : Number(customPct),
          customTotalFixedCents: Math.round(Number(customFixed || 0)),
        },
      });
      await reload();
      setMsg("Regra global de taxa salva.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar taxa");
    } finally {
      setSaving(false);
    }
  }

  async function runPreview() {
    setMsg(null);
    try {
      const res = await adminFetch<{
        data: {
          feeAmountCents: number;
          netAmountCents: number;
          providerCostCents: number;
          fluxpayRevenueCents: number;
          totalPercent: number;
        };
      }>("/fees/preview", {
        method: "POST",
        body: {
          amountCents: Math.round(Number(previewAmount || 0)),
          providerId,
        },
      });
      setPreview(res.data as unknown as Record<string, number>);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha no preview");
      setPreview(null);
    }
  }

  if (loading) return <Loading />;
  if (error) return <Failed message={error} />;

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="font-medium">Regra global de taxa (platform_fee_rules)</div>
        <div className="text-sm text-flux-muted">
          Define como a FluxPay calcula a taxa cobrada do lojista em cima do custo do adquirente.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm space-y-1">
            <span className="text-flux-muted">Modo</span>
            <select className="input w-full" value={mode} disabled={!canConfigure} onChange={(e) => setMode(e.target.value)}>
              <option value="provider_plus_margin">provider_plus_margin</option>
              <option value="provider_only">provider_only</option>
              <option value="custom_total">custom_total</option>
            </select>
          </label>
          <label className="text-sm space-y-1">
            <span className="text-flux-muted">Margem FluxPay %</span>
            <input className="input w-full" value={margin} disabled={!canConfigure} onChange={(e) => setMargin(e.target.value)} />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-flux-muted">Fixo FluxPay (centavos)</span>
            <input className="input w-full" value={fixed} disabled={!canConfigure} onChange={(e) => setFixed(e.target.value)} />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-flux-muted">Custom total % (modo custom_total)</span>
            <input className="input w-full" value={customPct} disabled={!canConfigure} onChange={(e) => setCustomPct(e.target.value)} />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-flux-muted">Custom total fixo (centavos)</span>
            <input className="input w-full" value={customFixed} disabled={!canConfigure} onChange={(e) => setCustomFixed(e.target.value)} />
          </label>
        </div>
        {canConfigure ? (
          <button className="btn-primary text-sm" disabled={saving} onClick={save}>
            {saving ? "Salvando…" : "Salvar regra global"}
          </button>
        ) : (
          <button className="btn-secondary text-sm" disabled>
            Apenas superadmin
          </button>
        )}
        {rule && (
          <div className="text-xs text-flux-muted">
            Ativa: {rule.mode} · margem {rule.fluxpay_margin_percent ?? 0}% · fixo {rule.fluxpay_fixed_cents ?? 0}¢
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <div className="font-medium">Preview de taxa</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm space-y-1">
            <span className="text-flux-muted">Valor (centavos)</span>
            <input className="input w-full" value={previewAmount} onChange={(e) => setPreviewAmount(e.target.value)} />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-flux-muted">Adquirente</span>
            <select className="input w-full" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              <option value="nexuspag">nexuspag</option>
              <option value="profanuspay">profanuspay</option>
              <option value="gothampay">gothampay</option>
              <option value="smokepay">smokepay</option>
              <option value="kavropay">kavropay</option>
            </select>
          </label>
          <div className="flex items-end">
            <button className="btn-secondary text-sm w-full" onClick={runPreview}>
              Calcular
            </button>
          </div>
        </div>
        {preview && (
          <div className="text-sm grid gap-1 sm:grid-cols-2">
            <div>Taxa total: <strong>{money(preview.feeAmountCents)}</strong></div>
            <div>Líquido lojista: <strong>{money(preview.netAmountCents)}</strong></div>
            <div>Custo adquirente: {money(preview.providerCostCents)}</div>
            <div>Receita FluxPay: {money(preview.fluxpayRevenueCents)}</div>
            <div>Percentual total: {preview.totalPercent}%</div>
          </div>
        )}
      </div>
      {msg && <div className="card text-sm">{msg}</div>}
    </div>
  );
}
