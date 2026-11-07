import "./carteira.css";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { CarteiraShell } from "@/components/carteira/CarteiraShell";

export const dynamic = "force-dynamic";

/**
 * Layout server da Carteira Digital.
 * - Consulta fluxpay_cards (status) da organização.
 * - Sem registro → CarteiraShell esconde submenu e redireciona subrotas para cadastro.
 * - Erro na consulta → trata como "tem carteira" (não bloqueia).
 * - Chrome do painel já é omitido por DashboardChrome nas rotas /dashboard/carteira*.
 */
export default async function CarteiraLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, organization } = await requireDashboardContext();

  let hasWalletRecord = true; // default: em erro, não bloquear quem já tem carteira
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
      <div
        className="fxb-inner"
        style={{ maxWidth: 1100, margin: "0 auto", width: "100%", overflowX: "hidden" }}
      >
        <CarteiraShell hasWalletRecord={hasWalletRecord}>{children}</CarteiraShell>
      </div>
    </div>
  );
}
