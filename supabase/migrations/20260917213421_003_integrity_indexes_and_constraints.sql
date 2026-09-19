-- FluxPay 003 — Integridade referencial, constraints e indices
-- Corrige lacunas encontradas em 001/002. Nao remove dados.

-- ============================================
-- 1. API KEYS: lookup por hash (critico)
-- O middleware de auth busca por key_hash a cada request.
-- Sem indice era full table scan; sem unicidade o maybeSingle() podia quebrar.
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_org_active
  ON api_keys(organization_id) WHERE revoked_at IS NULL;

ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_prefix_format
  CHECK (key_prefix ~ '^(sk|pk)_(test|live)_');

-- ============================================
-- 2. CHECKS de valores monetarios
-- ============================================
ALTER TABLE payments
  ADD CONSTRAINT payments_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT payments_fee_non_negative CHECK (fee_amount >= 0),
  ADD CONSTRAINT payments_currency_format CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE refunds
  ADD CONSTRAINT refunds_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT refunds_currency_format CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE disputes
  ADD CONSTRAINT disputes_amount_positive CHECK (amount > 0);

ALTER TABLE checkout_sessions
  ADD CONSTRAINT checkout_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT checkout_currency_format CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE balance_transactions
  ADD CONSTRAINT balance_tx_type_valid
  CHECK (type IN ('charge', 'refund', 'fee', 'payout', 'adjustment', 'chargeback'));

-- ============================================
-- 3. Coerencia multi-tenant (organizacao + ambiente)
-- Impede que um payment aponte para um customer de OUTRA empresa
-- ou de outro ambiente (test x live). O codigo atual nao valida isso.
-- ============================================
CREATE OR REPLACE FUNCTION fluxpay_check_payment_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ok BOOLEAN;
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = NEW.customer_id
        AND c.organization_id = NEW.organization_id
        AND c.environment = NEW.environment
    ) INTO ok;
    IF NOT ok THEN
      RAISE EXCEPTION 'customer % nao pertence a organizacao % no ambiente %',
        NEW.customer_id, NEW.organization_id, NEW.environment
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.payment_method_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM payment_methods pm
      WHERE pm.id = NEW.payment_method_id
        AND pm.organization_id = NEW.organization_id
        AND pm.environment = NEW.environment
    ) INTO ok;
    IF NOT ok THEN
      RAISE EXCEPTION 'payment_method % nao pertence a organizacao % no ambiente %',
        NEW.payment_method_id, NEW.organization_id, NEW.environment
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payments_check_relations
  BEFORE INSERT OR UPDATE OF customer_id, payment_method_id, organization_id, environment
  ON payments
  FOR EACH ROW EXECUTE FUNCTION fluxpay_check_payment_relations();

-- refunds / disputes: o payment referenciado deve ser da mesma org e ambiente
CREATE OR REPLACE FUNCTION fluxpay_check_payment_child()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p RECORD;
BEGIN
  SELECT organization_id, environment, currency, amount
    INTO p FROM payments WHERE id = NEW.payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % inexistente', NEW.payment_id USING ERRCODE = '23503';
  END IF;

  IF p.organization_id <> NEW.organization_id OR p.environment <> NEW.environment THEN
    RAISE EXCEPTION 'payment % pertence a outra organizacao/ambiente', NEW.payment_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.currency <> p.currency THEN
    RAISE EXCEPTION 'moeda divergente do pagamento original (% x %)', NEW.currency, p.currency
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_refunds_check_payment
  BEFORE INSERT OR UPDATE OF payment_id, organization_id, environment
  ON refunds
  FOR EACH ROW EXECUTE FUNCTION fluxpay_check_payment_child();

CREATE TRIGGER trg_disputes_check_payment
  BEFORE INSERT OR UPDATE OF payment_id, organization_id, environment
  ON disputes
  FOR EACH ROW EXECUTE FUNCTION fluxpay_check_payment_child();

-- ============================================
-- 4. Protecao contra reembolso acima do valor do pagamento
-- ============================================
CREATE OR REPLACE FUNCTION fluxpay_check_refund_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  payment_amount BIGINT;
  refunded_total BIGINT;
BEGIN
  IF NEW.status = 'failed' OR NEW.status = 'canceled' THEN
    RETURN NEW;
  END IF;

  SELECT amount INTO payment_amount FROM payments WHERE id = NEW.payment_id FOR UPDATE;

  SELECT COALESCE(SUM(amount), 0) INTO refunded_total
  FROM refunds
  WHERE payment_id = NEW.payment_id
    AND status NOT IN ('failed', 'canceled')
    AND id <> NEW.id;

  IF refunded_total + NEW.amount > payment_amount THEN
    RAISE EXCEPTION 'reembolso total (%) excede o valor do pagamento (%)',
      refunded_total + NEW.amount, payment_amount
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_refunds_check_total
  BEFORE INSERT OR UPDATE OF amount, status
  ON refunds
  FOR EACH ROW EXECUTE FUNCTION fluxpay_check_refund_total();

-- ============================================
-- 5. Ledger: a transacao deve referenciar pagamento/reembolso da propria org
-- ============================================
CREATE OR REPLACE FUNCTION fluxpay_check_balance_tx()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.payment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM payments p
    WHERE p.id = NEW.payment_id
      AND p.organization_id = NEW.organization_id
      AND p.environment = NEW.environment
  ) THEN
    RAISE EXCEPTION 'payment % nao pertence a organizacao/ambiente da transacao', NEW.payment_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.refund_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM refunds r
    WHERE r.id = NEW.refund_id
      AND r.organization_id = NEW.organization_id
      AND r.environment = NEW.environment
  ) THEN
    RAISE EXCEPTION 'refund % nao pertence a organizacao/ambiente da transacao', NEW.refund_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_balance_tx_check
  BEFORE INSERT OR UPDATE
  ON balance_transactions
  FOR EACH ROW EXECUTE FUNCTION fluxpay_check_balance_tx();

-- ============================================
-- 6. Checkout sessions: customer/payment da mesma org+ambiente
-- ============================================
CREATE OR REPLACE FUNCTION fluxpay_check_checkout_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = NEW.customer_id
      AND c.organization_id = NEW.organization_id
      AND c.environment = NEW.environment
  ) THEN
    RAISE EXCEPTION 'customer % nao pertence a organizacao/ambiente da sessao', NEW.customer_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.payment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM payments p
    WHERE p.id = NEW.payment_id
      AND p.organization_id = NEW.organization_id
      AND p.environment = NEW.environment
  ) THEN
    RAISE EXCEPTION 'payment % nao pertence a organizacao/ambiente da sessao', NEW.payment_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_checkout_check_relations
  BEFORE INSERT OR UPDATE OF customer_id, payment_id, organization_id, environment
  ON checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION fluxpay_check_checkout_relations();

-- ============================================
-- 7. Webhook deliveries: endpoint e evento da mesma organizacao
-- ============================================
CREATE OR REPLACE FUNCTION fluxpay_check_webhook_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  endpoint_org UUID;
  event_org UUID;
BEGIN
  SELECT organization_id INTO endpoint_org FROM webhook_endpoints WHERE id = NEW.webhook_endpoint_id;
  SELECT organization_id INTO event_org FROM webhook_events WHERE id = NEW.webhook_event_id;

  IF endpoint_org IS DISTINCT FROM event_org THEN
    RAISE EXCEPTION 'endpoint e evento pertencem a organizacoes diferentes'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_webhook_delivery_check
  BEFORE INSERT OR UPDATE OF webhook_endpoint_id, webhook_event_id
  ON webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION fluxpay_check_webhook_delivery();

-- ============================================
-- 8. updated_at faltante em webhook_deliveries
-- ============================================
CREATE TRIGGER update_webhook_deliveries_updated_at
  BEFORE UPDATE ON webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 9. Indices alinhados com as queries reais do backend
-- ============================================
CREATE INDEX IF NOT EXISTS idx_payments_org_env_created
  ON payments(organization_id, environment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_org_env_created
  ON customers(organization_id, environment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_balance_tx_org_env_available
  ON balance_transactions(organization_id, environment, available_on);
CREATE INDEX IF NOT EXISTS idx_balance_tx_payment ON balance_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_refund ON balance_transactions(refund_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org_env_enabled
  ON webhook_endpoints(organization_id, environment) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_webhook_events_org_created
  ON webhook_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event
  ON webhook_deliveries(webhook_event_id);
CREATE INDEX IF NOT EXISTS idx_refunds_org_created
  ON refunds(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_org_created
  ON disputes(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_org_created
  ON api_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_api_key ON api_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_open_expires
  ON checkout_sessions(expires_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_payment ON checkout_sessions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_org_env ON payment_methods(organization_id, environment);
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by ON api_keys(created_by);

-- Indices redundantes / de baixa seletividade removidos
DROP INDEX IF EXISTS idx_organizations_slug;  -- slug ja e UNIQUE (indice duplicado)
DROP INDEX IF EXISTS idx_payments_env;        -- coberto por idx_payments_org_env_created
DROP INDEX IF EXISTS idx_customers_env;       -- coberto por idx_customers_org_env_created

-- ============================================
-- 10. search_path fixo nas funcoes SECURITY DEFINER (hardening)
-- ============================================
CREATE OR REPLACE FUNCTION get_user_organization_ids()
RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_org_member(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION has_org_role(org_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role = ANY(allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
