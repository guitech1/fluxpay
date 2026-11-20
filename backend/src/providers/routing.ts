import type { AcquirerId } from "./types.js";

export type RoutingRow = {
  acquirer_id: string;
  enabled: boolean;
  priority: number;
};

export const DEFAULT_PRIORITY: Record<string, number> = {
  sandbox: 999,
  nexuspag: 10,
  profanuspay: 15,
  gothampay: 20,
  smokepay: 30,
  kavropay: 40,
};

/**
 * Regra única de elegibilidade live:
 * - pool = FLUXPAY_ACTIVE_ACQUIRERS (ou default)
 * - precisa isConfigured (chave presente)
 * - se existir linha enabled=false no admin → fora
 * - se NÃO existir linha no admin mas tem chave → entra (não some do pool)
 * - ordenação por priority do admin (menor primeiro)
 */
export function filterActiveAcquirers(params: {
  pool: string[];
  rows: RoutingRow[];
  isConfigured: (id: string) => boolean;
  max?: number;
}): { ordered: AcquirerId[]; excluded: Array<{ id: string; reason: string }> } {
  const byId = new Map(
    params.rows.map((r) => [String(r.acquirer_id).toLowerCase(), r])
  );
  const excluded: Array<{ id: string; reason: string }> = [];
  const eligible: string[] = [];

  for (const raw of params.pool) {
    const id = String(raw).toLowerCase();
    if (id === "sandbox") {
      excluded.push({ id, reason: "sandbox_not_live" });
      continue;
    }
    if (!params.isConfigured(id)) {
      excluded.push({ id, reason: "missing_credentials" });
      continue;
    }
    const row = byId.get(id);
    // Só fica fora se o admin DESLIGOU explicitamente.
    // Sem linha no admin + com chave = entra no pool.
    if (row && row.enabled !== true) {
      excluded.push({ id, reason: "disabled_in_admin" });
      continue;
    }
    eligible.push(id);
  }

  const orderedAll = eligible.sort((a, b) => {
    const pa = byId.get(a)?.priority ?? DEFAULT_PRIORITY[a] ?? 100;
    const pb = byId.get(b)?.priority ?? DEFAULT_PRIORITY[b] ?? 100;
    return Number(pa) - Number(pb);
  }) as AcquirerId[];

  const max =
    params.max == null || params.max <= 0
      ? orderedAll.length
      : Math.min(params.max, orderedAll.length);

  return { ordered: orderedAll.slice(0, max), excluded };
}

export function parseActivePool(envValue: string | undefined): string[] {
  const raw = envValue?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return ["nexuspag", "profanuspay", "gothampay", "smokepay", "kavropay"];
}
