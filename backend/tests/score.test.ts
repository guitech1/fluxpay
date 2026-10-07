import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Testes unitarios das regras de nivel do Score (sem I/O).
 * A funcao completa computeFluxPayScore exige Supabase — testada em integracao.
 */

type ScoreLevel = "bronze" | "silver" | "gold" | "elite";

const LEVEL_THRESHOLDS: { level: ScoreLevel; min: number }[] = [
  { level: "elite", min: 80 },
  { level: "gold", min: 55 },
  { level: "silver", min: 30 },
  { level: "bronze", min: 0 },
];

function levelFromScore(score: number): ScoreLevel {
  for (const t of LEVEL_THRESHOLDS) {
    if (score >= t.min) return t.level;
  }
  return "bronze";
}

describe("FluxPay Score levels", () => {
  it("maps thresholds", () => {
    assert.equal(levelFromScore(0), "bronze");
    assert.equal(levelFromScore(29), "bronze");
    assert.equal(levelFromScore(30), "silver");
    assert.equal(levelFromScore(54), "silver");
    assert.equal(levelFromScore(55), "gold");
    assert.equal(levelFromScore(79), "gold");
    assert.equal(levelFromScore(80), "elite");
    assert.equal(levelFromScore(100), "elite");
  });

  it("clamps conceptually to 0–100 domain", () => {
    assert.equal(levelFromScore(-1), "bronze");
  });
});
