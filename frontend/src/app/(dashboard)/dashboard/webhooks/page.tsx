import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { formatDate } from "@/lib/utils";
import { deliveryStatusLabel } from "@/lib/labels";
import { PageHeader, ErrorState, Table, Mono } from "@/components/dashboard/ui";
import { WebhooksManager } from "@/components/dashboard/WebhooksManager";
import { WebhookPlayground, type PlaygroundDelivery } from "@/components/dashboard/WebhookPlayground";
import type { WebhookEndpoint } from "@/lib/types";

export const dynamic = "force-dynamic";

interface DeliveryRow {
  id: string;
  status: string;
  attempt_count: number | null;
  response_status: number | null;
  created_at: string;
  request_body?: unknown;
  response_body?: string | null;
  webhook_events?: { type: string } | null;
}

export default async function WebhooksPage() {
  const { supabase, environment, role } = await requireDashboardContext();

  const { data, error } = await supabase
    .from("webhook_endpoints")
    .select("id, url, events, description, enabled, created_at")
    .eq("environment", environment)
    .order("created_at", { ascending: false });

  const { data: deliveries } = await supabase
    .from("webhook_deliveries")
    .select(
      "id, status, attempt_count, response_status, created_at, request_body, response_body, webhook_events(type)"
    )
    .order("created_at", { ascending: false })
    .limit(40);

  const rows = (deliveries || []) as unknown as DeliveryRow[];
  const endpoints = (data || []) as WebhookEndpoint[];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Webhooks"
        description="Endpoints profissionais: eventos em tempo real, assinatura HMAC e playground osciloscópio"
      />

      <div className="card text-sm text-flux-muted leading-relaxed space-y-2">
        <p>
          <strong className="text-white">Como usar:</strong> cadastre a URL do seu servidor, escolha os
          eventos e guarde o segredo. Cada entrega leva o cabeçalho{" "}
          <code className="font-mono text-xs text-white">FluxPay-Signature</code> (HMAC-SHA256).
        </p>
        <p>
          Responda <code className="font-mono text-xs text-white">2xx</code> rápido. Use o playground
          abaixo para validar antes de ir para produção.
        </p>
      </div>

      {error ? (
        <ErrorState detail={error.message} />
      ) : (
        <WebhooksManager endpoints={endpoints} canWrite={canWrite(role)} />
      )}

      <WebhookPlayground
        endpoints={endpoints}
        canWrite={canWrite(role)}
        deliveries={rows as PlaygroundDelivery[]}
      />

      <div className="space-y-3">
        <h2 className="font-medium">Entregas recentes</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-flux-muted">
            Ainda não há entregas. Envie um teste no playground ou aguarde um pagamento real.
          </p>
        ) : (
          <Table headers={["ID", "Evento", "Tentativas", "HTTP", "Status", "Quando"]}>
            {rows.map((d) => (
              <tr key={d.id} className="hover:bg-flux-gray/40">
                <td className="px-6 py-4">
                  <Mono>{d.id.slice(0, 8)}</Mono>
                </td>
                <td className="px-6 py-4 font-mono text-xs">{d.webhook_events?.type || "teste"}</td>
                <td className="px-6 py-4 text-flux-muted">{d.attempt_count ?? 0}</td>
                <td className="px-6 py-4 text-flux-muted">{d.response_status ?? "—"}</td>
                <td className="px-6 py-4">
                  <span
                    className={
                      d.status === "success"
                        ? "badge-success"
                        : d.status === "failed"
                          ? "badge-failed"
                          : "badge-pending"
                    }
                  >
                    {deliveryStatusLabel(d.status)}
                  </span>
                </td>
                <td className="px-6 py-4 text-flux-muted whitespace-nowrap">{formatDate(d.created_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}
