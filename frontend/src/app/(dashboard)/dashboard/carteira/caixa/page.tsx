import { requireDashboardContext } from "@/lib/dashboard-server";
import { ScreenHeader } from "@/components/carteira/ScreenHeader";
import { ModoCaixa } from "@/components/carteira/ModoCaixa";
import { Store } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ModoCaixaPage() {
  const { supabase, organization } = await requireDashboardContext();

  const { data: cardRow, error } = await supabase
    .from("fluxpay_cards")
    .select("status")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isApproved = !error && cardRow?.status === "approved";

  return (
    <div className="fxb-narrow">
      <ScreenHeader
        title="Modo Caixa"
        description="Seu celular vira maquininha de Pix — digite o valor e mostre o QR"
        icon={<Store size={22} />}
      />

      {!isApproved ? (
        <div className="fxb-note fxb-note--warn">
          <p style={{ fontWeight: 600 }}>Carteira precisa estar aprovada</p>
          <p style={{ marginTop: 4 }}>
            O Modo Caixa libera após a aprovação da Carteira Digital.
          </p>
          <Link href="/dashboard/carteira/cadastro" className="fxb-link-pill" style={{ display: "inline-flex", marginTop: 12 }}>
            Ver cadastro
          </Link>
        </div>
      ) : (
        <ModoCaixa />
      )}
    </div>
  );
}
