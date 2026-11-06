import { requireDashboardContext } from "@/lib/dashboard-server";
import { PixTransferForm } from "@/components/dashboard/PixTransferForm";
import { ScreenHeader } from "@/components/carteira/ScreenHeader";
import { PixBadge } from "@/components/carteira/PixMark";

export const dynamic = "force-dynamic";

export default async function CarteiraPixPage() {
  const { supabase, organization, environment, role } = await requireDashboardContext();

  const { data: balance } = await supabase.rpc("get_organization_balance", {
    p_organization_id: organization.id,
    p_environment: environment,
  });
  const balances = (balance || []) as { currency: string; available: number }[];
  const primary = balances[0];
  const currency = primary?.currency || organization.default_currency || "BRL";

  return (
    <div className="fxb-narrow">
      <ScreenHeader
        title="Pix"
        description="Envie dinheiro usando uma chave Pix"
        icon={<PixBadge size="lg" />}
      />

      <PixTransferForm
        availableCents={primary?.available ?? 0}
        currency={currency}
        canTransfer={["owner", "admin"].includes(role)}
        environment={environment}
      />
    </div>
  );
}
