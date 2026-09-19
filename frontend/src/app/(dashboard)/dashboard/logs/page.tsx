import Link from "next/link";
import { FileText } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { formatDate } from "@/lib/utils";
import { PageHeader, Table, Mono, EmptyState, ErrorState } from "@/components/dashboard/ui";
import type { ApiLog } from "@/lib/types";

export const dynamic = "force-dynamic";

function statusClass(code: number | null): string {
  if (!code) return "text-flux-muted";
  if (code >= 500) return "text-red-400";
  if (code >= 400) return "text-amber-400";
  return "text-emerald-400";
}

export default async function LogsPage() {
  const { supabase, environment } = await requireDashboardContext();

  const { data, error } = await supabase
    .from("api_logs")
    .select("id, method, path, status_code, duration_ms, request_id, ip_address, created_at")
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(200);

  const logs = (data || []) as ApiLog[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logs da API"
        description="Toda chamada autenticada por chave de API em /v1/* (200 mais recentes)"
      />

      {error ? (
        <ErrorState detail={error.message} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhuma chamada registrada"
          description="Toda requisição feita com uma chave de API deste ambiente aparece aqui, com data, origem e resultado."
          action={
            <Link href="/dashboard/api" className="btn-secondary">
              Ver chaves e documentação
            </Link>
          }
        />
      ) : (
        <Table headers={["Método", "Rota", "Status", "Duração", "IP", "Request ID", "Quando"]}>
          {logs.map((l) => (
            <tr key={l.id} className="hover:bg-flux-gray/40">
              <td className="px-6 py-4 font-mono text-xs">{l.method}</td>
              <td className="px-6 py-4 font-mono text-xs">{l.path}</td>
              <td className={`px-6 py-4 font-mono text-xs ${statusClass(l.status_code)}`}>
                {l.status_code ?? "—"}
              </td>
              <td className="px-6 py-4 text-flux-muted">
                {l.duration_ms != null ? `${l.duration_ms} ms` : "—"}
              </td>
              <td className="px-6 py-4 text-flux-muted">{l.ip_address || "—"}</td>
              <td className="px-6 py-4">
                {l.request_id ? <Mono>{l.request_id.slice(0, 12)}</Mono> : <span className="text-flux-muted">—</span>}
              </td>
              <td className="px-6 py-4 text-flux-muted whitespace-nowrap">{formatDate(l.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
