import { redirect } from "next/navigation";
import { requireDashboardContext, canAdmin } from "@/lib/dashboard-server";
import { KycVerifyClient } from "@/components/kyc/KycVerifyClient";
import { FluxMark } from "@/components/brand/FluxLogo";

export const dynamic = "force-dynamic";

export default async function VerificarIdentidadePage() {
  const { organization, role } = await requireDashboardContext();

  if (!organization.kyc_required || organization.kyc_status === "verified") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-flux-black flex flex-col">
      <header className="border-b border-flux-border px-4 py-4 flex items-center gap-2">
        <FluxMark className="w-8 h-8" />
        <span className="font-semibold tracking-tight">FluxPay</span>
      </header>
      <main className="flex-1 px-4 py-10">
        <KycVerifyClient canStart={canAdmin(role)} />
      </main>
    </div>
  );
}
