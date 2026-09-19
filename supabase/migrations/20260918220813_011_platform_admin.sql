-- FluxPay 011 — administracao da plataforma (ADM)
--
-- Tudo aqui e sobre a FluxPay como plataforma, nao sobre uma organizacao:
--   - quem e administrador da plataforma (platform_admins)
--   - o que cada administrador fez (admin_audit_log)
--   - configuracoes globais, incluindo modo manutencao (platform_settings)
--   - estados de conta alem de "active" (suspended/banned/disabled)
--
-- Principio de acesso: o painel ADM NAO le essas tabelas pelo navegador. Toda
-- leitura e escrita administrativa passa pelo backend com service_role, que
-- confere a identidade do administrador antes. A RLS abaixo e a segunda
-- barreira: mesmo que alguem forje o cookie/URL e use o Supabase client com a
-- anon key, so consegue enxergar a propria linha de platform_admins.

-- ============================================
-- 1. Estados de conta de uma organizacao
-- ============================================
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_status_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_status_check
  CHECK (status IN ('active', 'pending', 'suspended', 'banned', 'disabled'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN organizations.status IS
  'active = opera normalmente; pending = aguardando liberacao; suspended = bloqueio temporario (leitura no painel, API bloqueada); banned = bloqueio definitivo; disabled = desativada a pedido.';

-- ============================================
-- 2. Administradores da plataforma
-- ============================================
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin', 'support')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE platform_admins IS
  'Equipe da FluxPay. superadmin: tudo, inclusive manutencao e gestao de admins. admin: acoes sobre contas. support: somente leitura.';

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- Cada um so enxerga a propria linha: e o suficiente para o painel ADM
-- descobrir "sou admin?" sem expor a lista da equipe ao navegador.
CREATE POLICY "Admins can see their own admin row"
  ON platform_admins FOR SELECT
  USING (user_id = auth.uid());

-- Ninguem promove ninguem pelo navegador: INSERT/UPDATE/DELETE so service_role.
REVOKE INSERT, UPDATE, DELETE ON platform_admins FROM authenticated, anon;

-- ============================================
-- 3. Auditoria das acoes administrativas
-- ============================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  target_label TEXT,
  reason TEXT,
  state_before JSONB,
  state_after JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_log(target_type, target_id);

COMMENT ON TABLE admin_audit_log IS
  'Trilha de auditoria do ADM: quem fez, o que fez, sobre o que, quando, por que e o estado antes/depois. Append-only.';

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
-- Sem policy para authenticated/anon: a trilha so e lida pelo backend
-- (service_role). Nem o proprio administrador apaga a propria trilha.
REVOKE ALL ON admin_audit_log FROM authenticated, anon;

-- ============================================
-- 4. Configuracoes globais da plataforma
-- ============================================
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_settings FROM authenticated, anon;

INSERT INTO platform_settings (key, value)
VALUES
  ('maintenance', jsonb_build_object(
     'enabled', false,
     'message', 'A FluxPay está em manutenção. Voltamos em instantes.',
     'allow_admins', true,
     'scope', 'all'
   )),
  ('limits', jsonb_build_object(
     'max_payment_amount_cents', 100000000,
     'min_payment_amount_cents', 100
   ))
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE platform_settings IS
  'Configuracoes globais. A chave "maintenance" controla o modo manutencao: enabled, message, allow_admins (ADM continua entrando) e scope (all | api | dashboard).';

-- ============================================
-- 5. Helper de autorizacao (schema fluxpay, fora da API REST publica)
-- ============================================
CREATE OR REPLACE FUNCTION fluxpay.is_platform_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, fluxpay, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = p_user_id);
$$;

REVOKE EXECUTE ON FUNCTION fluxpay.is_platform_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fluxpay.is_platform_admin(UUID) TO authenticated, service_role;

-- ============================================
-- 6. Metricas agregadas da plataforma (uma ida ao banco em vez de N)
-- ============================================
CREATE OR REPLACE FUNCTION public.fluxpay_platform_overview(p_environment environment_type)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'organizations', (SELECT COUNT(*) FROM organizations),
    'organizations_active', (SELECT COUNT(*) FROM organizations WHERE status = 'active'),
    'organizations_blocked', (SELECT COUNT(*) FROM organizations WHERE status IN ('suspended', 'banned', 'disabled')),
    'users', (SELECT COUNT(*) FROM users),
    'payments_total', (SELECT COUNT(*) FROM payments WHERE environment = p_environment),
    'payments_succeeded', (SELECT COUNT(*) FROM payments WHERE environment = p_environment AND status = 'succeeded'),
    'payments_pending', (SELECT COUNT(*) FROM payments WHERE environment = p_environment AND status IN ('pending', 'processing')),
    'volume_succeeded_cents', (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE environment = p_environment AND status = 'succeeded'),
    'fees_cents', (SELECT COALESCE(SUM(fee_amount), 0) FROM payments WHERE environment = p_environment AND status = 'succeeded'),
    'volume_24h_cents', (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE environment = p_environment AND status = 'succeeded' AND created_at > NOW() - INTERVAL '24 hours'),
    'refunds', (SELECT COUNT(*) FROM refunds WHERE environment = p_environment),
    'disputes_open', (SELECT COUNT(*) FROM disputes WHERE environment = p_environment AND status IN ('needs_response', 'under_review')),
    'webhook_failures', (SELECT COUNT(*) FROM webhook_deliveries WHERE status IN ('failed', 'retrying')),
    'provider_events_unprocessed', (SELECT COUNT(*) FROM provider_events WHERE processed_at IS NULL),
    'api_errors_24h', (SELECT COUNT(*) FROM api_logs WHERE environment = p_environment AND status_code >= 400 AND created_at > NOW() - INTERVAL '24 hours')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fluxpay_platform_overview(environment_type) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_platform_overview(environment_type) TO service_role;

-- ============================================
-- 7. Bloqueio de conta tambem no nivel do banco
-- Uma organizacao suspensa/banida/desativada nao cria cobranca nova nem por
-- API key nem por engano do backend: o trigger recusa o INSERT.
-- ============================================
CREATE OR REPLACE FUNCTION public.fluxpay_block_inactive_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  org_status TEXT;
BEGIN
  SELECT status INTO org_status FROM organizations WHERE id = NEW.organization_id;

  IF org_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Organizacao % nao esta ativa (status: %). Cobrancas estao bloqueadas.',
      NEW.organization_id, org_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_block_inactive_org ON payments;
CREATE TRIGGER trg_payments_block_inactive_org
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION public.fluxpay_block_inactive_organization();

DROP TRIGGER IF EXISTS trg_checkout_block_inactive_org ON checkout_sessions;
CREATE TRIGGER trg_checkout_block_inactive_org
  BEFORE INSERT ON checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fluxpay_block_inactive_organization();

-- ============================================
-- 8. Primeiro administrador
-- Rode uma vez, trocando o e-mail, depois de criar a conta pelo /signup:
--
--   INSERT INTO platform_admins (user_id, role, note)
--   SELECT id, 'superadmin', 'primeiro admin'
--   FROM public.users WHERE email = 'voce@suaempresa.com'
--   ON CONFLICT (user_id) DO NOTHING;
--
-- Nao ha promocao automatica de propósito: ninguem vira admin da plataforma
-- sem alguem com acesso ao banco decidir isso.
-- ============================================
