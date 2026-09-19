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
  Code2,
  Settings,
  Building2,
  FileText,
  Wallet,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { FluxMark } from "@/components/brand/FluxLogo";
import { environmentLabel } from "@/lib/labels";

/**
 * Navegação do painel, agrupada por responsabilidade em vez de uma lista
 * corrida de dez itens. A ordem segue o que a pessoa faz no dia a dia:
 * receber, depois operar, depois integrar, depois configurar.
 */
const NAV_GROUPS: {
  label?: string;
  items: { href: string; label: string; icon: React.ElementType }[];
}[] = [
  {
    items: [{ href: "/dashboard", label: "Visão geral", icon: LayoutDashboard }],
  },
  {
    label: "Receber",
    items: [
      { href: "/dashboard/payments", label: "Pagamentos", icon: CreditCard },
      { href: "/dashboard/wallet", label: "Carteira", icon: Wallet },
      { href: "/dashboard/customers", label: "Clientes", icon: Users },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/dashboard/refunds", label: "Reembolsos", icon: RefreshCcw },
      { href: "/dashboard/disputes", label: "Disputas", icon: AlertTriangle },
    ],
  },
  {
    label: "Desenvolvedores",
    items: [
      { href: "/dashboard/api", label: "API e documentação", icon: Code2 },
      { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/dashboard/logs", label: "Registro de chamadas", icon: FileText },
    ],
  },
  {
    label: "Conta",
    items: [
      { href: "/dashboard/company", label: "Empresa", icon: Building2 },
      { href: "/dashboard/settings", label: "Configurações", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  environment = "test",
  organizationName,
}: {
  environment?: "test" | "live";
  organizationName?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Navegou: fecha a gaveta. Sem isso, no mobile, a sidebar fica por cima da
  // página que o usuário acabou de abrir.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        className="lg:hidden fixed top-3 left-3 z-50 p-2.5 rounded-lg bg-flux-dark border border-flux-border text-flux-muted hover:text-white"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/70 z-40"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed lg:sticky lg:top-0 inset-y-0 left-0 z-40 w-64 shrink-0 h-screen flex flex-col bg-flux-dark border-r border-flux-border transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-flux-border shrink-0">
          <FluxMark className="w-7 h-7 shrink-0" />
          <span className="font-semibold tracking-tight">FluxPay</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5" aria-label="Menu principal">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label || gi} className="space-y-0.5">
              {group.label && (
                <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-flux-muted/70">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                      active
                        ? "bg-flux-gray-light text-white font-medium"
                        : "text-flux-muted hover:text-white hover:bg-flux-gray"
                    )}
                  >
                    <Icon className="w-[18px] h-[18px] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-flux-border shrink-0">
          <div className="text-xs">
            <div className="font-medium truncate">{organizationName || "FluxPay"}</div>
            <div className="text-flux-muted mt-0.5">
              Ambiente de {environmentLabel(environment).toLowerCase()}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
