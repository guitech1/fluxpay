import { requirePlatformAdmin } from "@/lib/admin-server";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Porteiro de TODO o /admin. Server Component: a verificacao acontece antes de
 * qualquer pixel ser renderizado, e cada rota /admin-api/* refaz a checagem no
 * backend. Digitar /admin na barra de enderecos nao leva a lugar nenhum se a
 * pessoa nao estiver em platform_admins.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();

  return (
    <AdminShell email={admin.email} role={admin.role} environment={admin.environment}>
      {children}
    </AdminShell>
  );
}
