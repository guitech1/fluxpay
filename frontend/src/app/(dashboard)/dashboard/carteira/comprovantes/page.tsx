import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { ScreenHeader } from "@/components/carteira/ScreenHeader";
import { ComprovantesList } from "@/components/carteira/ComprovantesList";

export const dynamic = "force-dynamic";

export default async function ComprovantesPage() {
  const { supabase, organization, environment } = await requireDashboardContext();

  const [{ data: withdrawals }, { data: card }] = await Promise.all([
    supabase
      .from("withdrawal_requests")
      .select(
        "id, net, fee, amount, currency, status, pix_key_type, created_at, provider_reference"
      )
      .eq("organization_id", organization.id)
      .eq("environment", environment)
      .in("status", ["completed", "processing", "failed", "rejected", "pending"])
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("fluxpay_cards")
      .select("full_name, cpf")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rows = (withdrawals || []).map((w: any) => ({
    ...w,
    net: Number(w.net),
    fee: Number(w.fee || 0),
    amount: Number(w.amount || 0),
  }));

  const payerName = card?.full_name ?? null;
  const payerDocumentMasked = card?.cpf
    ? `***.${String(card.cpf).replace(/\D/g, "").slice(-6, -3)}.${String(card.cpf).replace(/\D/g, "").slice(-3)}-*`
    : null;

  return (
    <div className="fxb-narrow">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <Link
          href="/dashboard/carteira"
          className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <ScreenHeader
          title="Comprovantes"
          description="Pix e saques com status real do provedor"
        />
      </div>

      <ComprovantesList
        rows={rows}
        payerName={payerName}
        payerDocumentMasked={payerDocumentMasked}
      />
    </div>
  );
}
