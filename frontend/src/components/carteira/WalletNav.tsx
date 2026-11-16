"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, CreditCard, ArrowLeftRight, FileText, Settings2, Store, Percent } from "lucide-react";
import { PixMark } from "./PixMark";

const TABS = [
  { href: "/dashboard/carteira", label: "Visão geral", exact: true, kind: "grid" as const },
  { href: "/dashboard/carteira/caixa", label: "Modo Caixa", exact: false, kind: "caixa" as const },
  { href: "/dashboard/carteira/pix", label: "Pix", exact: false, kind: "pix" as const },
  { href: "/dashboard/carteira/splits", label: "Splits", exact: false, kind: "splits" as const },
  {
    href: "/dashboard/carteira/cartao",
    label: "Cartão",
    badge: "Em breve",
    exact: false,
    kind: "card" as const,
  },
  { href: "/dashboard/carteira/extrato", label: "Extrato", exact: false, kind: "extrato" as const },
  { href: "/dashboard/carteira/comprovantes", label: "Comprovantes", exact: false, kind: "docs" as const },
  { href: "/dashboard/carteira/config", label: "Config", exact: false, kind: "config" as const },
];

function TabIcon({ kind }: { kind: (typeof TABS)[number]["kind"] }) {
  if (kind === "pix") {
    return (
      <span className="fxb-tab-ico fxb-tab-ico--pix">
        <PixMark size={14} />
      </span>
    );
  }
  const Icon =
    kind === "grid"
      ? LayoutGrid
      : kind === "caixa"
        ? Store
        : kind === "splits"
          ? Percent
          : kind === "card"
            ? CreditCard
            : kind === "extrato"
              ? ArrowLeftRight
              : kind === "docs"
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
            <TabIcon kind={tab.kind} />
            <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
              <span>{tab.label}</span>
              {"badge" in tab && tab.badge ? (
                <span
                  style={{
                    fontSize: "0.62rem",
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#fca5a5",
                    lineHeight: 1,
                  }}
                >
                  {tab.badge}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
