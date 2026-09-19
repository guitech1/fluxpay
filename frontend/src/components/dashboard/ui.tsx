import type { ReactNode } from "react";

/** Badge de status de pagamento/reembolso/disputa, com rotulo em portugues. */
const STATUS_STYLES: Record<string, string> = {
  succeeded: "badge-success",
  paid: "badge-success",
  won: "badge-success",
  pending: "badge-pending",
  processing: "badge-pending",
  needs_response: "badge-pending",
  under_review: "badge-pending",
  warning: "badge-pending",
  failed: "badge-failed",
  lost: "badge-failed",
  expired: "badge bg-orange-500/10 text-orange-400",
  canceled: "badge bg-gray-500/10 text-gray-400",
  refunded: "badge bg-blue-500/10 text-blue-400",
  partially_refunded: "badge bg-blue-500/10 text-blue-400",
};

const STATUS_LABELS: Record<string, string> = {
  succeeded: "Aprovado",
  pending: "Pendente",
  processing: "Processando",
  failed: "Recusado",
  canceled: "Cancelado",
  refunded: "Reembolsado",
  partially_refunded: "Reemb. parcial",
  expired: "Expirado",
  needs_response: "Aguardando resposta",
  under_review: "Em análise",
  won: "Ganha",
  lost: "Perdida",
  warning: "Alerta",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={STATUS_STYLES[status] || "badge bg-gray-500/10 text-gray-400"}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-flux-muted mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="card text-center py-16 text-flux-muted">{children}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="card border-red-500/20 bg-red-500/5 text-sm text-red-300">
      Não foi possível carregar estes dados: {message}
    </div>
  );
}

/** Tabela padrao do painel — recebe os cabecalhos e as linhas ja montadas. */
export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-flux-muted border-b border-flux-border bg-flux-gray/30">
              {headers.map((h) => (
                <th key={h} className="px-6 py-3 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-flux-border">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs text-flux-muted">{children}</span>;
}
