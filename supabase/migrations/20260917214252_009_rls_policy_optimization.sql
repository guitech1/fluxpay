-- FluxPay 009 — otimizacao das policies (mesmas regras de acesso, menor custo)
--
-- 1) auth.uid() envolvido em (SELECT ...) para ser avaliado 1x por query e nao 1x por linha
-- 2) policies FOR ALL divididas em INSERT/UPDATE/DELETE: a FOR ALL tambem valia para
--    SELECT, fazendo cada leitura rodar duas policies permissivas
-- 3) policies restritas a "TO authenticated" (anon nunca teve acesso mesmo)
-- 4) indices nas FKs que faltavam

-- ============================================ ORGANIZATIONS
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
DROP POLICY IF EXISTS "Owners can update their organizations" ON organizations;
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON organizations;
DROP POLICY IF EXISTS "Owners can delete their organizations" ON organizations;

CREATE POLICY "org_select" ON organizations FOR SELECT TO authenticated
  USING (id IN (SELECT fluxpay.get_user_organization_ids()) OR created_by = (SELECT auth.uid()));
CREATE POLICY "org_insert" ON organizations FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (created_by IS NULL OR created_by = (SELECT auth.uid())));
CREATE POLICY "org_update" ON organizations FOR UPDATE TO authenticated
  USING (fluxpay.has_org_role(id, ARRAY['owner','admin']))
  WITH CHECK (fluxpay.has_org_role(id, ARRAY['owner','admin']));
CREATE POLICY "org_delete" ON organizations FOR DELETE TO authenticated
  USING (fluxpay.has_org_role(id, ARRAY['owner']));

-- ============================================ USERS
DROP POLICY IF EXISTS "Users can view themselves" ON users;
DROP POLICY IF EXISTS "Members can view users in same organization" ON users;
DROP POLICY IF EXISTS "Users can update themselves" ON users;
DROP POLICY IF EXISTS "Users can insert themselves" ON users;

CREATE POLICY "users_select" ON users FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = users.id
        AND om.organization_id IN (SELECT fluxpay.get_user_organization_ids())
    )
  );
CREATE POLICY "users_insert" ON users FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY "users_update" ON users FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

-- ============================================ ORGANIZATION MEMBERS
DROP POLICY IF EXISTS "Members can view org members" ON organization_members;
DROP POLICY IF EXISTS "Owners/admins can manage members" ON organization_members;

CREATE POLICY "org_members_select" ON organization_members FOR SELECT TO authenticated
  USING (fluxpay.is_org_member(organization_id));
CREATE POLICY "org_members_insert" ON organization_members FOR INSERT TO authenticated
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin']));
CREATE POLICY "org_members_update" ON organization_members FOR UPDATE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin']))
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin']));
CREATE POLICY "org_members_delete" ON organization_members FOR DELETE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin']));

-- ============================================ API KEYS
DROP POLICY IF EXISTS "Members can view api keys" ON api_keys;
DROP POLICY IF EXISTS "Admins can manage api keys" ON api_keys;

CREATE POLICY "api_keys_select" ON api_keys FOR SELECT TO authenticated
  USING (fluxpay.is_org_member(organization_id));
CREATE POLICY "api_keys_insert" ON api_keys FOR INSERT TO authenticated
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));
CREATE POLICY "api_keys_update" ON api_keys FOR UPDATE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']))
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));
CREATE POLICY "api_keys_delete" ON api_keys FOR DELETE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin']));

-- ============================================ CUSTOMERS
DROP POLICY IF EXISTS "Members can view customers" ON customers;
DROP POLICY IF EXISTS "Members can manage customers" ON customers;

CREATE POLICY "customers_select" ON customers FOR SELECT TO authenticated
  USING (fluxpay.is_org_member(organization_id));
CREATE POLICY "customers_insert" ON customers FOR INSERT TO authenticated
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));
CREATE POLICY "customers_update" ON customers FOR UPDATE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']))
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));
CREATE POLICY "customers_delete" ON customers FOR DELETE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin']));

-- ============================================ PAYMENT METHODS
DROP POLICY IF EXISTS "Members can view payment methods" ON payment_methods;
DROP POLICY IF EXISTS "Members can manage payment methods" ON payment_methods;

CREATE POLICY "payment_methods_select" ON payment_methods FOR SELECT TO authenticated
  USING (fluxpay.is_org_member(organization_id));
CREATE POLICY "payment_methods_insert" ON payment_methods FOR INSERT TO authenticated
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));
CREATE POLICY "payment_methods_update" ON payment_methods FOR UPDATE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']))
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));
CREATE POLICY "payment_methods_delete" ON payment_methods FOR DELETE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin']));

-- ============================================ PAYMENTS
DROP POLICY IF EXISTS "Members can view payments" ON payments;
DROP POLICY IF EXISTS "Members can manage payments" ON payments;

CREATE POLICY "payments_select" ON payments FOR SELECT TO authenticated
  USING (fluxpay.is_org_member(organization_id));
CREATE POLICY "payments_insert" ON payments FOR INSERT TO authenticated
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));
CREATE POLICY "payments_update" ON payments FOR UPDATE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']))
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));
-- pagamentos nao sao apagaveis pelo dashboard (integridade contabil)

-- ============================================ REFUNDS
DROP POLICY IF EXISTS "Members can view refunds" ON refunds;
DROP POLICY IF EXISTS "Members can manage refunds" ON refunds;

CREATE POLICY "refunds_select" ON refunds FOR SELECT TO authenticated
  USING (fluxpay.is_org_member(organization_id));
CREATE POLICY "refunds_insert" ON refunds FOR INSERT TO authenticated
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));
CREATE POLICY "refunds_update" ON refunds FOR UPDATE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']))
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));

-- ============================================ DISPUTES
DROP POLICY IF EXISTS "Members can view disputes" ON disputes;
DROP POLICY IF EXISTS "Members can manage disputes" ON disputes;

CREATE POLICY "disputes_select" ON disputes FOR SELECT TO authenticated
  USING (fluxpay.is_org_member(organization_id));
CREATE POLICY "disputes_insert" ON disputes FOR INSERT TO authenticated
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));
CREATE POLICY "disputes_update" ON disputes FOR UPDATE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']))
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));

-- ============================================ WEBHOOK ENDPOINTS
DROP POLICY IF EXISTS "Members can view webhook endpoints" ON webhook_endpoints;
DROP POLICY IF EXISTS "Admins can manage webhook endpoints" ON webhook_endpoints;

CREATE POLICY "webhook_endpoints_select" ON webhook_endpoints FOR SELECT TO authenticated
  USING (fluxpay.is_org_member(organization_id));
CREATE POLICY "webhook_endpoints_insert" ON webhook_endpoints FOR INSERT TO authenticated
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));
CREATE POLICY "webhook_endpoints_update" ON webhook_endpoints FOR UPDATE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']))
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));
CREATE POLICY "webhook_endpoints_delete" ON webhook_endpoints FOR DELETE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));

-- ============================================ CHECKOUT SESSIONS
DROP POLICY IF EXISTS "Members can view checkout sessions" ON checkout_sessions;
DROP POLICY IF EXISTS "Members can manage checkout sessions" ON checkout_sessions;

CREATE POLICY "checkout_sessions_select" ON checkout_sessions FOR SELECT TO authenticated
  USING (fluxpay.is_org_member(organization_id));
CREATE POLICY "checkout_sessions_insert" ON checkout_sessions FOR INSERT TO authenticated
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));
CREATE POLICY "checkout_sessions_update" ON checkout_sessions FOR UPDATE TO authenticated
  USING (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']))
  WITH CHECK (fluxpay.has_org_role(organization_id, ARRAY['owner','admin','developer']));

-- ============================================ Somente leitura para o dashboard
DROP POLICY IF EXISTS "Members can view balance transactions" ON balance_transactions;
CREATE POLICY "balance_tx_select" ON balance_transactions FOR SELECT TO authenticated
  USING (fluxpay.is_org_member(organization_id));

DROP POLICY IF EXISTS "Members can view webhook events" ON webhook_events;
CREATE POLICY "webhook_events_select" ON webhook_events FOR SELECT TO authenticated
  USING (fluxpay.is_org_member(organization_id));

DROP POLICY IF EXISTS "Members can view webhook deliveries" ON webhook_deliveries;
CREATE POLICY "webhook_deliveries_select" ON webhook_deliveries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM webhook_endpoints we
    WHERE we.id = webhook_deliveries.webhook_endpoint_id
      AND fluxpay.is_org_member(we.organization_id)
  ));

DROP POLICY IF EXISTS "Admins can view api logs" ON api_logs;
CREATE POLICY "api_logs_select" ON api_logs FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND fluxpay.is_org_member(organization_id));

DROP POLICY IF EXISTS "Members can view provider events" ON provider_events;
CREATE POLICY "provider_events_select" ON provider_events FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND fluxpay.is_org_member(organization_id));

-- ============================================ FKs sem indice de cobertura
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_customer ON checkout_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_method ON payments(payment_method_id);
