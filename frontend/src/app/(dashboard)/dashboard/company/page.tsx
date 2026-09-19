import { requireDashboardContext, canAdmin } from "@/lib/dashboard-server";
import { PageHeader } from "@/components/dashboard/ui";
import { CompanyForm } from "@/components/dashboard/CompanyForm";
import { MembersManager } from "@/components/dashboard/MembersManager";
import type { Member } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CompanyPage() {
  const { supabase, organization, user, role } = await requireDashboardContext();

  const { data: members } = await supabase
    .from("organization_members")
    .select("id, user_id, role, created_at, users(id, email, full_name)")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Perfil da empresa"
        description="Dados cadastrais e equipe com acesso ao painel"
      />

      <CompanyForm organization={organization} canEdit={canAdmin(role)} />

      <MembersManager
        members={(members || []) as unknown as Member[]}
        currentUserId={user.id}
        canAdmin={canAdmin(role)}
      />
    </div>
  );
}
