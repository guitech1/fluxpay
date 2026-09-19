-- FluxPay 008 — tira as funcoes internas da superficie da API REST
--
-- Toda funcao em "public" vira endpoint /rest/v1/rpc/<nome> no PostgREST.
-- Funcoes de trigger e helpers de RLS nao devem ser chamaveis de fora.
-- Movendo para o schema "fluxpay" (nao exposto), as policies e triggers
-- continuam funcionando (a referencia e por OID), mas o endpoint some.

CREATE SCHEMA IF NOT EXISTS fluxpay;
COMMENT ON SCHEMA fluxpay IS 'Funcoes internas do FluxPay. Nao exposto via PostgREST.';

-- helpers de RLS (precisam ser executaveis pelos roles para as policies rodarem)
ALTER FUNCTION public.get_user_organization_ids()            SET SCHEMA fluxpay;
ALTER FUNCTION public.is_org_member(UUID)                    SET SCHEMA fluxpay;
ALTER FUNCTION public.has_org_role(UUID, TEXT[])             SET SCHEMA fluxpay;

-- funcoes de trigger
ALTER FUNCTION public.update_updated_at_column()             SET SCHEMA fluxpay;
ALTER FUNCTION public.handle_new_user()                      SET SCHEMA fluxpay;
ALTER FUNCTION public.handle_user_email_change()             SET SCHEMA fluxpay;
ALTER FUNCTION public.handle_new_organization()              SET SCHEMA fluxpay;
ALTER FUNCTION public.fluxpay_set_organization_creator()     SET SCHEMA fluxpay;
ALTER FUNCTION public.fluxpay_protect_last_owner()           SET SCHEMA fluxpay;
ALTER FUNCTION public.fluxpay_check_payment_relations()      SET SCHEMA fluxpay;
ALTER FUNCTION public.fluxpay_check_payment_child()          SET SCHEMA fluxpay;
ALTER FUNCTION public.fluxpay_check_refund_total()           SET SCHEMA fluxpay;
ALTER FUNCTION public.fluxpay_check_balance_tx()             SET SCHEMA fluxpay;
ALTER FUNCTION public.fluxpay_check_checkout_relations()     SET SCHEMA fluxpay;
ALTER FUNCTION public.fluxpay_check_webhook_delivery()       SET SCHEMA fluxpay;

-- rotina de manutencao: so o backend (service_role) deve chamar
ALTER FUNCTION public.fluxpay_expire_stale_records()         SET SCHEMA fluxpay;

REVOKE ALL ON SCHEMA fluxpay FROM PUBLIC;
GRANT USAGE ON SCHEMA fluxpay TO authenticated, anon, service_role;

REVOKE EXECUTE ON FUNCTION fluxpay.fluxpay_expire_stale_records() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fluxpay.fluxpay_expire_stale_records() TO service_role;

-- funcao do proprio Supabase (event trigger): nao precisa ser chamavel via REST
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
