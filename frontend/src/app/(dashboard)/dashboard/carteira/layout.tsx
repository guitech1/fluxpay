import "./carteira.css";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { CarteiraShell, type WalletKycState } from "@/components/carteira/CarteiraShell";

export const dynamic = "force-dynamic";

/**
 * Layout server da Carteira Digital.
 * - Consulta fluxpay_cards (status, kyc_status, kyc_submitted_at) da organização.
 * - Calcula estado KYC e passa ao shell (redirect / tela de análise / normal).
 * - Erro na consulta → trata como approved (não bloqueia).
 * - Chrome do painel já é omitido por DashboardChrome nas rotas /dashboard/carteira*.
 */
function resolveWalletKycState(row: {
  status?: string | null;
  kyc_status?: string | null;
  kyc_submitted_at?: string | null;
} | null): WalletKycState {
  if (!row) return "none";
  const kyc = row.kyc_status ?? "pending";
  if (kyc === "approved") return "approved";
  // Conta antiga (pending sem envio) ou recusada → precisa preencher cadastro
  if (kyc === "rejected" || !row.kyc_submitted_at) return "needs_kyc";
  // pending + já enviou formulário → em análise
  if (kyc === "pending") return "in_review";
  return "needs_kyc";
}

export default async function CarteiraLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, organization } = await requireDashboardContext();

  // default em erro: approved (não bloqueia quem já opera)
  let walletKycState: WalletKycState = "approved";
  const { data: walletRow, error: walletLookupError } = await supabase
    .from("fluxpay_cards")
    .select("status, kyc_status, kyc_submitted_at")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!walletLookupError) {
    walletKycState = resolveWalletKycState(walletRow);
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
        <CarteiraShell walletKycState={walletKycState}>{children}</CarteiraShell>
      </div>
    </div>
  );
}
