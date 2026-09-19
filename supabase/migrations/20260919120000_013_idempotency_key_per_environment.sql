-- FluxPay 013 — a chave de idempotencia passa a ser por AMBIENTE
--
-- Problema: payments tinha UNIQUE(organization_id, idempotency_key), sem o
-- ambiente. Como a referencia da cobranca e escolhida pelo lojista (numero do
-- pedido, da fatura), o caminho normal de quem integra e testar com
-- "pedido-1042" em sandbox e depois usar a MESMA referencia em producao.
-- Com a constraint antiga isso dava dois resultados, os dois errados:
--
--   1. o middleware de idempotencia encontrava a cobranca de TESTE e devolvia
--      um QR Code falso para uma venda real; ou
--   2. quando o middleware nao era acionado (sem header Idempotency-Key), o
--      INSERT batia na unique e virava um 500 generico.
--
-- Trocar a constraint por UNIQUE(organization_id, environment,
-- idempotency_key) faz o ambiente ser parte da identidade da cobranca, igual
-- ao resto do sistema (a chave de API decide o ambiente).
--
-- Aditivo e seguro em base com dados: a nova constraint e MENOS restritiva
-- que a antiga, entao nenhuma linha existente pode viola-la.

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_organization_id_idempotency_key_key;

ALTER TABLE payments
  ADD CONSTRAINT payments_org_env_idempotency_key
  UNIQUE (organization_id, environment, idempotency_key);

COMMENT ON COLUMN payments.idempotency_key IS
  'Referencia do lojista (header Idempotency-Key). Unica por organizacao E ambiente — a mesma referencia pode existir em test e em live.';

-- ============================================================
-- Indice de apoio a busca do webhook por external_id
--
-- O webhook de entrada passou a procurar a cobranca por `provider_txid` OU
-- por `provider_external_id` (backend/src/services/payments.ts,
-- getPaymentByProviderReference). O external_id e o que fecha a janela de
-- corrida: ele e gravado ANTES da chamada ao adquirente, enquanto o txid so
-- existe depois da resposta.
--
-- O indice que ja existia (migration 006) e
-- (provider, provider_external_id) — composto, com `provider` na frente.
-- Uma busca so por provider_external_id nao o aproveita bem. Este indice
-- cobre exatamente a consulta nova.
--
-- Deliberadamente NAO e UNIQUE: hoje o valor gravado e o UUID da propria
-- cobranca (unico por construcao), mas linhas anteriores a esta rodada
-- podem ter gravado ali a referencia do lojista, que pode repetir entre
-- organizacoes. Um indice unico falharia na criacao nessas bases.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_payments_provider_external_id
  ON payments(provider_external_id)
  WHERE provider_external_id IS NOT NULL;

-- ============================================================
-- Apoio a reconciliacao automatica de cobrancas PIX orfas
--
-- reconcileOrphanPixCharges() varre, a cada 10 minutos, as cobrancas
-- pendentes de PIX que ficaram sem txid (chamada ao adquirente que falhou de
-- forma ambigua). Sem este indice a varredura e um seq scan em `payments`.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_payments_pix_orphans
  ON payments(created_at)
  WHERE status = 'pending' AND payment_type = 'pix' AND provider_txid IS NULL;

-- ============================================================
-- Apoio ao reprocessamento automatico de eventos do adquirente
--
-- A migration 006 ja criou idx_provider_events_unprocessed sobre
-- (received_at) WHERE processed_at IS NULL. reprocessUnmatchedProviderEvents()
-- filtra tambem por signature_valid = true. Nenhum indice novo e necessario:
-- o volume de eventos pendentes e, por definicao, pequeno, e o indice
-- existente ja reduz a varredura ao conjunto certo. Registrado aqui para que
-- a decisao fique explicita em vez de parecer esquecimento.
-- ============================================================
