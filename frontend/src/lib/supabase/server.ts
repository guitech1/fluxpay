import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Formato que o @supabase/ssr manda para `setAll` — sem isso o parâmetro
 * fica implicitamente `any`, e o build de produção do Next (strict) recusa. */
type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Cliente Supabase para Server Components e Route Handlers. Le a sessao
 * do usuario a partir dos cookies (gerenciados pelo middleware.ts).
 *
 * Chamar de dentro de um Server Component nao permite escrever cookies
 * (o try/catch abaixo engole esse erro de propósito) — quem renova a
 * sessao e o middleware, que roda antes em toda navegacao.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component nao pode setar cookie — sem problema, o
            // middleware cuida da renovacao de sessao.
          }
        },
      },
    }
  );
}
