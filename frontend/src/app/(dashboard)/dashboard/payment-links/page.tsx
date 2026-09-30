import { redirect } from "next/navigation";
import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { PageHeader } from "@/components/dashboard/ui";
import { PaymentLinksClient } from "@/components/dashboard/PaymentLinksClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Link de pagamento" };

export default async function PaymentLinksPage() {
  const { role } = await requireDashboardContext();

  // Viewer pode ver a area (lista); criar exige canWrite no client.
  if (!role) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Link de pagamento"
        description="Gere um link com QR Code e PIX copia e cola para enviar ao cliente."
      />
      <PaymentLinksClient canWrite={canWrite(role)} />
    </div>
  );
}
