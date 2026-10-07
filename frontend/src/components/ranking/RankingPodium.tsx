"use client";

import { cn } from "@/lib/utils";

export type RankingRow = {
  position: number;
  id: string;
  display_name: string;
  avatar_url: string | null;
  amount_cents: number;
  score: number;
  score_level_label: string;
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className="rounded-full overflow-hidden border-2 border-white/20 bg-flux-gray flex items-center justify-center shrink-0 shadow-lg"
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-sm font-medium text-white/80">{initials}</span>
      )}
    </div>
  );
}

/**
 * Premium 3D podium using CSS perspective, layered faces, lighting and reflection.
 * No heavy 3D library — pure CSS 3D transforms available in the project.
 */
export function RankingPodium({ top }: { top: RankingRow[] }) {
  const first = top.find((t) => t.position === 1);
  const second = top.find((t) => t.position === 2);
  const third = top.find((t) => t.position === 3);

  return (
    <div className="relative w-full max-w-3xl mx-auto py-8 px-2">
      <div
        className="relative flex items-end justify-center gap-2 sm:gap-4"
        style={{ perspective: "900px", minHeight: 280 }}
      >
        {/* ambient light */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(239,68,68,0.18),transparent_55%)]" />

        <PodiumColumn place={2} entry={second} height={120} accent="#94a3b8" />
        <PodiumColumn place={1} entry={first} height={170} accent="#fbbf24" highlight />
        <PodiumColumn place={3} entry={third} height={95} accent="#b45309" />
      </div>

      {/* floor reflection */}
      <div className="mx-auto mt-2 h-8 max-w-md rounded-[100%] bg-gradient-to-b from-white/5 to-transparent blur-md" />
    </div>
  );
}

function PodiumColumn({
  place,
  entry,
  height,
  accent,
  highlight,
}: {
  place: 1 | 2 | 3;
  entry?: RankingRow;
  height: number;
  accent: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center w-[30%] max-w-[140px]">
      {entry && (
        <div className={cn("mb-3 text-center space-y-1.5", highlight && "scale-105")}>
          <Avatar name={entry.display_name} url={entry.avatar_url} size={highlight ? 64 : 48} />
          <div className="text-xs sm:text-sm font-medium truncate max-w-full px-1">
            {entry.display_name}
          </div>
          <div className="text-[11px] text-flux-muted">{formatBRL(entry.amount_cents)}</div>
          <div className="text-[10px] uppercase tracking-wider opacity-70">
            Score {entry.score} · {entry.score_level_label}
          </div>
        </div>
      )}
      <div
        className="relative w-full rounded-t-lg overflow-hidden"
        style={{
          height,
          transformStyle: "preserve-3d",
          transform: "rotateX(8deg)",
          boxShadow: `0 -8px 32px ${accent}33, inset 0 1px 0 rgba(255,255,255,0.25)`,
          background: `linear-gradient(160deg, ${accent}55 0%, #111 45%, #0a0a0a 100%)`,
          border: `1px solid ${accent}44`,
        }}
      >
        {/* top face highlight */}
        <div
          className="absolute inset-x-0 top-0 h-4 opacity-40"
          style={{ background: `linear-gradient(180deg, ${accent}, transparent)` }}
        />
        {/* side depth edge */}
        <div className="absolute inset-y-0 right-0 w-[3px] bg-black/40" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-4xl sm:text-5xl font-bold tracking-tighter opacity-90"
            style={{ color: accent, textShadow: `0 0 24px ${accent}66` }}
          >
            {place}
          </span>
        </div>
        {/* bottom reflection strip */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent" />
      </div>
    </div>
  );
}

export function RankingTable({ rows }: { rows: RankingRow[] }) {
  const rest = rows.filter((r) => r.position > 3);
  if (rest.length === 0) return null;
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-flux-muted border-b border-flux-border">
            <th className="py-3 px-4 font-medium w-16">Pos.</th>
            <th className="py-3 px-4 font-medium">Participante</th>
            <th className="py-3 px-4 font-medium text-right">Volume</th>
            <th className="py-3 px-4 font-medium text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {rest.map((row) => (
            <tr key={row.id} className="border-b border-flux-border/50 last:border-0">
              <td className="py-3 px-4 font-mono text-flux-muted">{row.position}</td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <Avatar name={row.display_name} url={row.avatar_url} size={32} />
                  <span className="font-medium truncate">{row.display_name}</span>
                </div>
              </td>
              <td className="py-3 px-4 text-right whitespace-nowrap">
                {formatBRL(row.amount_cents)}
              </td>
              <td className="py-3 px-4 text-right">
                <span className="font-medium">{row.score}</span>
                <span className="text-flux-muted text-xs ml-1">{row.score_level_label}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
