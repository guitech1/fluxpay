import Link from "next/link";
import { Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FluxLogo } from "@/components/brand/FluxLogo";

/**
 * Pagina mostrada quando o modo manutencao esta ligado com escopo "all" ou
 * "dashboard". Quem redireciona para ca e o middleware (server-side).
 *
 * A mensagem vem da mesma configuracao que o ADM edita, lida pelo RPC
 * fluxpay_maintenance_status (migration 012) — que so devolve campos publicos.
 */
export const dynamic = "force-dynamic";

interface MaintenanceStatus {
  enabled: boolean;
  message: string;
  scope: "all" | "api" | "dashboard";
  allow_admins: boolean;
  is_platform_admin: boolean;
}

export default async function MaintenancePage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("fluxpay_maintenance_status");
  const status = (data ?? null) as MaintenanceStatus | null;

  const message =
    status?.message || "A FluxPay está em manutenção. Voltamos em instantes.";

  return (
    <div className="min-h-screen bg-flux-black surface-grid flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <FluxLogo className="justify-center mb-8" />

        <div className="card">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-5">
            <Wrench className="w-5 h-5 text-amber-400" />
          </div>

          <h1 className="text-lg font-semibold">Manutenção em andamento</h1>
          <p className="text-sm text-flux-muted mt-2 leading-relaxed">{message}</p>

          {!status?.enabled && (
            <p className="text-xs text-emerald-400 mt-5">
              A manutenção já foi encerrada. Você pode voltar ao painel.
            </p>
          )}

          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/dashboard" className="btn-primary">
              Tentar novamente
            </Link>
            {status?.is_platform_admin && (
              <Link href="/admin/settings" className="btn-ghost">
                Abrir o ADM
              </Link>
            )}
          </div>
        </div>

        <p className="text-xs text-flux-muted mt-6">
          Cobranças já confirmadas continuam registradas. Nenhum pagamento é perdido
          durante a manutenção.
        </p>
      </div>
    </div>
  );
}
