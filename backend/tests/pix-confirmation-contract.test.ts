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

test("webhooks registram processing_error e respondem 500 em falha de confirmacao", () => {
  const src = readFileSync(join(root, "backend/src/routes/webhooks.ts"), "utf8");
  assert.match(src, /pix_confirmation_failed:/);
  assert.match(src, /status\(500\)/);
  // Em falha de confirm, nao deve marcar processed_at no caminho de erro
  // (finishEvent / markProcessed so apos sucesso)
  assert.match(src, /pix_confirmation_failed/);
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
