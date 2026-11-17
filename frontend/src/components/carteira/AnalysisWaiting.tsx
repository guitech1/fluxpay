"use client";

/**
 * Tela de espera da análise KYC — visual em camadas (pie 3D), profissional.
 */
export function AnalysisWaiting() {
  return (
    <div className="fxb-analysis">
      <div className="fxb-analysis-visual" aria-hidden>
        <div className="fxb-pie fxb-pie--top">
          <svg viewBox="0 0 120 120" className="fxb-pie-svg">
            <defs>
              <linearGradient id="fxbPieTop" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
            </defs>
            <path
              d="M60 60 L60 12 A48 48 0 0 1 105.4 84.5 Z"
              fill="url(#fxbPieTop)"
            />
            <text x="82" y="48" className="fxb-pie-label">
              30%
            </text>
          </svg>
        </div>

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
            />
            <text x="48" y="78" className="fxb-pie-label fxb-pie-label--lg">
              70%
            </text>
          </svg>
        </div>

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
    </div>
  );
}
