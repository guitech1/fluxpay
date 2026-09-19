/**
 * Idempotencia: mesma chave em test e live, e duas requisicoes simultaneas.
 *
 * ATENCAO AO QUE ESTE ARQUIVO E E AO QUE NAO E.
 *
 * A garantia real mora em dois lugares que precisam de banco para rodar:
 *   - a constraint UNIQUE(organization_id, environment, idempotency_key)
 *     (supabase/migrations/..._013_...sql);
 *   - o tratamento do 23505 em services/payments.ts::createPayment.
 *
 * Sem rede nao da para subir um Postgres aqui. Entao este arquivo faz duas
 * coisas:
 *   1. testa de verdade o predicado de escopo usado pelo middleware
 *      (isInScope), que e codigo real importado;
 *   2. executa a semantica da constraint e do tratamento de conflito contra
 *      um modelo em memoria — uma ESPECIFICACAO EXECUTAVEL do que a migration
 *      013 e o createPayment precisam entregar. Se alguem mudar a regra, este
 *      arquivo diz qual era o contrato.
 *
 * O teste ponta a ponta contra o banco continua pendente e esta listado no
 * CONTINUACAO.md como nao validado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { isInScope } from "../src/utils/scope.js";

const ORG = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------
// 1. Codigo real: o filtro de escopo da resposta idempotente
// ---------------------------------------------------------------

test("resposta idempotente nunca devolve cobranca do outro ambiente", () => {
  const paymentEmTeste = { id: "pay_test", organization_id: ORG, environment: "test" };

  // Requisicao de PRODUCAO com a mesma referencia usada nos testes.
  // Era este o caso que devolvia um QR Code falso para uma venda real.
  assert.equal(isInScope(paymentEmTeste, ORG, "live"), false);
  assert.equal(isInScope(paymentEmTeste, ORG, "test"), true);
});

// ---------------------------------------------------------------
// 2. Especificacao executavel: UNIQUE(org, environment, idempotency_key)
//    + resolucao do 23505 como em createPayment
// ---------------------------------------------------------------

interface Row {
  id: string;
  organization_id: string;
  environment: string;
  idempotency_key: string | null;
}

class UniqueViolation extends Error {
  code = "23505";
}

/** Modelo da tabela `payments` com a constraint da migration 013. */
class PaymentsTable {
  rows: Row[] = [];

  insert(row: Row): Row {
    if (row.idempotency_key !== null) {
      const clash = this.rows.find(
        (r) =>
          r.organization_id === row.organization_id &&
          r.environment === row.environment &&
          r.idempotency_key === row.idempotency_key
      );
      if (clash) throw new UniqueViolation("duplicate key");
    }
    this.rows.push(row);
    return row;
  }

  findByKey(organizationId: string, environment: string, key: string): Row | null {
    return (
      this.rows.find(
        (r) =>
          r.organization_id === organizationId &&
          r.environment === environment &&
          r.idempotency_key === key
      ) ?? null
    );
  }
}

/** Algoritmo de createPayment: grava primeiro, trata 23505 como "ja existe". */
function createPaymentLikeService(
  table: PaymentsTable,
  args: { id: string; organizationId: string; environment: string; idempotencyKey: string }
): { row: Row; created: boolean } {
  try {
    const row = table.insert({
      id: args.id,
      organization_id: args.organizationId,
      environment: args.environment,
      idempotency_key: args.idempotencyKey,
    });
    return { row, created: true };
  } catch (err) {
    if (err instanceof UniqueViolation) {
      const existing = table.findByKey(args.organizationId, args.environment, args.idempotencyKey);
      assert.ok(existing, "23505 sem linha correspondente seria um bug do modelo");
      return { row: existing, created: false };
    }
    throw err;
  }
}

test("a MESMA idempotency_key pode existir em test e em live", () => {
  const table = new PaymentsTable();

  const emTeste = createPaymentLikeService(table, {
    id: "pay_a",
    organizationId: ORG,
    environment: "test",
    idempotencyKey: "pedido-1042",
  });
  const emProducao = createPaymentLikeService(table, {
    id: "pay_b",
    organizationId: ORG,
    environment: "live",
    idempotencyKey: "pedido-1042",
  });

  // Com a constraint ANTIGA (sem environment) a segunda chamada falharia com
  // 23505 e viraria um 500 generico, ou devolveria a cobranca de teste.
  assert.equal(emTeste.created, true);
  assert.equal(emProducao.created, true);
  assert.notEqual(emTeste.row.id, emProducao.row.id);
  assert.equal(table.rows.length, 2);
});

test("duas requisicoes simultaneas com a mesma chave criam UMA cobranca", () => {
  const table = new PaymentsTable();

  // O ponto da corrida: as duas leem "nao existe" antes de qualquer insert.
  // O middleware de idempotencia, sozinho, deixa as duas passarem.
  assert.equal(table.findByKey(ORG, "live", "pedido-7"), null);
  assert.equal(table.findByKey(ORG, "live", "pedido-7"), null);

  // Depois, as duas tentam gravar. O banco arbitra.
  const primeira = createPaymentLikeService(table, {
    id: "pay_1",
    organizationId: ORG,
    environment: "live",
    idempotencyKey: "pedido-7",
  });
  const segunda = createPaymentLikeService(table, {
    id: "pay_2",
    organizationId: ORG,
    environment: "live",
    idempotencyKey: "pedido-7",
  });

  assert.equal(primeira.created, true);
  assert.equal(segunda.created, false, "a segunda nao pode criar cobranca nova");
  assert.equal(segunda.row.id, primeira.row.id, "as duas respostas descrevem a mesma cobranca");
  assert.equal(table.rows.length, 1, "uma unica cobranca no banco");

  // E, como a gravacao acontece ANTES da chamada ao adquirente, a segunda
  // requisicao sequer chega a criar um PIX na NexusPag.
});

test("cobranca sem idempotency_key nunca colide com outra", () => {
  const table = new PaymentsTable();
  table.insert({ id: "p1", organization_id: ORG, environment: "live", idempotency_key: null });
  table.insert({ id: "p2", organization_id: ORG, environment: "live", idempotency_key: null });
  assert.equal(table.rows.length, 2);
});
