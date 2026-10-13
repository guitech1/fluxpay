-- Remove mutable search_path from simple timestamp trigger functions.
-- Their bodies only use NEW and pg_catalog.now(), so public need not be on the path.
ALTER FUNCTION public.support_set_updated_at() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.fluxpay_card_set_updated_at() SET search_path = pg_catalog, pg_temp;
