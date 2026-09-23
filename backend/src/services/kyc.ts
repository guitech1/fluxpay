import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import {
  createNexusPagKycVerification,
  getNexusPagKycVerification,
} from "../providers/nexuspag.js";
import { env } from "../config/env.js";

export type OrgKycStatus = "none" | "pending" | "verified" | "rejected";
export type KycVerificationStatus = "pending" | "approved" | "rejected" | "expired";

function maskDocument(doc: string): string {
  const digits = doc.replace(/\D/g, "");
  if (digits.length <= 3) return "***";
  return `${"*".repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}`;
}

function normalizeDocument(doc: string): string {
  return doc.replace(/\D/g, "");
}

function assertDocument(type: "CPF" | "CNPJ", doc: string): string {
  const digits = normalizeDocument(doc);
  if (type === "CPF" && digits.length !== 11) {
    throw new AppError(400, "validation_error", "CPF deve ter 11 digitos.");
  }
  if (type === "CNPJ" && digits.length !== 14) {
    throw new AppError(400, "validation_error", "CNPJ deve ter 14 digitos.");
  }
  return digits;
}

/** Obrigação atual de KYC depende SOMENTE de organizations.kyc_required. */
export function isKycObligatory(org: { kyc_required?: boolean | null }): boolean {
  return org.kyc_required === true;
}

export async function getOrganizationKyc(organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(
      "id, kyc_required, kyc_status, kyc_verified_at, kyc_document_type, kyc_document_masked, kyc_rejection_reason"
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError(404, "not_found", "Organizacao nao encontrada.");
  }
  return data;
}

export async function getLatestVerification(organizationId: string) {
  const { data } = await supabaseAdmin
    .from("kyc_verifications")
    .select(
      "id, status, document_type, document_masked, qr_code, qr_code_image, amount_cents, expires_at, rejection_reason, payer_name, verified_at, approved_via, created_at, external_id, provider_verification_id"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Uso interno: inclui document_number para comparar reinícios. */
async function getLatestVerificationInternal(organizationId: string) {
  const { data } = await supabaseAdmin
    .from("kyc_verifications")
    .select(
      "id, status, document_type, document_number, document_masked, qr_code, qr_code_image, amount_cents, expires_at, rejection_reason, payer_name, verified_at, approved_via, created_at, external_id, provider_verification_id"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * Marca verificação pending como expired (preserva histórico).
 * Não apaga linhas — só fecha a tentativa anterior.
 */
async function expirePendingVerification(verificationId: string, reason: string) {
  await supabaseAdmin
    .from("kyc_verifications")
    .update({
      status: "expired",
      rejection_reason: reason,
    })
    .eq("id", verificationId)
    .eq("status", "pending");
}

export async function startKycVerification(params: {
  organizationId: string;
  userId: string;
  document: string;
  documentType: "CPF" | "CNPJ";
  /** Força nova tentativa mesmo com pending ainda válido. */
  forceNew?: boolean;
}) {
  const org = await getOrganizationKyc(params.organizationId);
  if (!isKycObligatory(org)) {
    throw new AppError(
      400,
      "invalid_request",
      "Esta conta nao exige verificacao de identidade."
    );
  }
  if (org.kyc_status === "verified") {
    throw new AppError(409, "conflict", "Esta conta ja esta verificada.");
  }

  const documentNumber = assertDocument(params.documentType, params.document);
  const documentMasked = maskDocument(documentNumber);
  const externalId = `kyc-${params.organizationId}-${documentNumber.slice(-4)}-${uuidv4().slice(0, 8)}`;

  const latest = await getLatestVerificationInternal(params.organizationId);
  if (latest && latest.status === "pending" && latest.expires_at) {
    const exp = new Date(latest.expires_at).getTime();
    const stillValid = exp > Date.now() + 30_000;
    const sameDocument =
      normalizeDocument(latest.document_number || "") === documentNumber &&
      latest.document_type === params.documentType;

    // Reutiliza SOMENTE se o mesmo documento ainda estiver pendente e válido.
    // Documento diferente → encerra a tentativa anterior e cria outra (preserva histórico).
    if (stillValid && sameDocument && !params.forceNew) {
      const publicLatest = await getLatestVerification(params.organizationId);
      return { organization: org, verification: publicLatest!, reused: true as const };
    }

    if (stillValid && (!sameDocument || params.forceNew)) {
      await expirePendingVerification(
        latest.id,
        sameDocument
          ? "Reinicio solicitado pelo usuario"
          : "Documento alterado pelo usuario — tentativa anterior encerrada"
      );
    }
  }

  const webhookUrl = `${env.API_BASE_URL}/v1/webhooks/nexuspag`;

  let provider;
  try {
    provider = await createNexusPagKycVerification({
      document: documentNumber,
      documentType: params.documentType,
      externalId,
      webhookUrl,
    });
  } catch (err) {
    const e = err as Error;
    throw new AppError(502, "provider_error", e.message || "Falha ao iniciar KYC na NexusPag.");
  }

  const { data: row, error } = await supabaseAdmin
    .from("kyc_verifications")
    .insert({
      organization_id: params.organizationId,
      document_type: params.documentType,
      document_number: documentNumber,
      document_masked: documentMasked,
      status: provider.status === "approved" ? "approved" : "pending",
      provider: "nexuspag",
      provider_verification_id: provider.id,
      external_id: provider.externalId || externalId,
      qr_code: provider.qrCode,
      qr_code_image: provider.qrCodeImage,
      amount_cents: provider.amountCents,
      expires_at: provider.expiresAt,
      provider_response: provider.rawResponse,
      requested_by: params.userId,
    })
    .select(
      "id, status, document_type, document_masked, qr_code, qr_code_image, amount_cents, expires_at, rejection_reason, payer_name, verified_at, approved_via, created_at, external_id, provider_verification_id"
    )
    .single();

  if (error || !row) {
    console.error("[kyc] insert failed:", error);
    throw new AppError(500, "api_error", "Nao foi possivel registrar a verificacao.");
  }

  await supabaseAdmin
    .from("organizations")
    .update({
      kyc_status: row.status === "approved" ? "verified" : "pending",
      kyc_document_type: params.documentType,
      kyc_document_masked: documentMasked,
      kyc_rejection_reason: null,
      kyc_verified_at: row.status === "approved" ? new Date().toISOString() : null,
    })
    .eq("id", params.organizationId);

  const updatedOrg = await getOrganizationKyc(params.organizationId);
  return { organization: updatedOrg, verification: row, reused: false as const };
}

export async function refreshKycFromProvider(organizationId: string) {
  const latest = await getLatestVerification(organizationId);
  if (!latest?.provider_verification_id && !latest?.external_id) {
    return { organization: await getOrganizationKyc(organizationId), verification: latest };
  }

  const id = latest.provider_verification_id || latest.external_id!;
  try {
    const provider = await getNexusPagKycVerification(id);
    if (provider.status === "approved") {
      await applyKycApproved({
        organizationId,
        providerVerificationId: provider.id,
        externalId: provider.externalId,
        payerName: provider.payerName,
        verifiedAt: provider.verifiedAt,
        via: "nexuspag",
      });
    } else if (provider.status === "rejected" || provider.status === "expired") {
      await applyKycRejected({
        organizationId,
        providerVerificationId: provider.id,
        externalId: provider.externalId,
        reason: provider.rejectionReason || provider.status,
      });
    }
  } catch (err) {
    console.warn("[kyc] refresh provider failed:", err);
  }

  return {
    organization: await getOrganizationKyc(organizationId),
    verification: await getLatestVerification(organizationId),
  };
}

async function applyKycApproved(params: {
  organizationId: string;
  providerVerificationId?: string | null;
  externalId?: string | null;
  payerName?: string | null;
  verifiedAt?: string | null;
  via: "nexuspag" | "admin";
  reviewedBy?: string;
  reviewNote?: string;
}) {
  const now = params.verifiedAt || new Date().toISOString();

  if (params.providerVerificationId || params.externalId) {
    let q = supabaseAdmin.from("kyc_verifications").update({
      status: "approved",
      payer_name: params.payerName || null,
      verified_at: now,
      approved_via: params.via,
    });
    if (params.providerVerificationId) {
      q = q.eq("provider_verification_id", params.providerVerificationId);
    } else if (params.externalId) {
      q = q.eq("external_id", params.externalId);
    }
    await q.eq("organization_id", params.organizationId);
  }

  await supabaseAdmin
    .from("organizations")
    .update({
      kyc_status: "verified",
      kyc_verified_at: now,
      kyc_rejection_reason: null,
    })
    .eq("id", params.organizationId);
}

async function applyKycRejected(params: {
  organizationId: string;
  providerVerificationId?: string | null;
  externalId?: string | null;
  reason: string;
  reviewedBy?: string;
}) {
  if (params.providerVerificationId || params.externalId) {
    let q = supabaseAdmin.from("kyc_verifications").update({
      status: "rejected",
      rejection_reason: params.reason,
    });
    if (params.providerVerificationId) {
      q = q.eq("provider_verification_id", params.providerVerificationId);
    } else if (params.externalId) {
      q = q.eq("external_id", params.externalId);
    }
    await q.eq("organization_id", params.organizationId);
  }

  await supabaseAdmin
    .from("organizations")
    .update({
      kyc_status: "rejected",
      kyc_rejection_reason: params.reason,
    })
    .eq("id", params.organizationId);
}

/**
 * Liga/desliga a OBRIGAÇÃO de KYC.
 * Fonte da verdade: organizations.kyc_required.
 * Histórico em kyc_verifications NÃO é apagado nem usado como obrigação.
 */
export async function adminSetKycRequired(params: {
  organizationId: string;
  required: boolean;
  adminUserId: string;
}) {
  const updates: Record<string, unknown> = {
    kyc_required: params.required === true,
    kyc_required_at: params.required ? new Date().toISOString() : null,
    kyc_required_by: params.required ? params.adminUserId : null,
  };

  // Ao passar a exigir de novo, zera status só se ainda não estiver verified.
  // NÃO apaga kyc_verifications. Ao desligar (false), não mexe em kyc_status:
  // os guards usam apenas kyc_required === true.
  if (params.required) {
    const org = await getOrganizationKyc(params.organizationId);
    if (org.kyc_status !== "verified") updates.kyc_status = "none";
  }

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .update(updates)
    .eq("id", params.organizationId)
    .select(
      "id, kyc_required, kyc_status, kyc_verified_at, kyc_document_type, kyc_document_masked, kyc_rejection_reason"
    )
    .single();

  if (error || !data) throw new AppError(500, "api_error", "Nao foi possivel atualizar KYC da conta.");
  return data;
}

export async function adminApproveKyc(params: {
  organizationId: string;
  adminUserId: string;
  note?: string;
}) {
  await applyKycApproved({
    organizationId: params.organizationId,
    via: "admin",
    reviewedBy: params.adminUserId,
    reviewNote: params.note,
  });
  return getOrganizationKyc(params.organizationId);
}

export async function adminRejectKyc(params: {
  organizationId: string;
  adminUserId: string;
  reason: string;
}) {
  await applyKycRejected({
    organizationId: params.organizationId,
    reason: params.reason,
    reviewedBy: params.adminUserId,
  });
  return getOrganizationKyc(params.organizationId);
}

export async function adminResetKyc(params: {
  organizationId: string;
  adminUserId: string;
  reason: string;
}) {
  await supabaseAdmin
    .from("organizations")
    .update({
      kyc_status: "none",
      kyc_verified_at: null,
      kyc_rejection_reason: params.reason,
      kyc_document_type: null,
      kyc_document_masked: null,
    })
    .eq("id", params.organizationId);

  return getOrganizationKyc(params.organizationId);
}

export async function findOrgIdByKycProviderIds(params: {
  providerVerificationId?: string | null;
  externalId?: string | null;
}): Promise<string | null> {
  if (params.providerVerificationId) {
    const { data } = await supabaseAdmin
      .from("kyc_verifications")
      .select("organization_id")
      .eq("provider_verification_id", params.providerVerificationId)
      .maybeSingle();
    if (data?.organization_id) return data.organization_id;
  }
  if (params.externalId) {
    const { data } = await supabaseAdmin
      .from("kyc_verifications")
      .select("organization_id")
      .eq("external_id", params.externalId)
      .maybeSingle();
    if (data?.organization_id) return data.organization_id;
  }
  return null;
}
