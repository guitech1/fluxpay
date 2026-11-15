"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ShieldCheck, Loader2 } from "lucide-react";
import { dashboardFetch } from "@/lib/dashboard-api";

type RadarData = {
  risk: "low" | "medium" | "high";
  pix_last_hour: number;
  pix_last_24h: number;
  failed_last_24h: number;
  denied_documents_24h: number;
  new_account: boolean;
  rules: {
    max_per_hour_enabled: boolean;
    max_per_hour: number;
    confirm_denied_enabled: boolean;
  };
};

const RISK_UI = {
  low: {
    label: "Risco baixo",
    color: "text-emerald-300",
    bg: "bg-emerald-500/10 border-emerald-500/25",
    bar: "bg-emerald-400",
    width: "28%",
  },
  medium: {
    label: "Risco médio",
    color: "text-amber-300",
    bg: "bg-amber-500/10 border-amber-500/25",
    bar: "bg-amber-400",
    width: "58%",
  },
  high: {
    label: "Risco alto",
    color: "text-red-300",
    bg: "bg-red-500/10 border-red-500/25",
    bar: "bg-red-400",
    width: "88%",
  },
} as const;

export function AntifraudRadar() {
  const [data, setData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await dashboardFetch<{ data: RadarData }>("/antifraud/radar");
        if (!cancelled) setData(res.data);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="card flex items-center gap-2 text-flux-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando radar…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card text-sm text-flux-muted">
        Não foi possível montar o radar agora. As regras abaixo ainda funcionam normalmente.
      </div>
    );
  }

  const ui = RISK_UI[data.risk];

  return (
    <div className="space-y-4">
      <div className={`card border ${ui.bg}`}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {data.risk === "low" ? (
              <ShieldCheck className={`w-5 h-5 ${ui.color}`} />
            ) : (
              <AlertTriangle className={`w-5 h-5 ${ui.color}`} />
            )}
            <span className={`font-medium ${ui.color}`}>{ui.label}</span>
          </div>
          <Activity className="w-4 h-4 text-flux-muted" />
        </div>
        <div className="h-2 rounded-full bg-black/30 overflow-hidden">
          <div className={`h-full rounded-full ${ui.bar}`} style={{ width: ui.width }} />
        </div>
        <p className="text-xs text-flux-muted mt-3">
          Baseado nas suas regras e no volume das últimas horas — sem jargão de banco.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "PIX na última hora", value: data.pix_last_hour },
          { label: "PIX nas 24h", value: data.pix_last_24h },
          { label: "Falhas 24h", value: data.failed_last_24h },
          { label: "CPFs negados 24h", value: data.denied_documents_24h },
        ].map((c) => (
          <div key={c.label} className="card py-3 px-4">
            <p className="text-xs text-flux-muted">{c.label}</p>
            <p className="text-xl font-semibold mt-1 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {data.new_account && (
        <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
          Conta em período de observação (regras de conta nova ativas).
          {data.rules.max_per_hour_enabled
            ? ` Limite: ${data.rules.max_per_hour} PIX/hora.`
            : ""}
        </div>
      )}
    </div>
  );
}
