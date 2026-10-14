-- Keep browser grants minimal; the event log is backend/service-role only.
REVOKE ALL PRIVILEGES ON TABLE public.push_subscriptions FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.push_notification_log FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_notification_log TO service_role;
