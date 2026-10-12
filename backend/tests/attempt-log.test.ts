import test from "node:test";
import assert from "node:assert/strict";
import { buildAttemptLog } from "../src/services/attempt-log.js";

test("buildAttemptLog: null/undefined → null", () => {
  assert.equal(buildAttemptLog(null), null);
  assert.equal(buildAttemptLog(undefined), null);
  assert.equal(buildAttemptLog({}), null);
  assert.equal(buildAttemptLog({ attemptLog: null }), null);
});

test("buildAttemptLog: preserva providerId, outcome, latency e category", () => {
  const out = buildAttemptLog({
    attemptLog: [
      { providerId: "gothampay", attempt: 0, outcome: "failed", category: "transient", latencyMs: 120, reason: "http_5xx", message: "HTTP 503" },
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
    attemptLog: [{ providerId: "kavropay", attempt: 0, outcome: "failed", latencyMs: 10, message: long }],
  }) as Array<Record<string, unknown>>;
  assert.equal(typeof out[0].message, "string");
  assert.ok((out[0].message as string).length <= 200);
});

test("buildAttemptLog: redige padrões sensíveis na message", () => {
  const out = buildAttemptLog({
    attemptLog: [
      {
        providerId: "nexuspag",
        attempt: 0,
        outcome: "failed",
        latencyMs: 5,
        message: "auth failed bearer sk_test_abc api_key=nxp_live_deadbeef",
      },
    ],
  }) as Array<Record<string, unknown>>;
  const msg = String(out[0].message);
  assert.ok(!msg.includes("nxp_live_deadbeef"));
  assert.ok(!/bearer sk_test/i.test(msg));
  assert.match(msg, /\[redacted\]/i);
});

test("buildAttemptLog: remove chaves sensíveis do objeto da tentativa", () => {
  const out = buildAttemptLog({
    attemptLog: [
      {
        providerId: "gothampay",
        attempt: 0,
        outcome: "failed",
        latencyMs: 1,
        apiKey: "should-not-persist",
        token: "nope",
      },
    ],
  }) as Array<Record<string, unknown>>;
  assert.equal(out[0].apiKey, undefined);
  assert.equal(out[0].token, undefined);
  assert.equal(out[0].providerId, "gothampay");
});

test("buildAttemptLog: nunca lança", () => {
  assert.doesNotThrow(() => buildAttemptLog(null));
  assert.doesNotThrow(() => buildAttemptLog({ attemptLog: [null, undefined, 1, "x"] }));
});
