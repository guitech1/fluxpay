-- ============================================================
-- 019 — Sistema de suporte ao cliente (FluxPay)
-- Conversas, mensagens, contexto de transacao e RLS.
-- ============================================================

-- Status do atendimento (consistente com enums do projeto)
DO $$ BEGIN
  CREATE TYPE support_conversation_status AS ENUM (
    'open',
    'in_progress',
    'waiting_customer',
    'resolved'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE support_sender_type AS ENUM (
    'customer',
    'agent',
    'system',
    'assistant'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE support_message_type AS ENUM (
    'text',
    'system_event',
    'assistant_reply',
    'option_select'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- support_conversations
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_conversations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject           text NOT NULL DEFAULT 'Atendimento',
  status            support_conversation_status NOT NULL DEFAULT 'open',
  assigned_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  environment       text NOT NULL DEFAULT 'test' CHECK (environment IN ('test', 'live')),
  last_message_at   timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  customer_unread_count integer NOT NULL DEFAULT 0,
  agent_unread_count    integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_support_conversations_user
  ON support_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_org
  ON support_conversations (organization_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_status
  ON support_conversations (status);
CREATE INDEX IF NOT EXISTS idx_support_conversations_assigned
  ON support_conversations (assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_created
  ON support_conversations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_conversations_last_msg
  ON support_conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_conversations_env_status
  ON support_conversations (environment, status);

-- ------------------------------------------------------------
-- support_messages
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  sender_type       support_sender_type NOT NULL,
  sender_id         uuid,
  message_type      support_message_type NOT NULL DEFAULT 'text',
  content           text NOT NULL,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_conversation
  ON support_messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_support_messages_sender
  ON support_messages (sender_type, sender_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created
  ON support_messages (created_at DESC);

-- ------------------------------------------------------------
-- support_conversation_context (transacao / metadata)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_conversation_context (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  payment_id        uuid REFERENCES payments(id) ON DELETE SET NULL,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_context_conversation
  ON support_conversation_context (conversation_id);
CREATE INDEX IF NOT EXISTS idx_support_context_payment
  ON support_conversation_context (payment_id);

-- updated_at trigger (reutiliza padrao se existir; senao cria simples)
CREATE OR REPLACE FUNCTION support_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_conversations_updated ON support_conversations;
CREATE TRIGGER trg_support_conversations_updated
  BEFORE UPDATE ON support_conversations
  FOR EACH ROW EXECUTE FUNCTION support_set_updated_at();

DROP TRIGGER IF EXISTS trg_support_messages_updated ON support_messages;
CREATE TRIGGER trg_support_messages_updated
  BEFORE UPDATE ON support_messages
  FOR EACH ROW EXECUTE FUNCTION support_set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- Cliente: so as proprias conversas (user_id = auth.uid())
-- ADM: acesso via service_role no backend (platformAdminAuth)
-- ------------------------------------------------------------
ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_conversation_context ENABLE ROW LEVEL SECURITY;

-- Clientes leem/escrevem apenas as proprias conversas
DROP POLICY IF EXISTS support_conversations_select_own ON support_conversations;
CREATE POLICY support_conversations_select_own ON support_conversations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS support_conversations_insert_own ON support_conversations;
CREATE POLICY support_conversations_insert_own ON support_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS support_conversations_update_own ON support_conversations;
CREATE POLICY support_conversations_update_own ON support_conversations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Mensagens: cliente so da propria conversa
DROP POLICY IF EXISTS support_messages_select_own ON support_messages;
CREATE POLICY support_messages_select_own ON support_messages
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM support_conversations WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS support_messages_insert_own ON support_messages;
CREATE POLICY support_messages_insert_own ON support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'customer'
    AND sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM support_conversations WHERE user_id = auth.uid()
    )
  );

-- Contexto: leitura apenas da propria conversa
DROP POLICY IF EXISTS support_context_select_own ON support_conversation_context;
CREATE POLICY support_context_select_own ON support_conversation_context
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM support_conversations WHERE user_id = auth.uid()
    )
  );

-- service_role bypassa RLS (backend usa supabaseAdmin)

-- Realtime (Supabase): publica mudancas para o cliente e ADM
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE support_conversations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE support_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

COMMENT ON TABLE support_conversations IS 'Atendimentos de suporte FluxPay';
COMMENT ON TABLE support_messages IS 'Mensagens de suporte (cliente, agente, sistema, assistente)';
COMMENT ON TABLE support_conversation_context IS 'Contexto opcional (pagamento, metadata) do atendimento';
