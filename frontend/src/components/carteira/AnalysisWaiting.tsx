"use client";

/**
 * Tela de espera da análise KYC — visual em camadas inspirado em pie 3D
 * (profissional, fundo escuro, azul).
 */
export function AnalysisWaiting() {
  return (
    <div className="fxb-analysis">
      <div className="fxb-analysis-visual" aria-hidden>
        {/* Camada superior — fatia 30% */}
        <div className="fxb-pie fxb-pie--top">
          <svg viewBox="0 0 120 120" className="fxb-pie-svg">
            <defs>
              <linearGradient id="fxbPieTop" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
            </defs>
            {/* fatia ~108° (30%) */}
            <path
              d="M60 60 L60 12 A48 48 0 0 1 105.4 84.5 Z"
              fill="url(#fxbPieTop)"
              className="fxb-pie-slice fxb-pie-slice--a"
            />
            <text x="82" y="48" className="fxb-pie-label">
              30%
            </text>
          </svg>
        </div>

        {/* Camada média — 70% */}
        <div className="fxb-pie fxb-pie--mid">
          <svg viewBox="0 0 120 120" className="fxb-pie-svg">
            <defs>
              <linearGradient id="fxbPieMid" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
            </defs>
            <path
              d="M60 60 L105.4 84.5 A48 48 0 1 1 60 12 Z"
              fill="url(#fxbPieMid)"
              className="fxb-pie-slice fxb-pie-slice--b"
            />
            <text x="48" y="78" className="fxb-pie-label fxb-pie-label--lg">
              70%
            </text>
          </svg>
        </div>

        {/* Base — círculo completo com divisórias */}
        <div className="fxb-pie fxb-pie--base">
          <svg viewBox="0 0 120 120" className="fxb-pie-svg">
            <defs>
              <linearGradient id="fxbPieBase" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1e3a8a" />
                <stop offset="55%" stopColor="#1d4ed8" />
                <stop offset="100%" stopColor="#172554" />
              </linearGradient>
            </defs>
            <ellipse cx="60" cy="62" rx="50" ry="48" fill="url(#fxbPieBase)" opacity="0.95" />
            <path
              d="M60 62 L60 14 M60 62 L104 86 M60 62 L16 86"
              stroke="rgba(147,197,253,0.35)"
              strokeWidth="1.2"
              fill="none"
            />
          </svg>
        </div>

        {/* Linhas guia pontilhadas */}
        <div className="fxb-pie-guides">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="fxb-analysis-copy">
        <p className="fxb-analysis-badge">Em análise</p>
        <h2 className="fxb-analysis-title">Aguarde, estamos analisando suas informações</h2>
        <p className="fxb-analysis-sub">
          Seus dados foram enviados com segurança. Nossa equipe está revisando o cadastro. Pix,
          transferências e cartão ficam bloqueados até a liberação.
        </p>
        <div className="fxb-analysis-steps" aria-hidden>
          <div className="fxb-analysis-step is-done">
            <span className="fxb-analysis-dot" />
            Dados enviados
          </div>
          <div className="fxb-analysis-step is-active">
            <span className="fxb-analysis-dot" />
            Análise em andamento
          </div>
          <div className="fxb-analysis-step">
            <span className="fxb-analysis-dot" />
            Carteira liberada
          </div>
        </div>
      </div>

      <style jsx>{`
        .fxb-analysis {
          max-width: 420px;
          margin: 1.25rem auto 2rem;
          padding: 1.75rem 1.25rem 2rem;
          border-radius: 1.25rem;
          background: radial-gradient(ellipse at 50% 20%, rgba(37, 99, 235, 0.18), transparent 55%),
            linear-gradient(180deg, #0b1220 0%, #070b14 100%);
          border: 1px solid rgba(59, 130, 246, 0.2);
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
        }
        .fxb-analysis-visual {
          position: relative;
          height: 240px;
          margin: 0 auto 1.5rem;
          max-width: 280px;
        }
        .fxb-pie {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: 160px;
          height: 160px;
          filter: drop-shadow(0 12px 20px rgba(37, 99, 235, 0.35));
        }
        .fxb-pie--top {
          top: 0;
          width: 120px;
          height: 120px;
          z-index: 3;
          animation: fxbFloat 4s ease-in-out infinite;
        }
        .fxb-pie--mid {
          top: 56px;
          z-index: 2;
          animation: fxbFloat 4s ease-in-out infinite 0.2s;
        }
        .fxb-pie--base {
          top: 118px;
          width: 180px;
          height: 120px;
          z-index: 1;
          opacity: 0.9;
        }
        .fxb-pie-svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .fxb-pie-label {
          fill: rgba(219, 234, 254, 0.95);
          font-size: 11px;
          font-weight: 700;
          font-family: system-ui, sans-serif;
        }
        .fxb-pie-label--lg {
          font-size: 14px;
        }
        .fxb-pie-guides {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }
        .fxb-pie-guides span {
          position: absolute;
          left: 50%;
          width: 1px;
          height: 70%;
          top: 12%;
          border-left: 1px dashed rgba(147, 197, 253, 0.25);
          transform-origin: top center;
        }
        .fxb-pie-guides span:nth-child(1) {
          transform: translateX(-50%) rotate(-18deg);
        }
        .fxb-pie-guides span:nth-child(2) {
          transform: translateX(-50%);
        }
        .fxb-pie-guides span:nth-child(3) {
          transform: translateX(-50%) rotate(18deg);
        }
        .fxb-analysis-copy {
          text-align: center;
        }
        .fxb-analysis-badge {
          display: inline-block;
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #93c5fd;
          background: rgba(37, 99, 235, 0.2);
          border: 1px solid rgba(96, 165, 250, 0.35);
          border-radius: 999px;
          padding: 0.3rem 0.75rem;
          margin-bottom: 0.85rem;
        }
        .fxb-analysis-title {
          font-size: 1.2rem;
          font-weight: 700;
          line-height: 1.35;
          color: #f8fafc;
          margin: 0 0 0.65rem;
          letter-spacing: -0.02em;
        }
        .fxb-analysis-sub {
          font-size: 0.9rem;
          line-height: 1.5;
          color: rgba(148, 163, 184, 0.95);
          margin: 0 0 1.35rem;
        }
        .fxb-analysis-steps {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
          text-align: left;
          max-width: 260px;
          margin: 0 auto;
        }
        .fxb-analysis-step {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.82rem;
          color: rgba(148, 163, 184, 0.75);
        }
        .fxb-analysis-step.is-done {
          color: #86efac;
        }
        .fxb-analysis-step.is-active {
          color: #bfdbfe;
          font-weight: 600;
        }
        .fxb-analysis-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(100, 116, 139, 0.5);
          flex-shrink: 0;
        }
        .fxb-analysis-step.is-done .fxb-analysis-dot {
          background: #4ade80;
          box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.2);
        }
        .fxb-analysis-step.is-active .fxb-analysis-dot {
          background: #60a5fa;
          box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.25);
          animation: fxbPulse 1.6s ease-in-out infinite;
        }
        @keyframes fxbFloat {
          0%,
          100% {
            transform: translateX(-50%) translateY(0);
          }
          50% {
            transform: translateX(-50%) translateY(-6px);
          }
        }
        @keyframes fxbPulse {
          0%,
          100% {
            box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
          }
          50% {
            box-shadow: 0 0 0 6px rgba(96, 165, 250, 0.12);
          }
        }
      `}</style>
    </div>
  );
}
