import { redirect } from "next/navigation";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { KycVerificationForm } from "@/components/dashboard/KycVerificationForm";

export const dynamic = "force-dynamic";

export default async function VerifyIdentityPage() {
  const { organization } = await requireDashboardContext();

  if (!organization.kyc_required || organization.kyc_status === "verified") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-flux-black text-white p-4 sm:p-8">
      <div className="max-w-xl mx-auto pt-8 sm:pt-16">
        <KycVerificationForm
          initialStatus={organization.kyc_status}
          initialDocumentType={organization.kyc_document_type}
          initialDocumentMasked={organization.kyc_document_masked}
        />
      </div>
    </main>
  );
}
