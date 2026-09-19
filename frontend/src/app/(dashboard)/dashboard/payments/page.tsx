import Link from "next/link";
import { CreditCard, Plus, Search } from "lucide-react";
import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { paymentTypeLabel } from "@/lib/labels";
import {
  PageHeader,
  StatusBadge,
  Table,
  Mono,
  EmptyState,
  ErrorState,
  Pagination,
} from "@/components/dashboard/ui";
import type { Payment } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const FILTERS = [
  { value: "all", label: "Todos" },
  { value: "succeeded", label: "Aprovados" },
  { value: "pending", label: "Pendentes" },
  { value: "failed", label: "Recusados" },
  { value: "expired", label: "Expirados" },
  { value: "refunded", label: "Reembolsados" },
  { value: "canceled", label: "Cancelados" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { supabase, environment, role } = await requireDashboardContext();
  const { status, q, page: pageParam } = await searchParams;

  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const term = (q || "").trim();

  let query = supabase
    .from("payments")
    .select(
      "id, amount, currency, status, payment_type, provider, provider_txid, fee_amount, net_amount, description, created_at, paid_at, expires_at, customers(id, name, email)"
    )
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    // Pede um a mais do que cabe na página para saber se existe próxima.
    .range(from, from + PAGE_SIZE);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (term) {
    if (UUID.test(term)) {
      query = query.eq("id", term);
    } else {
      // Vírgula e parênteses são separadores do filtro `or` do PostgREST:
      // sem tirar, uma busca comum vira um filtro inválido.
      const safe = term.replace(/[,()]/g, " ");
      query = query.or(`description.ilike.%${safe}%,provider_txid.ilike.%${safe}%`);
    }
  }

  const { data, error } = await query;

  const rows = (data || []) as unknown as Payment[];
  const hasMore = rows.length > PAGE_SIZE;
  const payments = rows.slice(0, PAGE_SIZE);
  const filtering = Boolean(term) || (status && status !== "all");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagamentos"
        description="Cobranças criadas pelo painel, pelo checkout e pela API."
        action={
          canWrite(role) ? (
            <Link href="/dashboard/payments/new" className="btn-primary w-full sm:w-auto">
              <Plus className="w-4 h-4" />
              Nova cobrança
            </Link>
          ) : undefined
        }
      />

      {/* Busca e filtros. Formulário GET: funciona sem JavaScript e mantém a
          URL compartilhável. */}
      <div className="space-y-3">
        <form action="/dashboard/payments" className="flex gap-2">
          {status && status !== "all" && <input type="hidden" name="status" value={status} />}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-flux-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              name="q"
              defaultValue={term}
              className="input pl-9"
              placeholder="Buscar por descrição, identificador da transação ou ID"
              aria-label="Buscar cobranças"
            />
          </div>
          <button type="submit" className="btn-secondary">
            Buscar
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = (status || "all") === f.value;
            const params = new URLSearchParams();
            if (f.value !== "all") params.set("status", f.value);
            if (term) params.set("q", term);
            const qs = params.toString();
            return (
              <Link
                key={f.value}
                href={qs ? `/dashboard/payments?${qs}` : "/dashboard/payments"}
                aria-current={active ? "true" : undefined}
                className={
                  active
                    ? "px-3 py-1.5 rounded-lg text-xs font-medium bg-flux-gray-light text-white border border-flux-gray-light"
                    : "px-3 py-1.5 rounded-lg text-xs font-medium text-flux-muted border border-flux-border hover:text-white hover:border-flux-gray-light transition-colors"
                }
              >
                {f.label}
              </Link>
            );
          })}
        </div>
      </div>

      {error ? (
        <ErrorState detail={error.message} />
      ) : payments.length === 0 ? (
        filtering ? (
          <EmptyState
            icon={Search}
            title="Nenhuma cobrança encontrada"
            description="Nenhum resultado para esta busca ou filtro. Tente outro termo."
            action={
              <Link href="/dashboard/payments" className="btn-secondary">
                Limpar filtros
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={CreditCard}
            title="Nenhuma cobrança ainda"
            description="Crie sua primeira cobrança PIX pelo painel. O QR Code e o código copia e cola são gerados na hora."
            action={
              canWrite(role) ? (
                <Link href="/dashboard/payments/new" className="btn-primary">
                  <Plus className="w-4 h-4" />
                  Nova cobrança
                </Link>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <Table
            headers={["Cobrança", "Cliente", "Valor", "Taxa", "Método", "Status", "Data"]}
            align={{ 2: "right", 3: "right" }}
          >
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-flux-gray/40 transition-colors">
                <td className="px-5 py-4">
                  <Link href={`/dashboard/payments/${p.id}`} className="hover:underline">
                    <Mono>{p.id.slice(0, 8)}</Mono>
                  </Link>
                  {p.description && (
                    <div className="text-xs text-flux-muted truncate max-w-[220px] mt-0.5">
                      {p.description}
                    </div>
                  )}
                </td>
                <td className="px-5 py-4">
                  {p.customers?.name || p.customers?.email || (
                    <span className="text-flux-muted">—</span>
                  )}
                </td>
                <td className="px-5 py-4 font-medium whitespace-nowrap text-right">
                  {formatCurrency(p.amount, p.currency)}
                </td>
                <td className="px-5 py-4 text-flux-muted whitespace-nowrap text-right">
                  {p.fee_amount ? formatCurrency(p.fee_amount, p.currency) : "—"}
                </td>
                <td className="px-5 py-4 text-flux-muted text-xs">
                  {paymentTypeLabel(p.payment_type)}
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-5 py-4 text-flux-muted whitespace-nowrap">
                  {formatDate(p.created_at)}
                </td>
              </tr>
            ))}
          </Table>

          <Pagination
            basePath="/dashboard/payments"
            query={{ status: status && status !== "all" ? status : undefined, q: term || undefined }}
            page={page}
            hasMore={hasMore}
          />
        </>
      )}
    </div>
  );
}
