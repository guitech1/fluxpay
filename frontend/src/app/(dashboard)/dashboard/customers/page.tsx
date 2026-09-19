import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { PageHeader, ErrorState } from "@/components/dashboard/ui";
import { CustomersManager } from "@/components/dashboard/CustomersManager";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Leitura pelo Server Component (a RLS filtra por empresa; o ambiente vai
 * explicito). A ESCRITA nao acontece aqui nem no cliente Supabase: vai por
 * /dashboard-api/customers, onde organizacao e ambiente vem da sessao ja
 * conferida no servidor — a RLS sozinha nao sabe qual ambiente o painel esta
 * mostrando, e um id do outro ambiente era gravavel so com o id.
 */
export default async function CustomersPage() {
  const { supabase, environment, role } = await requireDashboardContext();

  const { data, error } = await supabase
    .from("customers")
    .select("id, external_id, email, name, phone, document, created_at")
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <PageHeader title="Clientes" description="Clientes cadastrados no ambiente selecionado" />
      {error ? (
        <ErrorState detail={error.message} />
      ) : (
        <CustomersManager customers={(data || []) as Customer[]} canWrite={canWrite(role)} />
      )}
    </div>
  );
}
