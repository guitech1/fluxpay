/**
 * Controle global de saques / PIX out.
 * platform_settings key: stop_withdrawals
 * Quando ativo: nenhuma conta saca (ledger, subconta Smoke, carteira digital).
 */
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";

export const STOP_WITHDRAWALS_MESSAGE = "transações em manutenção, aguarde.";

export type StopWithdrawalsSettings = {
  enabled: boolean;
  message: string;
  updated_at?: string | null;
};

const DEFAULT: StopWithdrawalsSettings = {
  enabled: false,
  message: STOP_WITHDRAWALS_MESSAGE,
  updated_at: null,
};

let cached: { value: StopWithdrawalsSettings; at: number } | null = null;
const TTL_MS = 10_000;

export async function getStopWithdrawalsSettings(force = false): Promise<StopWithdrawalsSettings> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "stop_withdrawals")
    .maybeSingle();

  const raw = (data?.value || {}) as Partial<StopWithdrawalsSettings>;
  const value: StopWithdrawalsSettings = {
    enabled: Boolean(raw.enabled),
    message:
      typeof raw.message === "string" && raw.message.trim()
        ? raw.message.trim().slice(0, 200)
        : STOP_WITHDRAWALS_MESSAGE,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
  };
  cached = { value, at: Date.now() };
  return value;
}

export function invalidateStopWithdrawalsCache(): void {
  cached = null;
}

export async function isWithdrawalsStopped(): Promise<boolean> {
  const s = await getStopWithdrawalsSettings();
  return s.enabled;
}

/** Bloqueia saque / PIX out / transferência da carteira digital. */
export async function assertWithdrawalsAllowed(): Promise<void> {
  const s = await getStopWithdrawalsSettings();
  if (s.enabled) {
    throw new AppError(503, "service_unavailable", s.message || STOP_WITHDRAWALS_MESSAGE);
  }
}

export async function setStopWithdrawals(params: {
  enabled: boolean;
  message?: string;
}): Promise<StopWithdrawalsSettings> {
  const before = await getStopWithdrawalsSettings(true);
  const next: StopWithdrawalsSettings = {
    enabled: params.enabled,
    message:
      (params.message && params.message.trim()) ||
      before.message ||
      STOP_WITHDRAWALS_MESSAGE,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .upsert({ key: "stop_withdrawals", value: next }, { onConflict: "key" })
    .select("value")
    .single();

  if (error) throw error;
  invalidateStopWithdrawalsCache();
  const value = { ...DEFAULT, ...((data?.value as Partial<StopWithdrawalsSettings>) || next) };
  cached = { value, at: Date.now() };
  return value;
}
