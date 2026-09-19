import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { formatDate } from "@/lib/utils";
import { PageHeader, ErrorState, Table, Mono } from "@/components/dashboard/ui";
import { WebhooksManager } from "@/components/dashboard/WebhooksManager";
import type { WebhookEndpoint } from "@/lib/types";

export const dynamic = "force-dynamic";

interface DeliveryRow {
  id: string;
  status: string;
  attempt_count: number | null;
  response_status: number | null;
  created_at: string;
  webhook_events?: { type: string } | null;
}

export default async function WebhooksPage() {
  const { supabase, environment, role } = await requireDashboardContext();

  const { data, error } = await supabase
    .from("webhook_endpoints")
    .select("id, url, events, description, enabled, created_at")
    .eq("environment", environment)
    .order("created_at", { ascending: false });

  // Entregas recentes: util para depurar endpoint que nao responde.
  const { data: deliveries } = await supabase
    .from("webhook_deliveries")
    .select("id, status, attempt_count, response_status, created_at, webhook_events(type)")
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = (deliveries || []) as unknown as DeliveryRow[];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Webhooks"
        description="Endpoints que recebem os eventos do FluxPay"
      />

      {error ? (
        <ErrorState detail={error.message} />
      ) : (
        <WebhooksManager
          endpoints={(data || []) as WebhookEndpoint[]}
          canWrite={canWrite(role)}
        />
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium">Entregas recentes</h2>
          <Table headers={["ID", "Evento", "Tentativas", "Resposta", "Status", "Quando"]}>
            {rows.map((d) => (
              <tr key={d.id} className="hover:bg-flux-gray/40">
                <td className="px-6 py-4">
                  <Mono>{d.id.slice(0, 8)}</Mono>
                </td>
                <td className="px-6 py-4 font-mono text-xs">{d.webhook_events?.type || "—"}</td>
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
                    {d.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-flux-muted whitespace-nowrap">{formatDate(d.created_at)}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  );
}
