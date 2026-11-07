import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import "./carteira.css";
import { WalletNav } from "@/components/carteira/WalletNav";
import { requireDashboardContext } from "@/lib/dashboard-server";

export const dynamic = "force-dynamic";

/**
 * Layout server da Carteira Digital.
 * - Tela cheia (sem chrome do dashboard — controlado por DashboardChrome).
 * - Cadastro obrigatório: sem registro em fluxpay_cards redireciona para /cadastro.
 * - Em erro de consulta, não bloqueia (trata como "tem carteira").
 * - Submenu só aparece quando já existe cadastro.
 */
export default async function CarteiraLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, organization } = await requireDashboardContext();

  // headers() / pathname via segment: usamos redirect só em rotas que não são cadastro.
  // O path completo não vem no layout de forma estável em todos os runtimes;
  // por isso bloqueamos páginas irmãs checando se o usuário tem registro.
  let hasWalletRecord = true; // default seguro: em erro, não bloquear
  const { data: walletRow, error: walletLookupError } = await supabase
    .from("fluxpay_cards")
    .select("status")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!walletLookupError) {
    hasWalletRecord = Boolean(walletRow?.status);
  }
  // Se a consulta falhar, hasWalletRecord permanece true → não bloqueia quem já tem carteira.

  return (
    <div
      className="fxb fxb-isolated"
      style={{
        minHeight: "100dvh",
        borderRadius: 0,
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="fxb-inner" style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <header className="fxb-head fxb-rise" style={{ marginBottom: "0.75rem" }}>
          <CarteiraBackLink hasWalletRecord={hasWalletRecord} />
          <div className="fxb-head-text">
            <h1 style={{ fontSize: "1.15rem" }}>Carteira Digital</h1>
          </div>
        </header>

        {hasWalletRecord ? <WalletNav /> : null}

        <CarteiraGate hasWalletRecord={hasWalletRecord}>{children}</CarteiraGate>
      </div>
    </div>
  );
}

/** Botão Voltar: raiz da carteira → /dashboard; subpáginas → /dashboard/carteira */
function CarteiraBackLink({ hasWalletRecord }: { hasWalletRecord: boolean }) {
  // Em server component não temos pathname; o link padrão volta para o dashboard.
  // Subpáginas usam ScreenHeader com backHref próprio. Aqui o botão global volta ao painel.
  const href = hasWalletRecord ? "/dashboard" : "/dashboard";
  return (
    <Link href={href} className="fxb-back" aria-label="Voltar">
      <ArrowLeft size={18} />
    </Link>
  );
}

/**
 * Gate client-side mínimo via headers não é possível aqui de forma simples;
 * usamos um server component wrapper que redireciona com base no path
 * passado pelo Next via children segment. Para cadastro e overview ok.
 *
 * Redirecionamento efetivo das subrotas sem cadastro: ver CarteiraGateRedirect.
 */
async function CarteiraGate({
  hasWalletRecord,
  children,
}: {
  hasWalletRecord: boolean;
  children: React.ReactNode;
}) {
  // O redirect de subpáginas sem cadastro é feito por um helper que lê
  // o segmento via headers. Sem registro, só a tela de cadastro deve
  // permanecer acessível — isso é aplicado em CarteiraRegistrationGuard.
  if (!hasWalletRecord) {
    return <CarteiraRegistrationGuard>{children}</CarteiraRegistrationGuard>;
  }
  return <div className="fxb-page">{children}</div>;
}

/**
 * Sem registro de carteira: permite apenas /dashboard/carteira e
 * /dashboard/carteira/cadastro. Qualquer outra subrota redireciona.
 * Implementado com headers() do Next para obter o path.
 */
async function CarteiraRegistrationGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { headers } = await import("next/headers");
  const h = await headers();
  // next-url ou x-url / referer — no App Router o path vem em x-invoke-path
  // em alguns hosts; fallbacks comuns:
  const path =
    h.get("x-invoke-path") ||
    h.get("x-matched-path") ||
    h.get("next-url") ||
    "";

  const normalized = path.split("?")[0] || "";
  const isCadastro =
    normalized === "/dashboard/carteira/cadastro" ||
    normalized.endsWith("/carteira/cadastro");
  const isRoot =
    normalized === "/dashboard/carteira" ||
    normalized.endsWith("/dashboard/carteira") ||
    normalized === "";

  // Sem path confiável (alguns runtimes), não redireciona de forma agressiva
  // para evitar loop; a página overview já orienta a solicitar carteira.
  if (normalized && !isCadastro && !isRoot) {
    redirect("/dashboard/carteira/cadastro");
  }

  return <div className="fxb-page">{children}</div>;
}
