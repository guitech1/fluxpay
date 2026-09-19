-- ============================================================
-- 015 — Solicitacoes de saque multi-tenant
--
-- O saque do lojista NAO chama POST /api/withdrawals da NexusPag
-- diretamente no pedido: aquela carteira e a da plataforma (dona
-- da NEXUSPAG_API_KEY). Fluxo:
--
--   1. Lojista solicita (status=pending) — saldo disponivel e
--      validado e uma linha balance_transactions type=payout
--      (valor negativo) bloqueia o valor.
--   2. Admin da plataforma aprova ou rejeita.
--   3. Na aprovacao, o backend chama a NexusPag (carteira principal)
--      e atualiza status.
--
-- Idempotencia: correlation_id unico por (organization_id, environment).
-- ============================================================

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment environment_type NOT NULL DEFAULT 'live',

  amount BIGINT NOT NULL CHECK (amount > 0),
  fee_amount BIGINT NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  net_amount BIGINT NOT NULL CHECK (net_amount > 0),
  currency TEXT NOT NULL DEFAULT 'BRL',

  pix_key TEXT NOT NULL,
  pix_key_type TEXT NOT NULL CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random', 'qrc')),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'approved',
      'processing',
      'completed',
      'rejected',
      'failed'
    )),

  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  review_note TEXT,

  correlation_id TEXT,
  provider TEXT,
  provider_withdrawal_id TEXT,
  provider_response JSONB,
  provider_status TEXT,
  failure_reason TEXT,

  balance_transaction_id UUID REFERENCES balance_transactions(id) ON DELETE SET NULL,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE (organization_id, environment, correlation_id)
);

CREATE INDEX idx_withdrawal_requests_org ON withdrawal_requests(organization_id);
CREATE INDEX idx_withdrawal_requests_status ON withdrawal_requests(organization_id, environment, status);
CREATE INDEX idx_withdrawal_requests_created ON withdrawal_requests(organization_id, created_at DESC);
CREATE INDEX idx_withdrawal_requests_pending ON withdrawal_requests(status)
  WHERE status IN ('pending', 'approved', 'processing');

CREATE TRIGGER update_withdrawal_requests_updated_at
  BEFORE UPDATE ON withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY withdrawal_requests_select_member
  ON withdrawal_requests FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Sem policy de INSERT/UPDATE/DELETE para authenticated:
-- so o backend (service_role) grava, igual balance_transactions (migration 010).

COMMENT ON TABLE withdrawal_requests IS
  'Pedidos de saque multi-tenant. Ledger (payout) e gravado no pedido; a chamada a NexusPag so ocorre apos aprovacao administrativa.';
