import test from "node:test";
import assert from "node:assert/strict";
import { buildAttemptLog, sanitizeMessage } from "../src/services/attempt-log.js";

test("buildAttemptLog: null/undefined → null", () => {
  assert.equal(buildAttemptLog(null), null);
  assert.equal(buildAttemptLog(undefined), null);
  assert.equal(buildAttemptLog({}), null);
  assert.equal(buildAttemptLog({ attemptLog: null }), null);
});

test("buildAttemptLog: preserva providerId, outcome, latency e category", () => {
  const out = buildAttemptLog({
    attemptLog: [
      {
        providerId: "gothampay",
        attempt: 0,
        outcome: "failed",
        category: "transient",
        latencyMs: 120,
        reason: "http_5xx",
        message: "HTTP 503",
      },
      { providerId: "smokepay", attempt: 1, outcome: "success", latencyMs: 80 },
    ],
  }) as Array<Record<string, unknown>>;
  assert.equal(out.length, 2);
  assert.equal(out[0].providerId, "gothampay");
  assert.equal(out[0].outcome, "failed");
  assert.equal(out[0].category, "transient");
  assert.equal(out[0].latencyMs, 120);
  assert.equal(out[1].providerId, "smokepay");
  assert.equal(out[1].outcome, "success");
});

test("buildAttemptLog: trunca message a 200 chars", () => {
  const long = "x".repeat(500);
  const out = buildAttemptLog({
    attemptLog: [
      { providerId: "kavropay", attempt: 0, outcome: "failed", latencyMs: 10, message: long },
    ],
  }) as Array<Record<string, unknown>>;
  assert.equal(typeof out[0].message, "string");
  assert.ok((out[0].message as string).length <= 200);
});

test("sanitizeMessage: redige bearer, sk_live, nxp_live, jwt", () => {
  const samples = [
    "auth failed bearer sk_test_abc12345deadbeef",
    "api_key=nxp_live_deadbeefcafebabe01234567",
    "gotham_live_abcdef0123456789 and smoke_live_fedcba9876543210",
    "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc",
    "whsec_abc123xyz789secretvalue",
  ];
  for (const s of samples) {
    const out = sanitizeMessage(s) ?? "";
    assert.ok(!/sk_test_|nxp_live_|gotham_live_|smoke_live_|eyJhbG|whsec_/i.test(out), s);
    assert.match(out, /\[redacted\]/i, s);
  }
});

test("buildAttemptLog: remove chaves sensíveis no topo e aninhadas", () => {
  const out = buildAttemptLog({
    attemptLog: [
      {
        providerId: "gothampay",
        attempt: 0,
        outcome: "failed",
        latencyMs: 1,
        apiKey: "should-not-persist",
        token: "nope",
        nested: {
          webhook_secret: "hide-me",
          statusCode: 401,
          detail: "nxp_live_abcdef0123456789",
        },
      },
    ],
  }) as Array<Record<string, unknown>>;
  assert.equal(out[0].apiKey, undefined);
  assert.equal(out[0].token, undefined);
  assert.equal(out[0].providerId, "gothampay");
  const nested = out[0].nested as Record<string, unknown>;
  assert.equal(nested.webhook_secret, undefined);
  assert.equal(nested.statusCode, 401);
  assert.ok(!String(nested.detail).includes("nxp_live_"));
});

test("buildAttemptLog: nunca lança", () => {
  assert.doesNotThrow(() => buildAttemptLog(null));
  assert.doesNotThrow(() => buildAttemptLog({ attemptLog: [null, undefined, 1, "x"] }));
});

test("buildAttemptLog: object (non-array) attemptLog is sanitized", () => {
  const out = buildAttemptLog({
    attemptLog: { providerId: "nexuspag", secret: "x", message: "ok" },
  }) as Record<string, unknown>;
  assert.equal(out.providerId, "nexuspag");
  assert.equal(out.secret, undefined);
});
