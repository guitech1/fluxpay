import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { requireDashboardContext } from "@/lib/dashboard-server";

/**
 * Layout de todo o painel. Server Component: resolve sessao, empresa atual e
 * ambiente uma unica vez e passa para a Topbar. Quem nao tem sessao ou empresa
 * e redirecionado aqui dentro (requireDashboardContext), antes de qualquer
 * pagina renderizar.
 */

/** Texto para o lojista — nunca o status cru do banco ("suspended", "banned"). */
function blockedAccountMessage(status: string): string {
  switch (status) {
    case "pending":
      return "Sua conta está em análise. Você pode consultar o histórico, mas ainda não é possível criar cobranças.";
    case "disabled":
      return "Esta conta está desativada. Você pode consultar o histórico; para voltar a receber, fale com o suporte.";
    default:
      return "As operações desta conta estão bloqueadas. Você pode consultar o histórico. Fale com o suporte da FluxPay para resolver.";
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { organization, environment, user, role, isPlatformAdmin } =
    await requireDashboardContext();

  return (
    <div className="flex min-h-screen bg-flux-black">
      <Sidebar environment={environment} organizationName={organization.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          organizationName={organization.name}
          environment={environment}
          userEmail={user.email}
          role={role}
          isPlatformAdmin={isPlatformAdmin}
        />

        {/*
          Único aviso permanente do painel, e ele é do usuário: a conta está
          impedida de operar. O motivo interno (status_reason) é anotação da
          equipe da FluxPay e fica só no painel administrativo.
        */}
        {organization.status !== "active" && (
          <div
            role="status"
            className="border-b border-amber-500/20 bg-amber-500/10 px-4 lg:px-8 py-3 text-sm text-amber-100"
          >
            {blockedAccountMessage(organization.status)}
          </div>
        )}

        <main className="flex-1">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
