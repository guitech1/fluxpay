"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface VirtualCardProps {
  fullName: string;
  cardNumber: string | null;
  status: "approved" | "blocked" | "pending_review" | "rejected";
  className?: string;
}

export function VirtualCard({
  fullName,
  cardNumber,
  status,
  className,
}: VirtualCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [shine, setShine] = useState({ x: 50, y: 50 });
  const cardRef = useRef<HTMLDivElement>(null);
  const isBlocked = status === "blocked";

  const displayNumber = cardNumber
    ? cardNumber.replace(/(\d{4})(?=\d)/g, "$1 ").trim()
    : "•••• •••• •••• ••••";

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = cardRef.current;
      if (!el || flipped) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      setTilt({ x: (py - 0.5) * -12, y: (px - 0.5) * 14 });
      setShine({ x: px * 100, y: py * 100 });
    },
    [flipped]
  );

  const onLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setShine({ x: 50, y: 50 });
  }, []);

  return (
    <div className={cn("relative w-full max-w-[420px] mx-auto", className)}>
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        aria-label="Cartao FluxPay. Clique para virar."
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="relative w-full aspect-[1.586/1] cursor-pointer transition-transform duration-500 ease-out"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped
            ? "rotateY(180deg)"
            : `rotateY(0deg) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        }}
      >
        <div
          className={cn(
            "absolute inset-0 rounded-2xl overflow-hidden border border-white/10",
            "shadow-[0_20px_50px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset]"
          )}
          style={{
            backfaceVisibility: "hidden",
            background:
              "linear-gradient(145deg, #1a1a1f 0%, #0d0d10 40%, #15151a 70%, #0a0a0c 100%)",
          }}
        >
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 100% 0%, rgba(252,0,25,0.35), transparent 55%), radial-gradient(ellipse 60% 50% at 0% 100%, rgba(252,0,25,0.12), transparent 50%)",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              background: `radial-gradient(circle at ${shine.x}% ${shine.y}%, rgba(255,255,255,0.22), transparent 45%)`,
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, #fff 0px, #fff 1px, transparent 1px, transparent 8px)",
            }}
          />

          <div className="relative h-full flex flex-col justify-between p-5 sm:p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <FluxPayMark />
                <span className="text-[11px] sm:text-xs font-semibold tracking-[0.2em] text-white/90 uppercase">
                  FluxPay
                </span>
              </div>
              {isBlocked && (
                <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                  Bloqueado
                </span>
              )}
            </div>

            <div className="mt-3 sm:mt-4">
              <ChipGraphic />
            </div>

            <div className="mt-auto space-y-3 sm:space-y-4">
              <div
                className={cn(
                  "font-mono text-base sm:text-xl tracking-[0.18em] text-white/95",
                  isBlocked && "opacity-50"
                )}
              >
                {displayNumber}
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-[0.15em] text-white/40 mb-0.5">
                    Titular
                  </div>
                  <div className="text-sm sm:text-base font-medium text-white/90 truncate uppercase tracking-wide">
                    {fullName || "—"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[9px] uppercase tracking-[0.15em] text-white/40 mb-0.5">
                    Tipo
                  </div>
                  <div className="text-xs font-medium text-white/70 tracking-wider">
                    VIRTUAL
                  </div>
                </div>
              </div>
            </div>
          </div>

          {isBlocked && (
            <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
              <div className="text-sm font-semibold text-white/90 tracking-wide uppercase">
                Cartao bloqueado
              </div>
            </div>
          )}
        </div>

        <div
          className="absolute inset-0 rounded-2xl overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background:
              "linear-gradient(145deg, #121216 0%, #0a0a0c 50%, #141418 100%)",
          }}
        >
          <div className="h-10 sm:h-12 bg-black/80 mt-5 sm:mt-6" />
          <div className="px-5 sm:px-6 pt-4 space-y-3">
            <div className="h-8 rounded bg-white/90 flex items-center justify-end px-3">
              <span className="font-mono text-xs text-black/70 tracking-widest">
                FluxPay
              </span>
            </div>
            <div className="text-[10px] text-white/40 leading-relaxed">
              Carteira interna FluxPay. Destinada a transferencias entre usuarios
              da plataforma. O numero identifica a carteira destinataria.
            </div>
            <div className="pt-2">
              <div className="text-[9px] uppercase tracking-[0.15em] text-white/35 mb-1">
                Status
              </div>
              <div className="text-sm text-white/80">
                {status === "approved"
                  ? "Ativo"
                  : status === "blocked"
                    ? "Bloqueado"
                    : status}
              </div>
            </div>
          </div>
          <div className="absolute bottom-4 right-5">
            <FluxPayMark small />
          </div>
        </div>
      </div>
    </div>
  );
}

function FluxPayMark({ small }: { small?: boolean }) {
  const size = small ? 20 : 28;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#FC0019" />
      <path
        d="M8 10h12.5c3 0 5 1.8 5 4.4 0 2.5-1.9 4.2-4.7 4.2H13.5V22H8V10zm5.5 5.4h5.2c1.1 0 1.8-.6 1.8-1.5s-.7-1.5-1.8-1.5h-5.2v3z"
        fill="white"
      />
    </svg>
  );
}

function ChipGraphic() {
  return (
    <svg width="42" height="32" viewBox="0 0 42 32" fill="none" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="41"
        height="31"
        rx="5"
        fill="url(#chipGrad)"
        stroke="rgba(255,255,255,0.25)"
      />
      <rect x="8" y="6" width="26" height="20" rx="2" fill="rgba(0,0,0,0.15)" />
      <line x1="8" y1="12" x2="34" y2="12" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      <line x1="8" y1="16" x2="34" y2="16" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      <line x1="8" y1="20" x2="34" y2="20" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      <line x1="16" y1="6" x2="16" y2="26" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      <line x1="26" y1="6" x2="26" y2="26" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      <defs>
        <linearGradient id="chipGrad" x1="0" y1="0" x2="42" y2="32">
          <stop stopColor="#D4AF37" />
          <stop offset="0.5" stopColor="#F5E6A3" />
          <stop offset="1" stopColor="#C9A227" />
        </linearGradient>
      </defs>
    </svg>
  );
}
