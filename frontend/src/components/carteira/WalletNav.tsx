"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, CreditCard, ArrowLeftRight, FileText, Settings2 } from "lucide-react";
import { PixMark } from "./PixMark";

const TABS = [
  { href: "/dashboard/carteira", label: "Visão geral", exact: true, pix: false },
  { href: "/dashboard/carteira/pix", label: "Pix", exact: false, pix: true },
  { href: "/dashboard/carteira/cartao", label: "Cartão virtual", exact: false, pix: false },
  { href: "/dashboard/carteira/extrato", label: "Extrato", exact: false, pix: false },
  { href: "/dashboard/carteira/comprovantes", label: "Comprovantes", exact: false, pix: false },
  { href: "/dashboard/carteira/config", label: "Configurações", exact: false, pix: false },
];

function TabIcon({ href, pix }: { href: string; pix: boolean }) {
  if (pix) {
    return (
      <span className="fxb-tab-ico fxb-tab-ico--pix">
        <PixMark size={14} />
      </span>
    );
  }
  const Icon = href.endsWith("/carteira")
    ? LayoutGrid
    : href.endsWith("/cartao")
      ? CreditCard
      : href.endsWith("/extrato")
        ? ArrowLeftRight
        : href.endsWith("/comprovantes")
          ? FileText
          : Settings2;
  return (
    <span className="fxb-tab-ico">
      <Icon size={16} />
    </span>
  );
}

export function WalletNav() {
  const pathname = usePathname() || "";
  return (
    <nav className="fxb-nav" aria-label="Carteira Digital">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="fxb-tab"
            aria-current={active ? "page" : undefined}
          >
            <TabIcon href={tab.href} pix={tab.pix} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
