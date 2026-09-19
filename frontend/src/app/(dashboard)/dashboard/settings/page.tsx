import { requireDashboardContext } from "@/lib/dashboard-server";
import { getPublicBaseUrl } from "@/lib/public-url";
import { PageHeader } from "@/components/dashboard/ui";
import { AccountSettings } from "@/components/dashboard/AccountSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { organization, user, role, environment } = await requireDashboardContext();

  // Resolvida server-side: em producao NEXT_PUBLIC_API_URL fica vazia, e ler a
  // variavel direto aqui produzia o caminho relativo "/v1/webhooks/nexuspag",
  // que nao serve para cadastrar no painel da NexusPag.
  const webhookInUrl = `${await getPublicBaseUrl()}/v1/webhooks/nexuspag`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Configurações"
        description="Sua conta e as informações de integração desta empresa"
      />

      <AccountSettings email={user.email} role={role} />

      <div className="card space-y-4">
        <h2 className="font-medium">Integração</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-flux-muted mb-1">ID da empresa</dt>
            <dd className="font-mono text-xs break-all">{organization.id}</dd>
          </div>
          <div>
            <dt className="text-flux-muted mb-1">Ambiente atual</dt>
            <dd>{environment === "live" ? "Produção" : "Testes"}</dd>
          </div>
          <div>
            <dt className="text-flux-muted mb-1">Moeda padrão</dt>
            <dd>{organization.default_currency || "BRL"}</dd>
          </div>
          <div>
            <dt className="text-flux-muted mb-1">Fuso horário</dt>
            <dd>{organization.timezone || "America/Sao_Paulo"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-flux-muted mb-1">URL do webhook de entrada (NexusPag)</dt>
            <dd className="font-mono text-xs break-all">{webhookInUrl}</dd>
          </div>
        </dl>
        <p className="text-xs text-flux-muted">
          Cadastre essa URL no painel da NexusPag e configure lá o{" "}
          <code>webhook_secret</code>. Sem o segredo, o FluxPay recusa os eventos recebidos — é
          proposital: sem assinatura não há como provar que a notificação veio mesmo do adquirente.
        </p>
      </div>
    </div>
  );
}
