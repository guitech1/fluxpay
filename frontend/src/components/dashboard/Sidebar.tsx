"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CreditCard,
  Users,
  Webhook,
  Key,
  Settings,
  BookOpen,
  Wallet,
  Landmark,
  Banknote,
  Link2,
  Trophy,
} from "lucide-react";
import { FluxMark } from "@/components/brand/FluxLogo";
import type { Environment } from "@/lib/types";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };
type NavSection = { label: string; items: NavItem[] };

/** Sidebar desktop — sem Ranking. */
const SIDEBAR_NAV: NavSection[] = [
  {
    label: "Geral",
    items: [{ href: "/dashboard", label: "Visão geral", icon: LayoutDashboard }],
  },
  {
    label: "Receber",
    items: [
      { href: "/dashboard/payments", label: "Pagamentos", icon: CreditCard },
      { href: "/dashboard/payment-links", label: "Link de pagamento", icon: Link2 },
      { href: "/dashboard/carteira", label: "Carteira Digital", icon: Landmark },
      { href: "/dashboard/wallet", label: "Extrato e saques", icon: Wallet },
      { href: "/dashboard/fluxpay-card", label: "FluxPay Card", icon: Banknote },
      { href: "/dashboard/customers", label: "Clientes", icon: Users },
    ],
  },
  {
    label: "Desenvolvedor",
    items: [
      { href: "/dashboard/api-keys", label: "Chaves de API", icon: Key },
      { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/dashboard/api", label: "Documentação", icon: BookOpen },
    ],
  },
  {
    label: "Conta",
    items: [{ href: "/dashboard/settings", label: "Configurações", icon: Settings }],
  },
];

/** Menu hambúrguer — Ranking só aqui. */
const DRAWER_NAV: NavSection[] = [
  {
    label: "Geral",
    items: [
      { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
      { href: "/ranking", label: "Ranking", icon: Trophy },
    ],
  },
  ...SIDEBAR_NAV.filter((s) => s.label !== "Geral"),
];

function NavList({
  sections,
  onNavigate,
  denser = false,
}: {
  sections: NavSection[];
  onNavigate?: () => void;
  denser?: boolean;
}) {
  const pathname = usePathname() || "";
  const pad = denser ? "py-2.5" : "py-2";

  return (
    <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="px-2 mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-flux-muted">
            {section.label}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={
                      active
                        ? `flex items-center gap-2.5 px-2.5 ${pad} rounded-lg text-sm font-medium bg-flux-red/15 text-white`
                        : `flex items-center gap-2.5 px-2.5 ${pad} rounded-lg text-sm font-medium text-flux-muted hover:text-white hover:bg-flux-gray/50`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({
  environment: _environment,
  organizationName: _organizationName,
  onNavigate,
}: {
  environment?: Environment;
  organizationName?: string;
  onNavigate?: () => void;
} = {}) {
  return (
    <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 border-r border-flux-border bg-flux-card/40">
      <div className="h-14 flex items-center gap-2 px-4 border-b border-flux-border">
        <FluxMark className="w-7 h-7" />
        <span className="font-semibold tracking-tight">FluxPay</span>
      </div>
      <NavList sections={SIDEBAR_NAV} onNavigate={onNavigate} />
    </aside>
  );
}

/** Links do drawer mobile (hambúrguer) — inclui Ranking. */
export function SidebarNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <NavList sections={DRAWER_NAV} onNavigate={onNavigate} denser />;
}
