"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  CreditCard,
  Wallet,
  Banknote,
  Link2,
  Landmark,
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
  { href: "/dashboard/carteira", label: "Digital", icon: Landmark },
  { href: "/dashboard", label: "FluxPay", icon: FluxMark, center: true },
  { href: "/dashboard/fluxpay-card", label: "Em breve", icon: Banknote },
  { href: "/dashboard/wallet", label: "Extrato", icon: Wallet },
  { href: "/dashboard/payment-links", label: "Link", icon: Link2 },
];

function isActive(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  if (base === "/dashboard") return pathname === "/dashboard";
  return pathname === base || pathname.startsWith(`${base}/`);
}

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
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegação principal"
    >
      <ul className="grid grid-cols-6 h-16">
        {ITEMS.map((item) => {
          const active = isActive(pathname || "", item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="relative">
              <button
                type="button"
                onClick={() => go(item.href)}
                disabled={pending}
                className={cn(
                  "w-full h-full flex flex-col items-center justify-center gap-0.5 text-[0.65rem]",
                  item.center && "-mt-3",
                  active ? "text-white" : "text-flux-muted"
                )}
              >
                {item.center ? (
                  <span className="w-11 h-11 rounded-full bg-flux-red flex items-center justify-center shadow-lg shadow-red-900/40">
                    <Icon className="w-6 h-6 text-white" />
                  </span>
                ) : (
                  <>
                    <Icon className="w-5 h-5" />
                    <span className="truncate max-w-[4.5rem]">{item.label}</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
