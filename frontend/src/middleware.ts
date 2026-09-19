import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Roda antes de toda navegacao (exceto assets estaticos — ver `matcher`).
 * Quatro responsabilidades:
 * 1. Renovar a sessao do Supabase (refresh token) e propagar os cookies.
 * 2. Bloquear /dashboard, /onboarding e /admin para quem nao esta logado, e
 *    mandar quem ja esta logado para longe de /login e /signup.
 * 3. Resolver qual organizacao o usuario esta operando (cookie fluxpay_org_id).
 * 4. Aplicar o MODO MANUTENCAO nas paginas do painel — server-side.
 *
 * Sobre o item 4: as paginas /dashboard/* sao Server Components que falam
 * direto com o Supabase, sem passar pelo backend Express. O guard do backend
 * (middleware/maintenance.ts) nunca ve essas requisicoes, entao antes disso o
 * modo manutencao fechava a API e deixava o painel funcionando. Aqui o
 * bloqueio acontece no servidor do Next, antes de qualquer pagina renderizar:
 * desligar o JavaScript do navegador nao contorna nada.
 */

interface MaintenanceStatus {
  enabled: boolean;
  message: string;
  scope: "all" | "api" | "dashboard";
  allow_admins: boolean;
  is_platform_admin: boolean;
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");
  // /admin tambem exige sessao. A verificacao de "e da equipe da FluxPay?"
  // nao acontece aqui e sim no layout do /admin (server) e em cada rota
  // /admin-api/* (backend) — o middleware so barra quem nem logado esta.
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/admin");

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // --- Modo manutencao (paginas do painel) -----------------------------
  // O ADM (/admin) NUNCA e bloqueado: e de la que a manutencao se desliga.
  const isDashboardPage =
    pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding");

  if (isDashboardPage) {
    const { data, error } = await supabase.rpc("fluxpay_maintenance_status");
    const status = (data ?? null) as MaintenanceStatus | null;

    // Se o RPC nao existir ou falhar, seguimos em frente: uma falha de leitura
    // de configuracao nao pode derrubar o painel inteiro.
    if (!error && status?.enabled && (status.scope === "all" || status.scope === "dashboard")) {
      const bypass = status.allow_admins && status.is_platform_admin;

      if (!bypass) {
        const url = request.nextUrl.clone();
        url.pathname = "/manutencao";
        url.search = "";
        const redirect = NextResponse.redirect(url);
        // Mantem os cookies de sessao renovados nesta mesma resposta.
        supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
        return redirect;
      }
    }
  }
  // ---------------------------------------------------------------------

  if (user && pathname.startsWith("/dashboard")) {
    const hasOrgCookie = request.cookies.get("fluxpay_org_id")?.value;

    if (!hasOrgCookie) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (membership) {
        supabaseResponse.cookies.set("fluxpay_org_id", membership.organization_id, {
          path: "/",
          sameSite: "lax",
        });
      } else {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  // Fora do middleware: assets do Next, imagens, e os arquivos que o PWA
  // precisa servir sem interferencia (manifest, service worker, offline,
  // icones, robots). Passar o sw.js pelo middleware quebra o escopo do
  // service worker.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|robots.txt|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
