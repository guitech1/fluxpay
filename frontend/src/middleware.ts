import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options: CookieOptions };

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
        setAll(cookiesToSet: CookieToSet[]) {
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
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/verificar-identidade");

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

  if (pathname === "/docs" || pathname.startsWith("/docs/")) {
    const url = request.nextUrl.clone();
    url.search = "";
    if (user) {
      url.pathname = "/dashboard/api";
    } else {
      url.pathname = "/login";
      url.searchParams.set("next", "/dashboard/api");
    }
    return NextResponse.redirect(url);
  }

  const isDashboardPage =
    pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding");

  if (isDashboardPage) {
    const { data, error } = await supabase.rpc("fluxpay_maintenance_status");
    const status = (data ?? null) as MaintenanceStatus | null;

    if (!error && status?.enabled && (status.scope === "all" || status.scope === "dashboard")) {
      const bypass = status.allow_admins && status.is_platform_admin;

      if (!bypass) {
        const url = request.nextUrl.clone();
        url.pathname = "/manutencao";
        url.search = "";
        const redirect = NextResponse.redirect(url);
        supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
        return redirect;
      }
    }
  }

  if (user && (pathname.startsWith("/dashboard") || pathname.startsWith("/verificar-identidade"))) {
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|robots.txt|icons/|v1(?:/|$)|dashboard-api(?:/|$)|admin-api(?:/|$)|health$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
