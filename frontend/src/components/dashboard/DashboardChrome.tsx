"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function isCarteiraRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/dashboard/carteira" ||
    pathname.startsWith("/dashboard/carteira/") ||
    pathname === "/dashboard/wallet" ||
    pathname.startsWith("/dashboard/wallet/")
  );
}

/**
 * Decide se o chrome do painel (Sidebar, Topbar, bottom nav, suporte)
 * aparece. Nas rotas da carteira digital renderiza só o conteúdo,
 * para ocupar a tela inteira no celular e no desktop.
 */
export function DashboardChrome({
  sidebar,
  topbar,
  statusBanner,
  notificationBanner,
  mobileNav,
  supportWidget,
  children,
}: {
  sidebar: ReactNode;
  topbar: ReactNode;
  statusBanner?: ReactNode;
  notificationBanner?: ReactNode;
  mobileNav: ReactNode;
  supportWidget: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const carteiraOnly = isCarteiraRoute(pathname);

  if (carteiraOnly) {
    return (
      <div className="min-h-[100dvh] bg-flux-black text-white">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-flux-black">
      {sidebar}
      <div className="flex-1 flex flex-col min-w-0">
        {topbar}
        {statusBanner}
        {notificationBanner}
        <main className="flex-1 pb-20 lg:pb-0">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>
      {mobileNav}
      {supportWidget}
    </div>
  );
}
