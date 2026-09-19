-- FluxPay 012 — status de manutencao legivel pelo frontend (server-side)
--
-- Por que existe: as paginas /dashboard/* sao Server Components e consultam o
-- Supabase DIRETO, sem passar pelo backend Express. O maintenanceGuard do
-- backend, portanto, nunca ve essas requisicoes — na pratica, o modo
-- manutencao bloqueava a API e deixava o painel aberto.
--
-- platform_settings e fechada para anon/authenticated (migration 011), e
-- continua fechada: quem le a configuracao e esta funcao SECURITY DEFINER,
-- que devolve SOMENTE o que pode ser publico (ligado/desligado, mensagem,
-- escopo) mais a resposta de "quem esta perguntando e da equipe?" — sempre
-- sobre o proprio auth.uid(), nunca sobre terceiros. A lista de
-- administradores continua invisivel.
--
-- Quem usa: frontend/src/middleware.ts (Next.js, server-side) e a pagina
-- /manutencao. O backend Express continua lendo platform_settings com
-- service_role, como antes.

CREATE OR REPLACE FUNCTION public.fluxpay_maintenance_status()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'enabled',          COALESCE((s.v ->> 'enabled')::boolean, false),
    'message',          COALESCE(s.v ->> 'message', 'A FluxPay está em manutenção. Voltamos em instantes.'),
    'scope',            COALESCE(s.v ->> 'scope', 'all'),
    'allow_admins',     COALESCE((s.v ->> 'allow_admins')::boolean, true),
    'is_platform_admin', EXISTS (
      SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
    )
  )
  FROM (
    SELECT (SELECT value FROM public.platform_settings WHERE key = 'maintenance') AS v
  ) s;
$$;

COMMENT ON FUNCTION public.fluxpay_maintenance_status() IS
  'Status publico do modo manutencao + se o chamador e admin da plataforma. Usado pelo middleware do Next para bloquear /dashboard/* server-side.';

REVOKE EXECUTE ON FUNCTION public.fluxpay_maintenance_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fluxpay_maintenance_status() TO anon, authenticated, service_role;
