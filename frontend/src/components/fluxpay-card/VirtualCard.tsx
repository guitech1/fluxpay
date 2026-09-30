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
      setTilt({ x: (py - 0.5) * -16, y: (px - 0.5) * 18 });
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
      {/* Soft ambient glow behind the card */}
      <div
        className="pointer-events-none absolute -inset-6 rounded-[2rem] opacity-60 blur-2xl"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(252,0,25,0.35), transparent 70%)",
        }}
        aria-hidden
      />

      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        aria-label="Cartão FluxPay. Clique para virar."
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="relative w-full aspect-[1.586/1] cursor-pointer transition-transform duration-500 ease-out [perspective:1200px]"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped
            ? "rotateY(180deg)"
            : `rotateY(0deg) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          animation: flipped ? undefined : "fp-float 5s ease-in-out infinite",
        }}
      >
        {/* ── FRONT ── */}
        <div
          className={cn(
            "absolute inset-0 rounded-2xl overflow-hidden",
            "border border-white/15",
            "shadow-[0_25px_60px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.08)_inset,0_1px_0_rgba(255,255,255,0.12)_inset]"
          )}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            background:
              "linear-gradient(145deg, #1c1c22 0%, #0c0c0f 35%, #14141a 65%, #08080a 100%)",
          }}
        >
          {/* Red brand wash */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 90% 70% at 100% -10%, rgba(252,0,25,0.45), transparent 55%), radial-gradient(ellipse 50% 45% at 0% 110%, rgba(252,0,25,0.18), transparent 50%)",
            }}
          />

          {/* Holographic cursor shine */}
          <div
            className="absolute inset-0 pointer-events-none mix-blend-overlay"
            style={{
              background: `radial-gradient(circle 180px at ${shine.x}% ${shine.y}%, rgba(255,255,255,0.35), transparent 55%)`,
            }}
          />

          {/* Subtle diagonal light streak */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              background:
                "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.12) 48%, transparent 62%)",
            }}
          />

          {/* Fine noise / texture */}
          <div
            className="absolute inset-0 opacity-[0.045] pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, #fff 0px, #fff 1px, transparent 1px, transparent 7px)",
            }}
          />

          {/* Top edge highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          <div className="relative h-full flex flex-col justify-between p-5 sm:p-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <FluxPayMark />
                <div className="flex flex-col">
                  <span className="text-[11px] sm:text-xs font-semibold tracking-[0.22em] text-white uppercase">
                    FluxPay
                  </span>
                  <span className="text-[9px] tracking-[0.18em] text-white/45 uppercase">
                    Card
                  </span>
                </div>
              </div>
              {isBlocked ? (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-red-500/25 text-red-200 border border-red-400/40">
                  Bloqueado
                </span>
              ) : (
                <span className="text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/10 text-white/80 border border-white/15">
                  Virtual
                </span>
              )}
            </div>

            {/* Chip + contactless */}
            <div className="mt-3 sm:mt-4 flex items-center gap-3">
              <ChipGraphic />
              <ContactlessIcon />
            </div>

            {/* Number + holder */}
            <div className="mt-auto space-y-3 sm:space-y-4">
              <div
                className={cn(
                  "font-mono text-base sm:text-xl tracking-[0.2em] text-white",
                  isBlocked && "opacity-45"
                )}
              >
                {displayNumber}
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-white/40 mb-0.5">
                    Titular
                  </div>
                  <div className="text-sm sm:text-base font-medium text-white truncate uppercase tracking-wide">
                    {fullName || "—"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-white/40 mb-0.5">
                    Rede
                  </div>
                  <div className="text-xs font-semibold text-white/85 tracking-[0.12em]">
                    FLUX
                  </div>
                </div>
              </div>
            </div>
          </div>

          {isBlocked && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
              <div className="px-4 py-2 rounded-full border border-red-400/50 bg-red-500/20 text-sm font-semibold text-white tracking-wide uppercase">
                Cartão bloqueado
              </div>
            </div>
          )}
        </div>

        {/* ── BACK ── */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.65)]"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background:
              "linear-gradient(145deg, #141418 0%, #0a0a0c 50%, #121216 100%)",
          }}
        >
          {/* Magnetic stripe */}
          <div className="h-11 sm:h-12 bg-black mt-5 sm:mt-6 relative overflow-hidden">
            <div className="absolute inset-0 opacity-30 bg-[repeating-linear-gradient(90deg,#333_0px,#111_2px,#333_4px)]" />
          </div>

          <div className="px-5 sm:px-6 pt-4 space-y-3">
            {/* Signature panel */}
            <div className="h-9 rounded-md bg-gradient-to-r from-white via-white to-white/90 flex items-center justify-between px-3 shadow-inner">
              <span className="font-serif italic text-xs text-black/50 tracking-wide">
                {fullName ? fullName.split(" ")[0] : "Assinatura"}
              </span>
              <span className="font-mono text-[10px] text-black/60 tracking-widest">
                CVV •••
              </span>
            </div>

            <p className="text-[10px] text-white/45 leading-relaxed max-w-[95%]">
              Carteira interna FluxPay. Destinada a transferências entre usuários
              da plataforma. O número identifica a carteira destinatária.
            </p>

            <div className="pt-1 flex items-end justify-between">
              <div>
                <div className="text-[9px] uppercase tracking-[0.15em] text-white/35 mb-1">
                  Status
                </div>
                <div className="text-sm text-white/85 font-medium">
                  {status === "approved"
                    ? "Ativo"
                    : status === "blocked"
                      ? "Bloqueado"
                      : status}
                </div>
              </div>
              <FluxPayMark small />
            </div>
          </div>

          {/* Red accent line bottom */}
          <div className="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#FC0019] to-transparent opacity-80" />
        </div>
      </div>

      <style jsx>{`
        @keyframes fp-float {
          0%,
          100% {
            translate: 0 0;
          }
          50% {
            translate: 0 -6px;
          }
        }
      `}</style>
    </div>
  );
}

function FluxPayMark({ small }: { small?: boolean }) {
  const size = small ? 22 : 30;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="shrink-0 drop-shadow-[0_0_8px_rgba(252,0,25,0.45)]"
    >
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
    <svg width="44" height="34" viewBox="0 0 44 34" fill="none" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="43"
        height="33"
        rx="6"
        fill="url(#chipGrad)"
        stroke="rgba(255,255,255,0.35)"
      />
      <rect x="9" y="7" width="26" height="20" rx="2.5" fill="rgba(0,0,0,0.18)" />
      <line x1="9" y1="13" x2="35" y2="13" stroke="rgba(0,0,0,0.28)" strokeWidth="1" />
      <line x1="9" y1="17" x2="35" y2="17" stroke="rgba(0,0,0,0.28)" strokeWidth="1" />
      <line x1="9" y1="21" x2="35" y2="21" stroke="rgba(0,0,0,0.28)" strokeWidth="1" />
      <line x1="17" y1="7" x2="17" y2="27" stroke="rgba(0,0,0,0.28)" strokeWidth="1" />
      <line x1="27" y1="7" x2="27" y2="27" stroke="rgba(0,0,0,0.28)" strokeWidth="1" />
      <defs>
        <linearGradient id="chipGrad" x1="0" y1="0" x2="44" y2="34">
          <stop stopColor="#E8E8EC" />
          <stop offset="0.45" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#C8C8D0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ContactlessIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="text-white/50"
    >
      <path
        d="M8.5 8.5c2.5 2.5 2.5 6.5 0 9M12 6c4 4 4 10 0 14M15.5 3.5c5.5 5.5 5.5 14.5 0 20"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
