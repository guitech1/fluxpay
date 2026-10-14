"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
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
 * Barra inferior fixa — mobile only. router.push + useTransition para feedback imediato.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!pathname?.startsWith("/dashboard")) return null;

  function go(href: string) {
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-flux-border bg-flux-dark"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Navegação principal"
      data-pending={pending ? "1" : "0"}
    >
      <ul className="grid grid-cols-6 h-14 max-w-lg mx-auto">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          if (item.center) {
            return (
              <li key={item.href} className="flex items-center justify-center -mt-2">
                <button
                  type="button"
                  onClick={() => go(item.href)}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={cn(
                    "flex items-center justify-center w-12 h-12 rounded-full border-2 shadow-md",
                    active
                      ? "bg-flux-red border-flux-red text-white"
                      : "bg-flux-gray border-flux-border text-white"
                  )}
                >
                  <Icon className="w-6 h-6" />
                </button>
              </li>
            );
          }
          return (
            <li key={item.href} className="flex">
              <button
                type="button"
                onClick={() => go(item.href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                  active ? "text-flux-red" : "text-flux-muted"
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 2} />
                <span className="leading-none">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
