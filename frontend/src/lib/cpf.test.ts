import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidCpf, onlyDigits, formatCpf } from "./cpf.js";

describe("cpf local validation", () => {
  it("rejects empty and short", () => {
    assert.equal(isValidCpf(""), false);
    assert.equal(isValidCpf("123"), false);
  });

  it("rejects sequential same digits", () => {
    assert.equal(isValidCpf("11111111111"), false);
    assert.equal(isValidCpf("00000000000"), false);
  });

  it("accepts known valid CPFs", () => {
    // CPFs de teste publicamente usados em docs (algoritmo, nao pessoas reais)
    assert.equal(isValidCpf("529.982.247-25"), true);
    assert.equal(isValidCpf("52998224725"), true);
  });

  it("rejects invalid check digits", () => {
    assert.equal(isValidCpf("52998224726"), false);
  });

  it("formats and strips", () => {
    assert.equal(onlyDigits("529.982.247-25"), "52998224725");
    assert.equal(formatCpf("52998224725"), "529.982.247-25");
  });
});
