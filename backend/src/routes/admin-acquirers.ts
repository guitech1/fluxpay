import { Router } from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { listAcquirerConfigs, getAdapter } from "../providers/index.js";
import { calculateFee } from "../services/fees.js";
import type { AcquirerId } from "../providers/types.js";
const router = Router();
router.get("/acquirers", async (_req, res) => {
  const configs = listAcquirerConfigs();
  const { data: costs } = await supabaseAdmin.from("acquirer_cost_config").select("*");
  const map = new Map((costs || []).map((c: any) => [c.acquirer_id, c]));
  res.json({ data: configs.map((c) => {
    const row = map.get(c.id) as any;
    return { ...c, costPercent: row ? Number(row.cost_percent) : c.costPercent, costFixedCents: row ? Number(row.cost_fixed_cents) : c.costFixedCents, enabled: row ? Boolean(row.enabled) && c.configured : c.enabled, priority: row ? Number(row.priority) : c.priority };
  })});
});
router.post("/acquirers/:id/health", async (req, res) => {
  const adapter = getAdapter(String(req.params.id || "").toLowerCase());
  if (!adapter?.healthCheck) { res.status(404).json({ error: { code: "not_found", message: "desconhecido" } }); return; }
  const result = await adapter.healthCheck();
  res.json({ data: { id: req.params.id, ...result, checkedAt: new Date().toISOString() } });
});
router.patch("/acquirers/:id", async (req, res) => {
  const id = String(req.params.id || "").toLowerCase();
  if (!["nexuspag", "gothampay", "smokepay", "kavropay"].includes(id)) { res.status(404).json({ error: { code: "not_found", message: "desconhecido" } }); return; }
  const body = req.body || {};
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.costPercent === "number") patch.cost_percent = body.costPercent;
  if (typeof body.costFixedCents === "number") patch.cost_fixed_cents = Math.round(body.costFixedCents);
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.priority === "number") patch.priority = Math.round(body.priority);
  const { data, error } = await supabaseAdmin.from("acquirer_cost_config").upsert({ acquirer_id: id, ...patch }, { onConflict: "acquirer_id" }).select().single();
  if (error) { res.status(500).json({ error: { code: "api_error", message: "falha" } }); return; }
  res.json({ data });
});
router.get("/fees/global", async (_req, res) => {
  const { data } = await supabaseAdmin.from("platform_fee_rules").select("*").eq("active", true).order("effective_from", { ascending: false }).limit(1).maybeSingle();
  res.json({ data: data || null });
});
router.put("/fees/global", async (req, res) => {
  const body = req.body || {};
  if (!["provider_plus_margin", "provider_only", "custom_total"].includes(body.mode)) { res.status(400).json({ error: { code: "validation_error", message: "mode inválido" } }); return; }
  await supabaseAdmin.from("platform_fee_rules").update({ active: false }).eq("active", true);
  const { data, error } = await supabaseAdmin.from("platform_fee_rules").insert({
    mode: body.mode, fluxpay_margin_percent: Number(body.fluxpayMarginPercent ?? 0),
    fluxpay_fixed_cents: Math.round(Number(body.fluxpayFixedCents ?? 0)),
    custom_total_percent: body.customTotalPercent != null ? Number(body.customTotalPercent) : null,
    custom_total_fixed_cents: body.customTotalFixedCents != null ? Math.round(Number(body.customTotalFixedCents)) : 0,
    active: true, notes: body.notes || null,
  }).select().single();
  if (error) { res.status(500).json({ error: { code: "api_error", message: "falha" } }); return; }
  res.json({ data });
});
router.post("/fees/preview", async (req, res) => {
  const amountCents = Math.round(Number(req.body?.amountCents || 0));
  if (amountCents <= 0) { res.status(400).json({ error: { code: "validation_error", message: "amountCents inválido" } }); return; }
  const result = await calculateFee({ amountCents, organizationId: req.body?.organizationId || "00000000-0000-0000-0000-000000000000", providerId: (req.body?.providerId || "nexuspag") as AcquirerId });
  res.json({ data: { feeAmountCents: result.feeAmountCents, netAmountCents: result.netAmountCents, providerCostCents: result.providerCostCents, fluxpayRevenueCents: result.fluxpayRevenueCents, totalPercent: result.snapshot.totalPercent } });
});
export default router;
