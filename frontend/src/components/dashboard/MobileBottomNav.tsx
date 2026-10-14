"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  Wallet,
  Banknote,
  Link2,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FluxMark } from "@/components/brand/FluxLogo";

const ITEMS: {
  href: string;
  label: string;
  icon: React.ElementType;
  center?: boolean;
}[] = [
  { href: "/dashboard/payments", label: "Pagamentos", icon: CreditCard },
  { href: "/dashboard/wallet", label: "Carteira", icon: Wallet },
  { href: "/dashboard", label: "FluxPay", icon: FluxMark, center: true },
  { href: "/dashboard/fluxpay-card", label: "Card", icon: Banknote },
  { href: "/dashboard/payment-links", label: "Link", icon: Link2 },
  { href: "/dashboard/wallet?saque=1", label: "Saque", icon: ArrowUpRight },
];

function isActive(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  if (base === "/dashboard") return pathname === "/dashboard";
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Barra inferior fixa — apenas mobile (lg:hidden).
 * Respeita safe-area iOS. O layout do dashboard deve reservar padding-bottom.
 */
export function MobileBottomNav() {
  const pathname = usePathname();

  // Não mostrar em rotas admin ou páginas públicas
  if (!pathname?.startsWith("/dashboard")) return null;

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-flux-border bg-flux-dark/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Navegação principal"
    >
      <ul className="grid grid-cols-6 h-16 max-w-lg mx-auto">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          if (item.center) {
            return (
              <li key={item.href} className="flex items-center justify-center -mt-3">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={cn(
                    "flex items-center justify-center w-14 h-14 rounded-full border-2 shadow-lg transition-colors",
                    active
                      ? "bg-flux-red border-flux-red text-white"
                      : "bg-flux-gray border-flux-border text-white hover:border-flux-red/60"
                  )}
                >
                  <Icon className="w-7 h-7" />
                </Link>
              </li>
            );
          }
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] min-h-[44px] transition-colors",
                  active ? "text-flux-red font-medium" : "text-flux-muted hover:text-white"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="truncate max-w-[4.5rem]">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
