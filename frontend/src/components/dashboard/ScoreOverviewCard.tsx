"use client";

import { useEffect, useState } from "react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { ScoreBadge } from "@/components/score/ScoreBadge";
import Link from "next/link";

export function ScoreOverviewCard() {
  const [data, setData] = useState<{
    score: number;
    level: string;
    level_label: string;
    progress_to_next: number;
    explanation: string;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await dashboardFetch<{ data: typeof data }>("/score");
        setData(res.data);
      } catch {
        // Score e informativo; falha nao quebra a visao geral
      }
    })();
  }, []);

  if (!data) {
    return (
      <div className="card text-sm text-flux-muted py-8 text-center">
        Carregando FluxPay Score...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ScoreBadge
        score={data.score}
        level={data.level}
        levelLabel={data.level_label}
        showProgress
        progress={data.progress_to_next}
        size="lg"
      />
      <p className="text-xs text-flux-muted leading-relaxed">{data.explanation}</p>
      <Link href="/dashboard/profile" className="text-xs text-flux-accent hover:underline">
        Ver perfil publico e Score
      </Link>
    </div>
  );
}
