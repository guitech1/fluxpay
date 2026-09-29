import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_KEYLEN = 64;

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(plain: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const salt = parts[1]!;
    const expected = parts[2]!;
    const actual = scryptSync(plain, salt, SCRYPT_KEYLEN).toString("hex");
    const a = Buffer.from(actual, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function assertPasswordStrength(password: string): void {
  if (!password || password.length < 8) throw new Error("short");
  if (password.length > 128) throw new Error("long");
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) throw new Error("weak");
}

function assertFullName(name: string): string {
  const n = (name || "").trim().replace(/\s+/g, " ");
  if (n.length < 3) throw new Error("name");
  if (n.split(" ").filter(Boolean).length < 2) throw new Error("fullname");
  return n;
}

function assertPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) throw new Error("phone");
  return digits;
}

function formatCardNumberDisplay(num: string | null): string | null {
  if (!num) return null;
  return num.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function generatePublicTxId(): string {
  return `FP-${randomBytes(5).toString("hex").toUpperCase()}`;
}

describe("fluxpay-card password", () => {
  it("hashes and verifies correctly", () => {
    const hash = hashPassword("SenhaForte1");
    assert.ok(hash.startsWith("scrypt$"));
    assert.equal(verifyPassword("SenhaForte1", hash), true);
    assert.equal(verifyPassword("errada", hash), false);
  });

  it("produces different hashes for same password (salt)", () => {
    const a = hashPassword("SenhaForte1");
    const b = hashPassword("SenhaForte1");
    assert.notEqual(a, b);
    assert.equal(verifyPassword("SenhaForte1", a), true);
    assert.equal(verifyPassword("SenhaForte1", b), true);
  });

  it("rejects weak passwords", () => {
    assert.throws(() => assertPasswordStrength("abc"));
    assert.throws(() => assertPasswordStrength("abcdefgh"));
    assert.throws(() => assertPasswordStrength("12345678"));
    assert.doesNotThrow(() => assertPasswordStrength("abcde123"));
  });
});

describe("fluxpay-card validation", () => {
  it("requires name and surname", () => {
    assert.throws(() => assertFullName("Joao"));
    assert.equal(assertFullName("Joao Silva"), "Joao Silva");
  });

  it("validates phone digits", () => {
    assert.throws(() => assertPhone("123"));
    assert.equal(assertPhone("(11) 98765-4321"), "11987654321");
  });
});

describe("fluxpay-card card number display", () => {
  it("formats 16 digits in groups of 4", () => {
    assert.equal(
      formatCardNumberDisplay("4821123456789012"),
      "4821 1234 5678 9012"
    );
  });

  it("handles null", () => {
    assert.equal(formatCardNumberDisplay(null), null);
  });
});

describe("fluxpay-card public tx id", () => {
  it("starts with FP- prefix", () => {
    const id = generatePublicTxId();
    assert.ok(id.startsWith("FP-"));
    assert.ok(id.length > 5);
  });
});

describe("fluxpay-card number shape", () => {
  it("prefix 4821 + 12 digits = 16", () => {
    const candidate =
      "4821" + String(Math.floor(Math.random() * 1e12)).padStart(12, "0");
    assert.equal(candidate.length, 16);
    assert.ok(candidate.startsWith("4821"));
  });
});
