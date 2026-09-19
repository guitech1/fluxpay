import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Peças de interface compartilhadas por todo o painel.
 *
 * Este arquivo é propositalmente de Server Components (sem "use client"):
 * nada aqui tem estado. O que precisa de interação vive em ui-client.tsx.
 */

/** Badge de status de pagamento/reembolso/disputa, com rótulo em português. */
const STATUS_STYLES: Record<string, string> = {
  succeeded: "badge-success",
  paid: "badge-success",
  won: "badge-success",
  complete: "badge-success",
  pending: "badge-pending",
  processing: "badge-pending",
  open: "badge-pending",
  needs_response: "badge-pending",
  under_review: "badge-pending",
  warning: "badge-pending",
  failed: "badge-failed",
  lost: "badge-failed",
  expired: "badge bg-orange-500/10 text-orange-300",
  canceled: "badge bg-flux-gray-light text-flux-muted",
  refunded: "badge bg-sky-500/10 text-sky-300",
  partially_refunded: "badge bg-sky-500/10 text-sky-300",
};

const STATUS_LABELS: Record<string, string> = {
  succeeded: "Aprovado",
  paid: "Pago",
  pending: "Pendente",
  processing: "Processando",
  open: "Aberta",
  complete: "Concluída",
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
    <span className={STATUS_STYLES[status] || "badge bg-flux-gray-light text-flux-muted"}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
  backHref,
  backLabel,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="space-y-3">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-flux-muted hover:text-white"
        >
          <span aria-hidden>&larr;</span>
          {backLabel || "Voltar"}
        </Link>
      )}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-flux-muted mt-1 max-w-2xl">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

/** Divisória de seção dentro de uma página. */
export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        <h2 className="font-medium">{title}</h2>
        {description && <p className="text-sm text-flux-muted mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Estado vazio. Sempre com um próximo passo concreto: a tela vazia é o
 * primeiro contato de quem acabou de criar a conta.
 */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: React.ElementType;
}) {
  return (
    <div className="card flex flex-col items-center text-center py-14 px-6">
      {Icon && (
        <div className="w-11 h-11 rounded-xl border border-flux-border bg-flux-gray flex items-center justify-center mb-4">
          <Icon className="w-5 h-5 text-flux-muted" />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {description && (
        <p className="text-sm text-flux-muted mt-1.5 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/**
 * Estado de erro visível ao usuário.
 *
 * Nunca recebe a mensagem crua do Supabase/Postgres: o detalhe técnico fica
 * no log do servidor (o `detail` abaixo), e a tela mostra uma frase que dá
 * para agir em cima.
 */
export function ErrorState({
  title = "Não foi possível carregar estes dados",
  description = "Atualize a página em alguns instantes. Se o problema continuar, fale com o suporte.",
  detail,
}: {
  title?: string;
  description?: string;
  detail?: string | null;
}) {
  if (detail) console.error("[fluxpay] falha ao carregar dados:", detail);

  return (
    <div className="card">
      <p className="font-medium text-sm">{title}</p>
      <p className="text-sm text-flux-muted mt-1">{description}</p>
    </div>
  );
}

/** Tabela padrão do painel — recebe os cabeçalhos e as linhas já montadas. */
export function Table({
  headers,
  children,
  align,
}: {
  headers: string[];
  children: ReactNode;
  /** Índices de coluna alinhados à direita (valores, ações). */
  align?: Record<number, "right" | "center">;
}) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-flux-muted border-b border-flux-border bg-flux-gray/40">
              {headers.map((h, i) => (
                <th
                  key={`${h}-${i}`}
                  scope="col"
                  className={cn(
                    "px-5 py-3 text-xs font-medium uppercase tracking-wide whitespace-nowrap",
                    align?.[i] === "right" && "text-right",
                    align?.[i] === "center" && "text-center"
                  )}
                >
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

/** Bloco de esqueleto para loading (usado nos loading.tsx das rotas). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-flux-gray-light/60", className)} />;
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="border-b border-flux-border bg-flux-gray/40 px-5 py-3 flex gap-6">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-flux-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-5 py-4 flex gap-6">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Paginação por querystring (as listas do painel são Server Components). */
export function Pagination({
  basePath,
  query,
  page,
  hasMore,
}: {
  basePath: string;
  query: Record<string, string | undefined>;
  page: number;
  hasMore: boolean;
}) {
  function hrefFor(target: number): string {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  if (page === 1 && !hasMore) return null;

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-flux-muted">Página {page}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="btn-ghost px-3 py-2 text-sm">
            Anterior
          </Link>
        ) : (
          <span className="btn-ghost px-3 py-2 text-sm opacity-40 pointer-events-none">
            Anterior
          </span>
        )}
        {hasMore ? (
          <Link href={hrefFor(page + 1)} className="btn-ghost px-3 py-2 text-sm">
            Próxima
          </Link>
        ) : (
          <span className="btn-ghost px-3 py-2 text-sm opacity-40 pointer-events-none">
            Próxima
          </span>
        )}
      </div>
    </div>
  );
}

/** Par rótulo/valor usado nas telas de detalhe. */
export function DetailRow({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-2.5 border-b border-flux-border last:border-0">
      <dt className="text-sm text-flux-muted sm:w-48 shrink-0">{label}</dt>
      <dd className={cn("text-sm min-w-0 break-words", mono && "font-mono text-xs")}>{children}</dd>
    </div>
  );
}
