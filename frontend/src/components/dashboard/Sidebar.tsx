"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CreditCard,
  Users,
  RefreshCcw,
  AlertTriangle,
  Webhook,
  Key,
  Settings,
  Building2,
  FileText,
  ChevronLeft,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { FluxMark } from "@/components/brand/FluxLogo";

const navItems = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/dashboard/payments", label: "Pagamentos", icon: CreditCard },
  { href: "/dashboard/customers", label: "Clientes", icon: Users },
  { href: "/dashboard/refunds", label: "Reembolsos", icon: RefreshCcw },
  { href: "/dashboard/disputes", label: "Disputas", icon: AlertTriangle },
  { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/dashboard/api-keys", label: "Chaves de API", icon: Key },
  { href: "/dashboard/logs", label: "Logs da API", icon: FileText },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings },
  { href: "/dashboard/company", label: "Perfil da empresa", icon: Building2 },
];

export function Sidebar({
  environment = "test",
  organizationName,
}: {
  environment?: "test" | "live";
  organizationName?: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-3.5 left-4 z-50 p-2.5 rounded-lg bg-flux-dark border border-flux-border"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
        aria-expanded={mobileOpen}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-40 flex flex-col bg-flux-dark border-r border-flux-border transition-all duration-200",
          collapsed ? "w-[72px]" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-flux-border">
          <FluxMark className="w-8 h-8 shrink-0" />
          {!collapsed && (
            <span className="font-semibold text-lg tracking-tight">FluxPay</span>
          )}
          <button
            className="ml-auto hidden lg:flex p-1 rounded hover:bg-flux-gray-light"
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronLeft
              className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")}
            />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-flux-red/10 text-flux-red"
                    : "text-flux-muted hover:text-white hover:bg-flux-gray-light"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="p-4 border-t border-flux-border">
            <div className="text-xs text-flux-muted">
              <div className="font-medium text-white/80 truncate">
                {organizationName || "FluxPay"}
              </div>
              <div>
                {environment === "live" ? "Ambiente de produção" : "Ambiente de testes"}
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
