import { requirePlatformAdmin } from "@/lib/admin-server";
import { AntifraudRadar } from "@/components/dashboard/AntifraudRadar";

export const dynamic = "force-dynamic";

/**
 * Motor antifraude e radar — exclusivo do painel ADM.
 */
export default async function AdminAntifraudPage() {
  await requirePlatformAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Antifraude</h1>
        <p className="text-flux-muted mt-1">
          Radar de risco e visão de plataforma — não aparece no painel do lojista
        </p>
      </div>
      <AntifraudRadar />
      <div className="card text-sm text-flux-muted leading-relaxed">
        <p>
          O radar usa dados da conta em contexto do ambiente selecionado no ADM. Para operação em
          tempo real de filas, webhooks e adquirentes, use também a{" "}
          <a href="/admin/control-room" className="text-white underline underline-offset-2">
            Sala de controle
          </a>
          .
        </p>
      </div>
    </div>
  );
}
