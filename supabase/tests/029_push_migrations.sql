-- Regression checks for Web Push RLS/grants and disabled ProfanusPay seed.
DO $$
DECLARE
  policy_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'push_subscriptions'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'push_subscriptions must have RLS enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'push_notification_log'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'push_notification_log must have RLS enabled';
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'push_subscriptions';
  IF policy_count <> 4 THEN
    RAISE EXCEPTION 'expected 4 owner-scoped push_subscriptions policies, got %', policy_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_notification_log'
  ) THEN
    RAISE EXCEPTION 'push_notification_log must not expose browser-role policies';
  END IF;

  IF NOT (
    has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT')
    AND has_table_privilege('authenticated', 'public.push_subscriptions', 'INSERT')
    AND has_table_privilege('authenticated', 'public.push_subscriptions', 'UPDATE')
    AND has_table_privilege('authenticated', 'public.push_subscriptions', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'authenticated must have CRUD on push_subscriptions';
  END IF;

  IF has_table_privilege('anon', 'public.push_subscriptions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.push_subscriptions', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.push_subscriptions', 'TRIGGER') THEN
    RAISE EXCEPTION 'push_subscriptions has excessive anon/authenticated grants';
  END IF;

  IF has_table_privilege('anon', 'public.push_notification_log', 'SELECT')
     OR has_table_privilege('authenticated', 'public.push_notification_log', 'SELECT')
     OR has_table_privilege('authenticated', 'public.push_notification_log', 'INSERT') THEN
    RAISE EXCEPTION 'push_notification_log must remain backend-only';
  END IF;

  IF NOT (
    has_table_privilege('service_role', 'public.push_notification_log', 'SELECT')
    AND has_table_privilege('service_role', 'public.push_notification_log', 'INSERT')
    AND has_table_privilege('service_role', 'public.push_notification_log', 'UPDATE')
    AND has_table_privilege('service_role', 'public.push_notification_log', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'service_role must have CRUD on push_notification_log';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.acquirer_cost_config
    WHERE acquirer_id = 'profanuspay'
      AND cost_percent = 5.0
      AND cost_fixed_cents = 0
      AND enabled = false
      AND priority = 15
  ) THEN
    RAISE EXCEPTION 'ProfanusPay must be seeded but disabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.support_set_updated_at()'::regprocedure
      AND proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.fluxpay_card_set_updated_at()'::regprocedure
      AND proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
  ) THEN
    RAISE EXCEPTION 'timestamp trigger functions must pin search_path';
  END IF;
END $$;

SELECT 'push migrations and grants passed' AS result;
