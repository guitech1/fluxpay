"use client";

import { cn } from "@/lib/utils";

const LEVEL_STYLES: Record<string, string> = {
  bronze: "from-amber-800/40 to-amber-600/20 border-amber-700/50 text-amber-200",
  silver: "from-slate-400/30 to-slate-500/10 border-slate-400/40 text-slate-100",
  gold: "from-yellow-500/30 to-amber-400/10 border-yellow-500/50 text-yellow-100",
  elite: "from-violet-500/30 to-fuchsia-500/10 border-violet-400/50 text-violet-100",
};

export function ScoreBadge({
  score,
  level,
  levelLabel,
  size = "md",
  showProgress,
  progress,
}: {
  score: number;
  level: string;
  levelLabel: string;
  size?: "sm" | "md" | "lg";
  showProgress?: boolean;
  progress?: number;
}) {
  const style = LEVEL_STYLES[level] || LEVEL_STYLES.bronze;
  return (
    <div
      className={cn(
        "rounded-xl border bg-gradient-to-br p-3",
        style,
        size === "sm" && "p-2",
        size === "lg" && "p-5"
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className={cn("text-[10px] uppercase tracking-[0.2em] opacity-70")}>
            FluxPay Score
          </div>
          <div className={cn("font-semibold tracking-tight", size === "lg" ? "text-4xl" : size === "sm" ? "text-lg" : "text-2xl")}>
            {score}
          </div>
        </div>
        <div className={cn("font-medium", size === "sm" ? "text-xs" : "text-sm")}>
          {levelLabel}
        </div>
      </div>
      {showProgress && typeof progress === "number" && (
        <div className="mt-3 h-1.5 rounded-full bg-black/30 overflow-hidden">
          <div
            className="h-full rounded-full bg-white/70 transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
