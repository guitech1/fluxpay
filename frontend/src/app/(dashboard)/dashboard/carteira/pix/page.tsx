import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { PageHeader } from "@/components/dashboard/ui";
import { PixTransferForm } from "@/components/dashboard/PixTransferForm";

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
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/carteira"
          className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <PageHeader
          title="Pix"
          description="Transferência por chave Pix"
        />
      </div>

      <PixTransferForm
        availableCents={primary?.available ?? 0}
        currency={currency}
        canTransfer={["owner", "admin"].includes(role)}
        environment={environment}
      />
    </div>
  );
}
