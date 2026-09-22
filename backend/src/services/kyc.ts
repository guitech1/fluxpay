import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabase.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error.js";
import { createKycVerification, getKycVerification } from "../providers/nexuspag.js";

export type KycDocumentType = "CPF" | "CNPJ";
export type KycOrgStatus = "none" | "pending" | "verified" | "rejected";
export type KycVerificationStatus = "pending" | "approved" | "rejected" | "expired";

function validateCpf(d: string): boolean {
  if (d.length !== 11 || /^([0-9])\\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i);
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i);
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  return digit === Number(d[10]);
}

function validateCnpj(d: string): boolean {
  if (d.length !== 14 || /^([0-9])\\1+$/.test(d)) return false;
  const calc = (length: number) => {
    const weights = length === 12
      ? [5,4,3,2,9,8,7,6,5,4,3,2]
      : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const sum = weights.reduce((acc, weight, i) => acc + Number(d[i]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

function normalizeDocument(document: string, type: KycDocumentType): string {
  const digits = document.replace(/\D/g, "");
  const expected = type === "CPF" ? 11 : 14;
  if (digits.length !== expected) {
    throw new AppError(400, "validation_error", `${type} deve ter ${expected} digitos.`);
  }
  if (type === "CPF" ? !validateCpf(digits) : !validateCnpj(digits)) {
    throw new AppError(400, "validation_error", `${type} invalido.`);
  }
  return digits;
}

function maskDocument(document: string, type: KycDocumentType): string {
  const d = document.replace(/\D/g, "");
  return type === "CPF"
    ? `***.***.${d.slice(-3)}-**`
    : `**.***.***/****-${d.slice(-2)}`;
}

function assertValidKycStatus(status: string | null | undefined): KycOrgStatus {
  if (status === "pending" || status === "verified" || status === "rejected") return status;
  return "none";
}

function publicVerification(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    document_type: row.document_type,
    document_masked: row.document_masked,
    status: row.status,
    provider: row.provider,
    provider_verification_id: row.provider_verification_id,
    qr_code: row.qr_code,
    qr_code_image: row.qr_code_image,
    amount_cents: row.amount_cents,
    expires_at: row.expires_at,
    payer_name: row.payer_name,
    rejection_reason: row.rejection_reason,
    verified_at: row.verified_at,
    approved_via: row.approved_via,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getOrganization(organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id, name, kyc_required, kyc_status, kyc_verified_at, kyc_document_type, kyc_document_masked, kyc_rejection_reason")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError(404, "not_found", "Organizacao nao encontrada.");
  return data;
}

async function getLatestVerification(organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from("kyc_verifications")
    .select("id, organization_id, document_type, document_masked, status, provider, provider_verification_id, qr_code, qr_code_image, amount_cents, expires_at, payer_name, rejection_reason, verified_at, approved_via, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getKycStatus(organizationId: string) {
  const organization = await getOrganization(organizationId);
  let verification = await getLatestVerification(organizationId);

  if (verification?.status === "pending" && verification.expires_at && new Date(verification.expires_at).getTime() <= Date.now()) {
    await supabaseAdmin
      .from("kyc_verifications")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", matchedVerification.id)
      .eq("status", "pending");
    if (organization.kyc_status === "pending") {
      await supabaseAdmin
        .from("organizations")
        .update({ kyc_status: "rejected", kyc_rejection_reason: "Verificacao expirada." })
        .eq("id", organizationId)
        .eq("kyc_status", "pending");
    }
    verification = await getLatestVerification(organizationId);
  }

  return {
    required: Boolean(organization.kyc_required),
    status: assertValidKycStatus(organization.kyc_status),
    verified_at: organization.kyc_verified_at,
    document_type: organization.kyc_document_type,
    document_masked: organization.kyc_document_masked,
    rejection_reason: organization.kyc_rejection_reason,
    verification: publicVerification(verification),
  };
}

export async function startKycVerification(params: {
  organizationId: string;
  userId: string;
  document: string;
  documentType: KycDocumentType;
}) {
  const organization = await getOrganization(params.organizationId);
  if (!organization.kyc_required) {
    throw new AppError(409, "invalid_request", "Esta organizacao nao exige verificacao de identidade.");
  }
  if (organization.kyc_status === "verified") {
    throw new AppError(409, "invalid_request", "A identidade desta organizacao ja foi verificada.");
  }

  const document = normalizeDocument(params.document, params.documentType);
  const masked = maskDocument(document, params.documentType);
  const externalId = `fluxpay-kyc-${params.organizationId}-${uuidv4()}`;
  const webhookUrl = `${env.API_BASE_URL.replace(/\/$/, "")}/v1/webhooks/nexuspag`;

  const provider = await createKycVerification({
    document,
    documentType: params.documentType,
    externalId,
    webhookUrl,
  });

  const providerStatus = provider.status === "approved" ? "approved" : provider.status === "rejected" ? "rejected" : provider.status === "expired" ? "expired" : "pending";
  const now = new Date().toISOString();

  const { data: row, error } = await supabaseAdmin
    .from("kyc_verifications")
    .insert({
      organization_id: params.organizationId,
      document_type: params.documentType,
      document_number: document,
      document_masked: masked,
      status: providerStatus,
      provider: "nexuspag",
      provider_verification_id: provider.id,
      external_id: provider.external_id || externalId,
      qr_code: provider.qr_code ?? null,
      qr_code_image: provider.qr_code_image ?? null,
      amount_cents: 200,
      expires_at: provider.expires_at ?? null,
      provider_response: provider,
      payer_name: provider.payer_name ?? null,
      rejection_reason: provider.rejection_reason ?? null,
      verified_at: provider.verified_at ?? null,
      requested_by: params.userId,
      approved_via: providerStatus === "approved" ? "nexuspag" : null,
      updated_at: now,
    })
    .select("id, document_type, document_masked, status, provider, provider_verification_id, qr_code, qr_code_image, amount_cents, expires_at, payer_name, rejection_reason, verified_at, approved_via, created_at, updated_at")
    .single();

  if (error || !row) {
    console.error("[kyc] insert failed:", error);
    throw new AppError(500, "api_error", "Nao foi possivel registrar a verificacao de identidade.");
  }

  const orgStatus: KycOrgStatus =
    providerStatus === "approved" ? "verified" :
    providerStatus === "rejected" ? "rejected" : "pending";

  await supabaseAdmin
    .from("organizations")
    .update({
      kyc_status: orgStatus,
      kyc_document_type: params.documentType,
      kyc_document_masked: masked,
      kyc_rejection_reason: provider.rejection_reason ?? null,
      kyc_verified_at: provider.verified_at ?? null,
    })
    .eq("id", params.organizationId);

  return {
    ...publicVerification(row),
    required: true,
    status: orgStatus,
  };
}

export async function syncKycFromProvider(params: {
  providerVerificationId: string;
  externalId?: string | null;
  eventStatus: "approved" | "rejected";
  rejectionReason?: string | null;
  payerName?: string | null;
  providerResponse: unknown;
}) {
  const { data: verification, error } = await supabaseAdmin
    .from("kyc_verifications")
    .select("id, organization_id, status, document_type, document_masked, provider_verification_id, external_id")
    .eq("provider", "nexuspag")
    .eq("provider_verification_id", params.providerVerificationId)
    .maybeSingle();

  if (error) throw error;
  let matchedVerification = verification;
  if (!matchedVerification && params.externalId) {
    const { data: byExternal, error: externalError } = await supabaseAdmin
      .from("kyc_verifications")
      .select("id, organization_id, status, document_type, document_masked, provider_verification_id, external_id")
      .eq("provider", "nexuspag")
      .eq("external_id", params.externalId)
      .maybeSingle();
    if (externalError) throw externalError;
    matchedVerification = byExternal;
  }
  if (!matchedVerification) return { matched: false, organizationId: null };

  const finalStatus = params.eventStatus;
  if (matchedVerification.status === finalStatus) return { matched: true, duplicate: true, organizationId: matchedVerification.organization_id };

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("kyc_verifications")
    .update({
      status: finalStatus,
      rejection_reason: params.rejectionReason ?? null,
      payer_name: params.payerName ?? null,
      verified_at: finalStatus === "approved" ? now : null,
      approved_via: finalStatus === "approved" ? "nexuspag" : null,
      provider_response: params.providerResponse,
      updated_at: now,
    })
    .eq("id", matchedVerification.id)
    .neq("status", finalStatus)
    .select("id, organization_id, status, document_type, document_masked, rejection_reason, verified_at, approved_via")
    .maybeSingle();

  if (updateError) throw updateError;

  await supabaseAdmin
    .from("organizations")
    .update({
      kyc_status: finalStatus === "approved" ? "verified" : "rejected",
      kyc_verified_at: finalStatus === "approved" ? now : null,
      kyc_document_type: matchedVerification.document_type,
      kyc_document_masked: matchedVerification.document_masked,
      kyc_rejection_reason: finalStatus === "rejected" ? (params.rejectionReason ?? null) : null,
    })
    .eq("id", matchedVerification.organization_id);

  return { matched: true, duplicate: !updated, organizationId: matchedVerification.organization_id };
}

export async function updateKycByAdmin(params: {
  organizationId: string;
  adminUserId: string;
  action: "enable" | "disable" | "approve" | "reject" | "reset";
  reason?: string | null;
}) {
  const organization = await getOrganization(params.organizationId);
  const now = new Date().toISOString();

  if (params.action === "enable" || params.action === "disable") {
    const required = params.action === "enable";
    const patch: Record<string, unknown> = {
      kyc_required: required,
      updated_at: now,
    };
    if (required) {
      patch.kyc_required_at = now;
      patch.kyc_required_by = params.adminUserId;
    }
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .update(patch)
      .eq("id", params.organizationId)
      .select("id, name, kyc_required, kyc_status, kyc_verified_at, kyc_document_type, kyc_document_masked, kyc_rejection_reason, kyc_required_at, kyc_required_by")
      .single();
    if (error) throw error;
    return { before: organization, after: data };
  }

  const verification = await getLatestVerification(params.organizationId);

  if (params.action === "reset") {
    if (verification) {
      await supabaseAdmin
        .from("kyc_verifications")
        .update({
          status: "expired",
          review_note: params.reason ?? "Verificacao reiniciada pelo administrador.",
          reviewed_by: params.adminUserId,
          reviewed_at: now,
          updated_at: now,
        })
        .eq("id", matchedVerification.id);
    }
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .update({
        kyc_status: "none",
        kyc_verified_at: null,
        kyc_rejection_reason: null,
        kyc_document_type: null,
        kyc_document_masked: null,
      })
      .eq("id", params.organizationId)
      .select("id, name, kyc_required, kyc_status, kyc_verified_at, kyc_document_type, kyc_document_masked, kyc_rejection_reason, kyc_required_at, kyc_required_by")
      .single();
    if (error) throw error;
    return { before: organization, after: data };
  }

  if (!verification) {
    throw new AppError(409, "invalid_request", "Nao existe verificacao KYC para esta organizacao.");
  }

  const finalStatus = params.action === "approve" ? "approved" : "rejected";
  await supabaseAdmin
    .from("kyc_verifications")
    .update({
      status: finalStatus,
      reviewed_by: params.adminUserId,
      reviewed_at: now,
      review_note: params.reason ?? null,
      approved_via: params.action === "approve" ? "admin" : null,
      verified_at: params.action === "approve" ? now : null,
      rejection_reason: params.action === "reject" ? (params.reason ?? "Rejeitado pelo administrador.") : null,
      updated_at: now,
    })
    .eq("id", matchedVerification.id);

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .update({
      kyc_status: params.action === "approve" ? "verified" : "rejected",
      kyc_verified_at: params.action === "approve" ? now : null,
      kyc_document_type: matchedVerification.document_type,
      kyc_document_masked: matchedVerification.document_masked,
      kyc_rejection_reason: params.action === "reject" ? (params.reason ?? "Rejeitado pelo administrador.") : null,
    })
    .eq("id", params.organizationId)
    .select("id, name, kyc_required, kyc_status, kyc_verified_at, kyc_document_type, kyc_document_masked, kyc_rejection_reason, kyc_required_at, kyc_required_by")
    .single();

  if (error) throw error;
  return { before: organization, after: data };
}

export { publicVerification };
