-- RLS and least-privilege regression checks; disposable PostgreSQL only.
DO $test$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'public.payments',
    'public.balance_transactions',
    'public.refunds',
    'public.withdrawal_requests'
  ] LOOP
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = table_name::regclass) THEN
      RAISE EXCEPTION 'RLS must be enabled on %', table_name;
    END IF;
    IF has_table_privilege('anon', table_name, 'SELECT')
       OR has_table_privilege('anon', table_name, 'INSERT')
       OR has_table_privilege('anon', table_name, 'UPDATE')
       OR has_table_privilege('anon', table_name, 'DELETE') THEN
      RAISE EXCEPTION 'anon unexpectedly has table privileges on %', table_name;
    END IF;
    IF NOT has_table_privilege('authenticated', table_name, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated must retain scoped SELECT on %', table_name;
    END IF;
    IF has_table_privilege('authenticated', table_name, 'INSERT')
       OR has_table_privilege('authenticated', table_name, 'UPDATE')
       OR has_table_privilege('authenticated', table_name, 'DELETE') THEN
      RAISE EXCEPTION 'authenticated unexpectedly has write privileges on %', table_name;
    END IF;
  END LOOP;

  IF has_function_privilege('anon',
       'public.fluxpay_confirm_pix_payment(uuid,uuid,public.environment_type)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fluxpay_confirm_pix_payment(uuid,uuid,public.environment_type)', 'EXECUTE') THEN
    RAISE EXCEPTION 'browser roles must not execute PIX confirmation RPC';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.fluxpay_confirm_pix_payment(uuid,uuid,public.environment_type)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute PIX confirmation RPC';
  END IF;
  IF has_function_privilege('anon',
       'public.fluxpay_create_withdrawal_request(uuid,public.environment_type,uuid,bigint,bigint,bigint,text,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fluxpay_create_withdrawal_request(uuid,public.environment_type,uuid,bigint,bigint,bigint,text,text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'browser roles must not execute withdrawal creation RPC';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.fluxpay_create_withdrawal_request(uuid,public.environment_type,uuid,bigint,bigint,bigint,text,text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute withdrawal creation RPC';
  END IF;
END
$test$;

SELECT 'PASS: RLS enabled; browser roles have no financial writes or mutation RPC execution; service_role has required RPC execution.' AS result;
