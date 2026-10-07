import { ScoreBadge } from "@/components/score/ScoreBadge";
import { FluxMark } from "@/components/brand/FluxLogo";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PublicProfile = {
  slug: string;
  display_name: string;
  bio: string | null;
  work: string | null;
  avatar_url: string | null;
  total_sold_cents: number;
  payment_count: number;
  score: number;
  score_level: string;
  score_level_label: string;
  ranking_position: number | null;
  member_since: string;
};

async function loadProfile(slug: string): Promise<PublicProfile | null> {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "";
  try {
    const res = await fetch(`${base}/v1/u/${encodeURIComponent(slug)}`, {
      next: { revalidate: 30 },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json = await res.json();
    return json.data as PublicProfile;
  } catch {
    return null;
  }
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await loadProfile(slug);
  if (!profile) notFound();

  const sold = (profile.total_sold_cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return (
    <div className="min-h-screen bg-flux-black text-white">
      <header className="border-b border-flux-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <FluxMark className="w-6 h-6" />
            <span className="font-semibold tracking-tight">FluxPay</span>
          </Link>
          <Link href="/ranking" className="text-xs text-flux-muted hover:text-white">
            Ranking
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="relative overflow-hidden rounded-2xl border border-flux-border bg-gradient-to-b from-flux-gray to-flux-dark p-8 sm:p-10">
          <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-flux-accent/10 blur-3xl" />

          <div className="relative flex flex-col sm:flex-row gap-6 items-start">
            <div className="w-24 h-24 rounded-2xl overflow-hidden border border-white/10 bg-flux-gray shrink-0 shadow-xl">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-semibold text-white/50">
                  {profile.display_name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight truncate">
                  {profile.display_name}
                </h1>
                {profile.work && (
                  <p className="text-sm text-flux-accent mt-1">{profile.work}</p>
                )}
              </div>
              {profile.bio && (
                <p className="text-sm text-flux-muted leading-relaxed">{profile.bio}</p>
              )}
              <p className="text-xs text-flux-muted">
                Na FluxPay desde{" "}
                {new Date(profile.member_since).toLocaleDateString("pt-BR", {
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          <div className="relative mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-flux-border bg-black/30 p-4">
              <div className="text-[10px] uppercase tracking-wider text-flux-muted">
                Total vendido
              </div>
              <div className="text-xl font-semibold mt-1">{sold}</div>
              <div className="text-xs text-flux-muted mt-1">
                {profile.payment_count} venda(s) paga(s)
              </div>
            </div>
            <ScoreBadge
              score={profile.score}
              level={profile.score_level}
              levelLabel={profile.score_level_label}
            />
            <div className="rounded-xl border border-flux-border bg-black/30 p-4">
              <div className="text-[10px] uppercase tracking-wider text-flux-muted">
                Ranking
              </div>
              <div className="text-xl font-semibold mt-1">
                {profile.ranking_position
                  ? `#${profile.ranking_position}`
                  : "—"}
              </div>
              <div className="text-xs text-flux-muted mt-1">Posicao atual</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
