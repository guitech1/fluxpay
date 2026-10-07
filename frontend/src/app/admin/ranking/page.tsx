"use client";

import { RankingAdminPanel } from "@/components/admin/RankingAdminPanel";
import { adminFetch } from "@/lib/admin-api";

export default function AdminRankingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ranking</h1>
        <p className="text-flux-muted mt-1 text-sm">
          Gerencie participantes do ranking. Com organizacao vinculada, o volume vem de vendas
          pagas (succeeded). Sem organizacao, informe o valor manualmente. Participantes aparecem
          como entradas normais na pagina publica.
        </p>
      </div>
      <RankingAdminPanel adminFetch={adminFetch} />
    </div>
  );
}
