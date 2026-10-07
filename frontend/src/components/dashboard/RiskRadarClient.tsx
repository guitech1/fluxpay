"use client";

import { useEffect, useState } from "react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { cn } from "@/lib/utils";

type Signal = {
  level: "normal" | "attention" | "elevated";
  indicator: string;
  title: string;
  explanation: string;
  detected_at: string;
};

const LEVEL_LABEL: Record<string, string> = {
  normal: "Normal",
  attention: "Atencao",
  elevated: "Elevado",
};

const LEVEL_STYLE: Record<string, string> = {
  normal: "border-emerald-500/30 bg-emerald-500/5 text-emerald-200",
  attention: "border-amber-500/30 bg-amber-500/5 text-amber-100",
  elevated: "border-red-500/30 bg-red-500/5 text-red-100",
};

export function RiskRadarClient() {
  const [level, setLevel] = useState<string>("normal");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await dashboardFetch<{ data: { level: string; signals: Signal[] } }>(
          "/risk-radar"
        );
        setLevel(res.data.level);
        setSignals(res.data.signals);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="text-sm text-flux-muted py-12 text-center">Analisando indicadores...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-400">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className={cn("card border", LEVEL_STYLE[level] || LEVEL_STYLE.normal)}>
        <div className="text-[10px] uppercase tracking-wider opacity-70">Nivel geral</div>
        <div className="text-xl font-semibold mt-1">{LEVEL_LABEL[level] || level}</div>
      </div>

      {signals.map((s, i) => (
        <div key={`${s.indicator}-${i}`} className={cn("card border space-y-2", LEVEL_STYLE[s.level])}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-medium">{s.title}</h3>
            <span className="text-[10px] uppercase tracking-wider opacity-70">
              {LEVEL_LABEL[s.level]}
            </span>
          </div>
          <p className="text-sm opacity-90 leading-relaxed">{s.explanation}</p>
          <p className="text-xs opacity-60">
            Detectado em {new Date(s.detected_at).toLocaleString("pt-BR")}
          </p>
        </div>
      ))}
    </div>
  );
}
