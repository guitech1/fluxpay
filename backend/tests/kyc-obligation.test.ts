/**
 * Contratos da obrigação de KYC e da reutilização de PIX.
 */
import test from "node:test";
import assert from "node:assert/strict";

function isKycObligatory(org: { kyc_required?: boolean | null }): boolean {
  return org.kyc_required === true;
}

function shouldReusePending(params: {
  pending: boolean;
  stillValid: boolean;
  sameDocument: boolean;
  forceNew?: boolean;
}): boolean {
  if (!params.pending || !params.stillValid) return false;
  if (params.forceNew) return false;
  return params.sameDocument;
}

test("kyc_required=true → usuário é obrigado", () => {
  assert.equal(isKycObligatory({ kyc_required: true }), true);
});

test("kyc_required=false → usuário NÃO é obrigado", () => {
  assert.equal(isKycObligatory({ kyc_required: false }), false);
});

test("true → false: obrigação desaparece", () => {
  assert.equal(isKycObligatory({ kyc_required: true }), true);
  assert.equal(isKycObligatory({ kyc_required: false }), false);
});

test("false → true: obrigação volta", () => {
  assert.equal(isKycObligatory({ kyc_required: false }), false);
  assert.equal(isKycObligatory({ kyc_required: true }), true);
});

test("pending antigo + kyc_required=false NÃO obriga", () => {
  assert.equal(isKycObligatory({ kyc_required: false }), false);
});

test("null/undefined kyc_required NÃO obriga", () => {
  assert.equal(isKycObligatory({ kyc_required: null }), false);
  assert.equal(isKycObligatory({}), false);
});

test("mesmo documento pending válido → reutiliza PIX", () => {
  assert.equal(shouldReusePending({ pending: true, stillValid: true, sameDocument: true }), true);
});

test("documento alterado → NÃO reutiliza PIX antigo", () => {
  assert.equal(shouldReusePending({ pending: true, stillValid: true, sameDocument: false }), false);
});

test("forceNew → NÃO reutiliza", () => {
  assert.equal(shouldReusePending({ pending: true, stillValid: true, sameDocument: true, forceNew: true }), false);
});

test("pending expirado → NÃO reutiliza", () => {
  assert.equal(shouldReusePending({ pending: true, stillValid: false, sameDocument: true }), false);
});
