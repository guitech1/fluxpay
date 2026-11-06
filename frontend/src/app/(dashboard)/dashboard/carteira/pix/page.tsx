import Link from "next/link";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { PixTransferForm } from "@/components/dashboard/PixTransferForm";
import { ScreenHeader } from "@/components/carteira/ScreenHeader";
import { PixBadge } from "@/components/carteira/PixMark";

export const dynamic = "force-dynamic";

export default async function CarteiraPixPage() {
  const { supabase, organization, environment, role } = await requireDashboardContext();

  const [{ data: balance }, { data: cardRow }] = await Promise.all([
    supabase.rpc("get_organization_balance", {
      p_organization_id: organization.id,
      p_environment: environment,
    }),
    supabase
      .from("fluxpay_cards")
      .select("status")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const balances = (balance || []) as { currency: string; available: number }[];
  const primary = balances[0];
  const currency = primary?.currency || organization.default_currency || "BRL";
  const walletStatus = cardRow?.status ?? null;
  const isApproved = walletStatus === "approved";

  return (
    <div className="fxb-narrow">
      <ScreenHeader
        title="Pix"
        description="Envie dinheiro usando uma chave Pix"
        icon={<PixBadge size="lg" />}
      />

      {!isApproved ? (
        <div className="fxb-note fxb-note--warn">
          <p style={{ fontWeight: 600 }}>
            {!walletStatus
              ? "Cadastro obrigatorio"
              : walletStatus === "pending_review"
                ? "Aguardando aprovacao"
                : walletStatus === "rejected"
                  ? "Carteira reprovada"
                  : "Carteira bloqueada"}
          </p>
          <p style={{ marginTop: 4 }}>
            {!walletStatus
              ? "Solicite sua carteira digital e aguarde a aprovacao administrativa para enviar Pix."
              : walletStatus === "pending_review"
                ? "As transferencias Pix liberam somente apos a aprovacao da sua carteira."
                : walletStatus === "rejected"
                  ? "Sua solicitacao foi reprovada. Fale com o suporte ou solicite novamente."
                  : "Operacoes financeiras estao indisponiveis enquanto a carteira estiver bloqueada."}
          </p>
          {(!walletStatus || walletStatus === "rejected") && (
            <Link
              href="/dashboard/carteira/cadastro"
              className="fxb-link-pill"
              style={{ display: "inline-flex", marginTop: 12 }}
            >
              {!walletStatus ? "Solicitar carteira digital" : "Solicitar novamente"}
            </Link>
          )}
        </div>
      ) : (
        <PixTransferForm
          availableCents={primary?.available ?? 0}
          currency={currency}
          canTransfer={["owner", "admin"].includes(role)}
          environment={environment}
        />
      )}
    </div>
  );
}
