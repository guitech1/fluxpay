"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { WalletNav } from "./WalletNav";
import { AnalysisWaiting } from "./AnalysisWaiting";

export type WalletKycState = "none" | "needs_kyc" | "in_review" | "approved";

function isCadastroPath(pathname: string): boolean {
  return pathname === "/dashboard/carteira/cadastro" || pathname.endsWith("/carteira/cadastro");
}

function isCarteiraRoot(pathname: string): boolean {
  return pathname === "/dashboard/carteira" || pathname === "/dashboard/wallet";
}

/**
 * Shell client da carteira:
 * - none / needs_kyc → qualquer rota (exceto cadastro) vai para /dashboard/carteira/cadastro; sem submenu
 * - in_review → submenu oculto; tela profissional de análise no root; bloqueia subrotas de operação
 * - approved → comportamento normal
 */
export function CarteiraShell({
  walletKycState,
  children,
}: {
  walletKycState: WalletKycState;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";
  const router = useRouter();

  const needsCadastro = walletKycState === "none" || walletKycState === "needs_kyc";
  const inReview = walletKycState === "in_review";
  const approved = walletKycState === "approved";

  useEffect(() => {
    if (needsCadastro) {
      if (isCadastroPath(pathname)) return;
      router.replace("/dashboard/carteira/cadastro");
      return;
    }
    if (inReview) {
      if (isCadastroPath(pathname) || isCarteiraRoot(pathname)) return;
      router.replace("/dashboard/carteira");
    }
  }, [needsCadastro, inReview, pathname, router]);

  const backHref =
    isCarteiraRoot(pathname) || isCadastroPath(pathname) ? "/dashboard" : "/dashboard/carteira";

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

      {approved ? <WalletNav /> : null}

      {inReview && isCarteiraRoot(pathname) ? (
        <div className="fxb-page">
          <AnalysisWaiting />
        </div>
      ) : (
        <div className="fxb-page">{children}</div>
      )}
    </>
  );
}
