import { redirect } from "next/navigation";
import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { PageHeader } from "@/components/dashboard/ui";
import { NewPaymentForm } from "@/components/dashboard/NewPaymentForm";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nova cobrança" };

export default async function NewPaymentPage() {
  const { supabase, environment, role } = await requireDashboardContext();

  // Quem só pode ler não cria cobrança. A trava real está no backend
  // (requireRole em /dashboard-api/payments); aqui é só para não oferecer
  // uma tela que vai falhar no envio.
  if (!canWrite(role)) redirect("/dashboard/payments");

  const { data: customers } = await supabase
    .from("customers")
    .select("id, external_id, email, name, phone, document, created_at")
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova cobrança"
        description="Gere uma cobrança PIX com QR Code e código copia e cola."
        backHref="/dashboard/payments"
        backLabel="Pagamentos"
      />
      <NewPaymentForm customers={(customers || []) as Customer[]} environment={environment} />
    </div>
  );
}
