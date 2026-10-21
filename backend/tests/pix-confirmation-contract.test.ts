/**
 * Contrato estatico: markPixPaymentSucceeded nao engole falha da RPC.
 * Sem mock de Supabase — inspeciona o fonte (mesmo padrao de push-and-fee.test.ts).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("markPixPaymentSucceeded lanca erro quando RPC falha (nao return silencioso)", () => {
  const src = readFileSync(
    join(root, "backend/src/services/payments-queries.ts"),
    "utf8"
  );
  const idx = src.indexOf("export async function markPixPaymentSucceeded");
  assert.ok(idx >= 0, "funcao deve existir");
  const slice = src.slice(idx, idx + 1800);

  // Nao pode mais haver "return;" logo apos log de falha da RPC
  assert.match(slice, /pix_confirmation_failed/);
  assert.match(slice, /throw new Error/);
  // Garantia de que o caminho de erro nao e um return vazio
  assert.ok(
    !/if \(error \|\| !updated\) \{[\s\S]*?console\.error\([\s\S]*?\);\s*return;\s*\}/.test(
      slice
    ),
    "nao deve haver return silencioso apos falha da RPC"
  );
});

test("webhooks propagam falha de confirmacao e so marcam evento como processado apos sucesso", () => {
  const src = readFileSync(join(root, "backend/src/routes/webhooks.ts"), "utf8");
  assert.match(src, /case "confirm":[\s\S]*?await markPixPaymentSucceeded\(payment!\);[\s\S]*?await markProcessed\(\);/);
  // A excecao da confirmacao segue para o handler HTTP; nao se chama markProcessed no catch.
  assert.match(src, /catch \(err\) \{\s*next\(err\);\s*\}/);
  assert.match(src, /status\(500\)/);
});

test("reconcile nao marca processed_at quando confirmacao falha", () => {
  const src = readFileSync(
    join(root, "backend/src/services/payments-queries.ts"),
    "utf8"
  );
  assert.match(src, /reconcile_confirm_failed/);
  // Continua sem processed_at no catch
  const idx = src.indexOf("reconcile_confirm_failed");
  const slice = src.slice(idx - 200, idx + 400);
  assert.match(slice, /continue/);
  assert.ok(!/processed_at:\s*new Date/.test(slice.split("continue")[0]));
});
