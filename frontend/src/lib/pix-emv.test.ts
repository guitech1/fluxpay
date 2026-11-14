/**
 * Testes unitários do parser EMV / BR Code.
 * Executar com: npx tsx --test src/lib/pix-emv.test.ts
 * (ou integrar ao runner do projeto quando disponível)
 */
import { strict as assert } from "node:assert";
import { maskEmv, parsePixEmv } from "./pix-emv";

// Payload de exemplo (estrutura real de QR estático sem valor — truncado/sanitizado para teste)
const SAMPLE_STATIC =
  "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266141740005204000053039865802BR5913Fulano de Tal6009SAO PAULO62070503***6304ABCD";

const SAMPLE_WITH_AMOUNT =
  "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426614174000520400005303986540510.005802BR5913Fulano de Tal6009SAO PAULO62070503***6304ABCD";

function run() {
  // curto demais
  const short = parsePixEmv("abc");
  assert.equal(short.isValid, false);
  assert.ok(short.errors.length > 0);

  // estático sem valor
  const st = parsePixEmv(SAMPLE_STATIC);
  assert.ok(st.raw.length > 20);
  assert.equal(st.amountCents, null);
  assert.equal(st.merchantName, "Fulano de Tal");
  assert.equal(st.merchantCity, "SAO PAULO");

  // com valor
  const dyn = parsePixEmv(SAMPLE_WITH_AMOUNT);
  assert.equal(dyn.amountCents, 1000); // R$ 10,00

  // máscara
  const m = maskEmv(SAMPLE_STATIC);
  assert.ok(m.includes("…"));
  assert.ok(m.length < SAMPLE_STATIC.length);

  console.log("pix-emv tests: ok");
}

run();
