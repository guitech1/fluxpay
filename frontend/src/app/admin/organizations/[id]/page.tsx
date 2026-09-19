import { requirePlatformAdmin, canAct } from "@/lib/admin-server";
import { OrganizationDetailPanel } from "@/components/admin/panels";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;

  return <OrganizationDetailPanel id={id} canAct={canAct(admin.role)} />;
}
