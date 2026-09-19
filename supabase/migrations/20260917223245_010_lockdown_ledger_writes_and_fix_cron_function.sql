-- FluxPay 010 — trava escritas diretas em tabelas de ledger + corrige funcao de cron
--
-- PROBLEMA 1 (achado ao construir o painel): as policies de INSERT/UPDATE de
-- payments/refunds/disputes/checkout_sessions permitiam que qualquer membro
-- admin/developer escrevesse diretamente nessas tabelas pelo Supabase client,
-- inclusive marcando um pagamento como "succeeded" sem o adquirente ter
-- processado nada. Toda escrita nessas tabelas passa a exigir service_role
-- (ou seja, só o backend, que aplica calculo de taxa, idempotencia e chamada
-- ao provider).
DROP POLICY IF EXISTS "payments_insert" ON payments;
DROP POLICY IF EXISTS "payments_update" ON payments;
DROP POLICY IF EXISTS "refunds_insert" ON refunds;
DROP POLICY IF EXISTS "refunds_update" ON refunds;
DROP POLICY IF EXISTS "disputes_insert" ON disputes;
DROP POLICY IF EXISTS "disputes_update" ON disputes;
DROP POLICY IF EXISTS "checkout_sessions_insert" ON checkout_sessions;
DROP POLICY IF EXISTS "checkout_sessions_update" ON checkout_sessions;

COMMENT ON TABLE payments IS 'Somente leitura para authenticated. Toda escrita (criacao, cancelamento, mudanca de status) passa pelo backend via service_role.';
COMMENT ON TABLE refunds IS 'Somente leitura para authenticated. Reembolsos sao criados pelo backend apos confirmacao do provider.';
COMMENT ON TABLE checkout_sessions IS 'Somente leitura para authenticated. Sessoes de checkout sao criadas pelo backend (calculo de expiracao).';

-- api_keys: geracao/hash da chave e feita pelo backend; o painel so pode
-- marcar revoked_at de uma chave ja existente (revogar), nunca criar ou apagar.
REVOKE INSERT, DELETE ON api_keys FROM authenticated;
REVOKE UPDATE ON api_keys FROM authenticated;
GRANT UPDATE (revoked_at) ON api_keys TO authenticated;

-- webhook_endpoints: o segredo (HMAC) e gerado pelo backend na criacao;
-- o painel pode editar url/eventos/descricao/habilitado, nunca o segredo.
REVOKE INSERT ON webhook_endpoints FROM authenticated;
REVOKE UPDATE ON webhook_endpoints FROM authenticated;
GRANT UPDATE (url, events, description, enabled) ON webhook_endpoints TO authenticated;

-- ============================================
-- PROBLEMA 2: fluxpay_expire_stale_records() foi movida para o schema
-- "fluxpay" na migration 008 para sair da API publica — mas isso tambem a
-- tira do alcance do supabase-js do backend (PostgREST so expoe o schema
-- "public"). Ela precisa ser chamada periodicamente por um job. Solucao:
-- volta para "public" (fica descobrivel em /rest/v1/rpc/...) mas com EXECUTE
-- revogado de anon/authenticated — quem nao for service_role recebe
-- "permission denied", entao a superficie e inofensiva mesmo exposta.
-- ============================================
ALTER FUNCTION fluxpay.fluxpay_expire_stale_records() SET SCHEMA public;
REVOKE EXECUTE ON FUNCTION public.fluxpay_expire_stale_records() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_expire_stale_records() TO service_role;
