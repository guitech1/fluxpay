import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para Client Components. Usa a anon key — a proteção
 * dos dados vem inteiramente das políticas RLS do banco (ver migrations
 * 002/004/009/010), nunca desta chave.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
