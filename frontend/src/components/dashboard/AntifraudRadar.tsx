"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ShieldCheck, Loader2, X } from "lucide-react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { formatCurrency, formatDate } from "@/lib/utils";

type RadarDot = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  payer_name: string | null;
  suspicious: boolean;
  reasons: string[];
};

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
  dots: RadarDot[];
};

const RISK_UI = {
  low: {
    label: "Risco baixo",
    color: "text-emerald-300",
    ring: "#34d399",
    glow: "rgba(52, 211, 153, 0.25)",
  },
  medium: {
    label: "Risco médio",
    color: "text-amber-300",
    ring: "#fbbf24",
    glow: "rgba(251, 191, 36, 0.28)",
  },
  high: {
    label: "Risco alto",
    color: "text-red-300",
    ring: "#f87171",
    glow: "rgba(248, 113, 113, 0.35)",
  },
} as const;

function polar(cx: number, cy: number, r: number, i: number, n: number) {
  // espiral suave a partir do centro
  const t = n <= 1 ? 0 : i / (n - 1);
  const angle = i * 2.399963; // golden angle
  const radius = 18 + t * (r - 22);
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

export function AntifraudRadar() {
  const [data, setData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RadarDot | null>(null);

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

  const dots = data?.dots ?? [];
  const ui = data ? RISK_UI[data.risk] : RISK_UI.low;

  const placed = useMemo(() => {
    const cx = 140;
    const cy = 140;
    const r = 118;
    return dots.map((d, i) => {
      const { x, y } = polar(cx, cy, r, i, Math.max(dots.length, 1));
      return { ...d, x, y };
    });
  }, [dots]);

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

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            {data.risk === "low" ? (
              <ShieldCheck className={`w-5 h-5 ${ui.color}`} />
            ) : (
              <AlertTriangle className={`w-5 h-5 ${ui.color}`} />
            )}
            <div>
              <p className={`font-medium ${ui.color}`}>{ui.label}</p>
              <p className="text-xs text-flux-muted">
                Toque num ponto para ver o motivo · {dots.filter((d) => d.suspicious).length} suspeito
                {dots.filter((d) => d.suspicious).length === 1 ? "" : "s"} nas 24h
              </p>
            </div>
          </div>
          <Activity className="w-4 h-4 text-flux-muted" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-center">
          <div className="relative mx-auto" style={{ width: 280, height: 280 }}>
            <svg viewBox="0 0 280 280" className="w-full h-full" role="img" aria-label="Radar de risco">
              <defs>
                <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={ui.glow} />
                  <stop offset="70%" stopColor="rgba(0,0,0,0)" />
                </radialGradient>
              </defs>
              <circle cx="140" cy="140" r="130" fill="url(#radarGlow)" />
              {[40, 70, 100, 130].map((rr) => (
                <circle
                  key={rr}
                  cx="140"
                  cy="140"
                  r={rr}
                  fill="none"
                  stroke="rgba(148,163,184,0.15)"
                  strokeWidth="1"
                />
              ))}
              <line x1="140" y1="10" x2="140" y2="270" stroke="rgba(148,163,184,0.12)" />
              <line x1="10" y1="140" x2="270" y2="140" stroke="rgba(148,163,184,0.12)" />
              {/* varredura */}
              <path
                d="M140 140 L140 12 A128 128 0 0 1 250 90 Z"
                fill={ui.ring}
                opacity="0.08"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 140 140"
                  to="360 140 140"
                  dur="6s"
                  repeatCount="indefinite"
                />
              </path>
              <circle cx="140" cy="140" r="3" fill={ui.ring} />

              {placed.map((d) => (
                <g key={d.id} className="cursor-pointer" onClick={() => setSelected(d)}>
                  {d.suspicious ? (
                    <>
                      <circle cx={d.x} cy={d.y} r="10" fill="#ef4444" opacity="0.25">
                        <animate
                          attributeName="r"
                          values="8;14;8"
                          dur="1.4s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          values="0.35;0.08;0.35"
                          dur="1.4s"
                          repeatCount="indefinite"
                        />
                      </circle>
                      <circle
                        cx={d.x}
                        cy={d.y}
                        r="4.5"
                        fill="#f87171"
                        stroke="#fecaca"
                        strokeWidth="1"
                      />
                    </>
                  ) : (
                    <circle
                      cx={d.x}
                      cy={d.y}
                      r="3.5"
                      fill="#64748b"
                      opacity="0.85"
                      className="hover:opacity-100"
                    />
                  )}
                </g>
              ))}
            </svg>
          </div>

          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="PIX / hora" value={String(data.pix_last_hour)} />
              <Stat label="PIX / 24h" value={String(data.pix_last_24h)} />
              <Stat label="Falhas 24h" value={String(data.failed_last_24h)} />
              <Stat label="Docs negados" value={String(data.denied_documents_24h)} />
            </div>
            {data.new_account && (
              <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                Conta nova sob regras reforçadas (limite {data.rules.max_per_hour}/h ativo:{" "}
                {data.rules.max_per_hour_enabled ? "sim" : "não"}).
              </p>
            )}
            <p className="text-xs text-flux-muted flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-500" /> normal
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" /> suspeito
              </span>
            </p>
          </div>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 py-6">
          <div className="card w-full max-w-md space-y-3 relative">
            <button
              type="button"
              className="absolute top-3 right-3 text-flux-muted hover:text-white"
              onClick={() => setSelected(null)}
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              {selected.suspicious ? (
                <AlertTriangle className="w-5 h-5 text-red-300" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-emerald-300" />
              )}
              <h3 className="font-medium">
                {selected.suspicious ? "Transação suspeita" : "Transação normal"}
              </h3>
            </div>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-flux-muted">Valor</dt>
                <dd className="font-semibold">{formatCurrency(selected.amount)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-flux-muted">Status</dt>
                <dd>{selected.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-flux-muted">Pagador</dt>
                <dd>{selected.payer_name || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-flux-muted">Quando</dt>
                <dd className="text-right">{formatDate(selected.created_at)}</dd>
              </div>
            </dl>
            {selected.reasons.length > 0 ? (
              <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2">
                <p className="text-xs font-semibold text-red-200 mb-1.5">Por quê</p>
                <ul className="text-sm text-red-100/90 space-y-1 list-disc pl-4">
                  {selected.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-flux-muted">Nenhum sinal de risco neste ponto.</p>
            )}
            <button type="button" className="btn-primary text-sm w-full" onClick={() => setSelected(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-flux-border bg-flux-gray/40 px-3 py-2">
      <p className="text-[0.65rem] uppercase tracking-wider text-flux-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
