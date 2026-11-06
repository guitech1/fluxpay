"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SUBNAV = [
  { href: "/dashboard/carteira", label: "Visão geral", exact: true },
  { href: "/dashboard/carteira/cartao", label: "Cartão virtual" },
  { href: "/dashboard/carteira/pix", label: "Pix" },
  { href: "/dashboard/wallet", label: "Extrato" },
  { href: "/dashboard/carteira/comprovantes", label: "Comprovantes" },
  { href: "/dashboard/carteira/config", label: "Configurações" },
];

export default function CarteiraLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-1 border-b border-white/10 pb-2 -mt-1">
        {SUBNAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm transition-colors",
                active
                  ? "bg-red-500/15 text-red-300 font-medium"
                  : "text-flux-muted hover:text-white hover:bg-white/5"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
