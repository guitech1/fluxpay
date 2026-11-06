/**
 * Gate de servidor para operações financeiras da Carteira Digital.
 * Status permitidos: apenas "approved".
 * Todos os usuários (novos ou legados) precisam de cadastro + aprovação admin.
 */
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";

export type WalletGateRow = {
  id: string;
  status: string;
  full_name: string | null;
  cpf: string | null;
};

export async function requireApprovedDigitalAccount(
  organizationId: string
): Promise<WalletGateRow> {
  const { data: card, error } = await supabaseAdmin
    .from("fluxpay_cards")
    .select("id, status, full_name, cpf")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[require-approved-wallet]", error.message);
    throw new AppError(500, "api_error", "Nao foi possivel validar a carteira digital.");
  }

  if (!card) {
    throw new AppError(
      403,
      "permission_error",
      "Solicite e aguarde a aprovacao da carteira digital antes de operar."
    );
  }

  switch (card.status) {
    case "approved":
      return card as WalletGateRow;
    case "pending_review":
      throw new AppError(
        403,
        "permission_error",
        "Sua carteira digital ainda esta em analise. Operacoes financeiras liberam apos aprovacao."
      );
    case "rejected":
      throw new AppError(
        403,
        "permission_error",
        "Sua carteira digital foi reprovada. Entre em contato com o suporte."
      );
    case "blocked":
      throw new AppError(403, "permission_error", "Sua carteira digital esta bloqueada.");
    default:
      throw new AppError(
        403,
        "permission_error",
        "Sua carteira digital nao esta aprovada para operacoes."
      );
  }
}
