import { supabaseAdmin } from "../config/supabase.js";
import type { Environment } from "../types/index.js";

export async function getBalance(organizationId: string, environment: Environment) {
  // Available = sum of net where available_on <= now
  // Pending = sum of net where available_on > now

  const now = new Date().toISOString();

  const { data: txs } = await supabaseAdmin
    .from("balance_transactions")
    .select("net, available_on, currency")
    .eq("organization_id", organizationId)
    .eq("environment", environment);

  let available = 0;
  let pending = 0;
  const currency = "BRL";

  for (const tx of txs || []) {
    if (!tx.available_on || tx.available_on <= now) {
      available += tx.net || 0;
    } else {
      pending += tx.net || 0;
    }
  }

  return {
    object: "balance",
    available: [{ amount: available, currency }],
    pending: [{ amount: pending, currency }],
    livemode: environment === "live",
  };
}
