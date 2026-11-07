"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { WalletNav } from "./WalletNav";

function isCadastroPath(pathname: string): boolean {
  return pathname === "/dashboard/carteira/cadastro" || pathname.endsWith("/carteira/cadastro");
}

function isCarteiraRoot(pathname: string): boolean {
  return pathname === "/dashboard/carteira" || pathname === "/dashboard/wallet";
}

/**
 * Shell client da carteira: botão Voltar, submenu e redirecionamento
 * obrigatório para cadastro quando não há registro.
 */
export function CarteiraShell({
  hasWalletRecord,
  children,
}: {
  hasWalletRecord: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";
  const router = useRouter();

  useEffect(() => {
    if (hasWalletRecord) return;
    if (isCadastroPath(pathname) || isCarteiraRoot(pathname)) return;
    router.replace("/dashboard/carteira/cadastro");
  }, [hasWalletRecord, pathname, router]);

  const backHref = isCarteiraRoot(pathname) || isCadastroPath(pathname)
    ? "/dashboard"
    : "/dashboard/carteira";

  return (
    <>
      <header className="fxb-head fxb-rise" style={{ marginBottom: "0.75rem" }}>
        <Link href={backHref} className="fxb-back" aria-label="Voltar">
          <ArrowLeft size={18} />
        </Link>
        <div className="fxb-head-text">
          <h1 style={{ fontSize: "1.15rem" }}>Carteira Digital</h1>
        </div>
      </header>

      {hasWalletRecord ? <WalletNav /> : null}

      <div className="fxb-page">{children}</div>
    </>
  );
}
