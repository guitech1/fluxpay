"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CreditCard,
  Users,
  RefreshCcw,
  Webhook,
  Key,
  Settings,
  BookOpen,
  Wallet,
  Landmark,
  Banknote,
  Link2,
  Shield,
} from "lucide-react";
import { FluxMark } from "@/components/brand/FluxLogo";

const NAV: {
  label: string;
  items: { href: string; label: string; icon: typeof LayoutDashboard }[];
}[] = [
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
      { href: "/dashboard/fluxpay-card", label: "FluxPay Card · Em breve", icon: Banknote },
      { href: "/dashboard/customers", label: "Clientes", icon: Users },
    ],
  },
  {
    label: "Desenvolvedor",
    items: [
      { href: "/dashboard/api-keys", label: "Chaves de API", icon: Key },
      { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/dashboard/docs", label: "Documentação", icon: BookOpen },
    ],
  },
  {
    label: "Conta",
    items: [
      { href: "/dashboard/security", label: "Segurança", icon: Shield },
      { href: "/dashboard/settings", label: "Configurações", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname() || "";

  return (
    <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 border-r border-flux-border bg-flux-card/40">
      <div className="h-14 flex items-center gap-2 px-4 border-b border-flux-border">
        <FluxMark className="w-7 h-7" />
        <span className="font-semibold tracking-tight">FluxPay</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
        {NAV.map((section) => (
          <div key={section.label}>
            <p className="px-2 mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-flux-muted">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={
                        active
                          ? "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium bg-flux-gray text-white"
                          : "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-flux-muted hover:text-white hover:bg-flux-gray/50"
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0 opacity-80" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
