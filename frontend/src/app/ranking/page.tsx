import { RankingPodium, RankingTable, type RankingRow } from "@/components/ranking/RankingPodium";
import { FluxMark } from "@/components/brand/FluxLogo";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function fetchRanking(): Promise<RankingRow[]> {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "";
  try {
    const res = await fetch(`${base}/v1/ranking?limit=50`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []) as RankingRow[];
  } catch {
    return [];
  }
}

export default async function RankingPage() {
  const rows = await fetchRanking();

  return (
    <div className="min-h-screen bg-flux-black text-white">
      <header className="border-b border-flux-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <FluxMark className="w-6 h-6" />
            <span className="font-semibold tracking-tight">FluxPay</span>
          </Link>
          <span className="text-xs uppercase tracking-[0.2em] text-flux-muted">Ranking</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Ranking FluxPay</h1>
          <p className="text-sm text-flux-muted max-w-lg mx-auto">
            Volume de vendas pagas e FluxPay Score. Valores calculados automaticamente a partir de
            cobrancas succeeded — nao editaveis pelos participantes.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="card text-center py-16 text-flux-muted text-sm">
            Nenhum participante no ranking ainda.
          </div>
        ) : (
          <>
            <RankingPodium top={rows} />
            <RankingTable rows={rows} />
          </>
        )}
      </main>
    </div>
  );
}
