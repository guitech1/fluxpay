import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import type { Environment } from "../types/index.js";
import { getBalance } from "./balance.js";

export async function listVaults(organizationId: string, environment: Environment) {
  const { data, error } = await supabaseAdmin
    .from("organization_vaults")
    .select("id, name, description, color, allocated_cents, is_archived, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });

  if (error) throw new AppError(500, "api_error", "Nao foi possivel listar os cofres.");

  const balance = await getBalance(organizationId, environment);
  const available =
    balance.available.find((b) => b.currency === "BRL")?.amount ??
    balance.available[0]?.amount ??
    0;
  const totalAllocated = (data || []).reduce((s, v) => s + (v.allocated_cents || 0), 0);
  const free = Math.max(0, available - totalAllocated);

  return {
    vaults: data || [],
    balance: {
      available_cents: available,
      allocated_cents: totalAllocated,
      free_cents: free,
      currency: "BRL",
    },
  };
}

export async function createVault(
  organizationId: string,
  environment: Environment,
  input: { name: string; description?: string; color?: string }
) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new AppError(400, "validation_error", "Informe o nome do cofre.");

  const color = input.color?.trim().slice(0, 20) || null;
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new AppError(400, "validation_error", "Cor invalida. Use formato #RRGGBB.");
  }

  const { data, error } = await supabaseAdmin
    .from("organization_vaults")
    .insert({
      organization_id: organizationId,
      environment,
      name,
      description: input.description?.trim().slice(0, 200) || null,
      color,
      allocated_cents: 0,
    })
    .select()
    .single();

  if (error) throw new AppError(500, "api_error", error.message);
  return data;
}

export async function moveVaultFunds(
  organizationId: string,
  environment: Environment,
  vaultId: string,
  direction: "allocate" | "release",
  amountCents: number,
  userId: string,
  note?: string
) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new AppError(400, "validation_error", "Valor invalido.");
  }

  const { data, error } = await supabaseAdmin.rpc("fluxpay_vault_allocate", {
    p_organization_id: organizationId,
    p_environment: environment,
    p_vault_id: vaultId,
    p_amount_cents: amountCents,
    p_direction: direction,
    p_user_id: userId,
    p_note: note || null,
  });

  if (error) {
    const msg = error.message || "";
    if (msg.includes("insufficient free balance")) {
      throw new AppError(
        400,
        "validation_error",
        "Saldo livre insuficiente para alocar neste cofre."
      );
    }
    if (msg.includes("does not have enough")) {
      throw new AppError(
        400,
        "validation_error",
        "Este cofre nao tem valor alocado suficiente para liberar."
      );
    }
    if (msg.includes("vault not found")) {
      throw new AppError(404, "not_found", "Cofre nao encontrado.");
    }
    throw new AppError(500, "api_error", "Nao foi possivel movimentar o cofre.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row;
}

export async function archiveVault(
  organizationId: string,
  environment: Environment,
  vaultId: string,
  userId: string
) {
  const { data: vault } = await supabaseAdmin
    .from("organization_vaults")
    .select("id, allocated_cents")
    .eq("id", vaultId)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .eq("is_archived", false)
    .maybeSingle();

  if (!vault) throw new AppError(404, "not_found", "Cofre nao encontrado.");

  if (vault.allocated_cents > 0) {
    await moveVaultFunds(
      organizationId,
      environment,
      vaultId,
      "release",
      vault.allocated_cents,
      userId,
      "Liberacao automatica ao arquivar cofre"
    );
  }

  const { data, error } = await supabaseAdmin
    .from("organization_vaults")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", vaultId)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error) throw new AppError(500, "api_error", error.message);
  return data;
}
