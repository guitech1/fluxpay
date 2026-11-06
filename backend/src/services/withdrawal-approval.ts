/**
 * Configuracao individual de aprovacao manual de saque por organizacao.
 * Apenas admin da plataforma pode alterar. Cliente nunca.
 */
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";

export async function getRequiresManualWithdrawalApproval(
  organizationId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("requires_manual_withdrawal_approval")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[withdrawal-approval] get:", error.message);
    return false;
  }
  return Boolean(data?.requires_manual_withdrawal_approval);
}

export async function setRequiresManualWithdrawalApproval(params: {
  organizationId: string;
  enabled: boolean;
  adminUserId: string;
  reason?: string | null;
  ipAddress?: string | null;
}): Promise<{ organization_id: string; requires_manual_withdrawal_approval: boolean }> {
  const { data: org, error: fetchErr } = await supabaseAdmin
    .from("organizations")
    .select("id, requires_manual_withdrawal_approval")
    .eq("id", params.organizationId)
    .maybeSingle();

  if (fetchErr || !org) {
    throw new AppError(404, "not_found", "Organizacao nao encontrada.");
  }

  const previous = Boolean(org.requires_manual_withdrawal_approval);
  if (previous === params.enabled) {
    return {
      organization_id: org.id,
      requires_manual_withdrawal_approval: previous,
    };
  }

  const { data: updated, error } = await supabaseAdmin
    .from("organizations")
    .update({ requires_manual_withdrawal_approval: params.enabled })
    .eq("id", params.organizationId)
    .select("id, requires_manual_withdrawal_approval")
    .single();

  if (error || !updated) {
    throw new AppError(500, "api_error", "Nao foi possivel atualizar a configuracao.");
  }

  await supabaseAdmin.from("withdrawal_approval_config_audit").insert({
    organization_id: params.organizationId,
    actor_user_id: params.adminUserId,
    previous_value: previous,
    new_value: params.enabled,
    reason: (params.reason || "").trim().slice(0, 500) || null,
    ip_address: params.ipAddress ?? null,
  });

  return {
    organization_id: updated.id,
    requires_manual_withdrawal_approval: Boolean(
      updated.requires_manual_withdrawal_approval
    ),
  };
}
