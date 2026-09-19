-- FluxPay Row Level Security Policies
-- Ensures organization isolation

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: get user's organization ids
CREATE OR REPLACE FUNCTION get_user_organization_ids()
RETURNS SETOF UUID AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is member of org
CREATE OR REPLACE FUNCTION is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check role
CREATE OR REPLACE FUNCTION has_org_role(org_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role = ANY(allowed_roles)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- ORGANIZATIONS
-- ============================================
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (id IN (SELECT get_user_organization_ids()));

CREATE POLICY "Owners can update their organizations"
  ON organizations FOR UPDATE
  USING (has_org_role(id, ARRAY['owner', 'admin']));

CREATE POLICY "Authenticated users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- USERS
-- ============================================
CREATE POLICY "Users can view themselves"
  ON users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update themselves"
  ON users FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert themselves"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

-- ============================================
-- ORGANIZATION MEMBERS
-- ============================================
CREATE POLICY "Members can view org members"
  ON organization_members FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Owners/admins can manage members"
  ON organization_members FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- ============================================
-- API KEYS
-- ============================================
CREATE POLICY "Members can view api keys"
  ON api_keys FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can manage api keys"
  ON api_keys FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'developer']));

-- ============================================
-- CUSTOMERS
-- ============================================
CREATE POLICY "Members can view customers"
  ON customers FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Members can manage customers"
  ON customers FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'developer']));

-- ============================================
-- PAYMENT METHODS
-- ============================================
CREATE POLICY "Members can view payment methods"
  ON payment_methods FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Members can manage payment methods"
  ON payment_methods FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'developer']));

-- ============================================
-- PAYMENTS
-- ============================================
CREATE POLICY "Members can view payments"
  ON payments FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Members can manage payments"
  ON payments FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'developer']));

-- ============================================
-- REFUNDS
-- ============================================
CREATE POLICY "Members can view refunds"
  ON refunds FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Members can manage refunds"
  ON refunds FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'developer']));

-- ============================================
-- DISPUTES
-- ============================================
CREATE POLICY "Members can view disputes"
  ON disputes FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Members can manage disputes"
  ON disputes FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'developer']));

-- ============================================
-- BALANCE TRANSACTIONS
-- ============================================
CREATE POLICY "Members can view balance transactions"
  ON balance_transactions FOR SELECT
  USING (is_org_member(organization_id));

-- ============================================
-- WEBHOOKS
-- ============================================
CREATE POLICY "Members can view webhook endpoints"
  ON webhook_endpoints FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can manage webhook endpoints"
  ON webhook_endpoints FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'developer']));

CREATE POLICY "Members can view webhook events"
  ON webhook_events FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Members can view webhook deliveries"
  ON webhook_deliveries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM webhook_endpoints we
      WHERE we.id = webhook_deliveries.webhook_endpoint_id
        AND is_org_member(we.organization_id)
    )
  );

-- ============================================
-- CHECKOUT SESSIONS
-- ============================================
CREATE POLICY "Members can view checkout sessions"
  ON checkout_sessions FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Members can manage checkout sessions"
  ON checkout_sessions FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'developer']));

-- ============================================
-- API LOGS
-- ============================================
CREATE POLICY "Admins can view api logs"
  ON api_logs FOR SELECT
  USING (is_org_member(organization_id));

-- Service role bypasses RLS (for backend API using service key)
-- Dashboard uses authenticated user JWT
