/**
 * Personagem exclusivo do suporte FluxPay — SVG proprio.
 * Profissional, amigavel, camisa com a marca FluxPay, gesto de aceno.
 */

export function SupportAgent({
  className = "w-14 h-14",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      role="img"
      aria-label="Assistente FluxPay"
      focusable="false"
    >
      {/* sombra suave */}
      <ellipse cx="48" cy="90" rx="22" ry="4" fill="#000" opacity="0.25" />

      {/* torso / camisa */}
      <path
        d="M28 58 C28 48 36 44 48 44 C60 44 68 48 68 58 L72 88 L24 88 Z"
        fill="#1A1A1A"
      />
      {/* gola */}
      <path d="M40 48 L48 56 L56 48 L48 50 Z" fill="#2A2A2A" />
      {/* faixa vermelha da marca na camisa */}
      <rect x="34" y="62" width="28" height="6" rx="2" fill="#FC0019" />
      {/* mini mark F simplificado */}
      <rect x="44" y="63.5" width="3" height="3" fill="#0A0A0A" />
      <rect x="47" y="63.5" width="5" height="1.2" fill="#0A0A0A" />
      <rect x="47" y="65.3" width="4" height="1.2" fill="#0A0A0A" />

      {/* braco acenando (direito do personagem) */}
      <path
        d="M68 56 C78 48 82 40 80 34"
        fill="none"
        stroke="#E8B89A"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* mao */}
      <circle cx="80" cy="32" r="5" fill="#E8B89A" />

      {/* braco esquerdo */}
      <path
        d="M28 56 C22 62 20 72 22 80"
        fill="none"
        stroke="#E8B89A"
        strokeWidth="6"
        strokeLinecap="round"
      />

      {/* pescoco */}
      <rect x="44" y="40" width="8" height="8" rx="2" fill="#E8B89A" />

      {/* cabeca */}
      <circle cx="48" cy="28" r="16" fill="#F0C8A8" />
      {/* cabelo */}
      <path
        d="M32 26 C34 12 62 12 64 26 C58 18 38 18 32 26 Z"
        fill="#2C1810"
      />
      {/* olhos */}
      <circle cx="42" cy="28" r="2.2" fill="#1A1A1A" />
      <circle cx="54" cy="28" r="2.2" fill="#1A1A1A" />
      {/* sorriso */}
      <path
        d="M42 34 Q48 39 54 34"
        fill="none"
        stroke="#1A1A1A"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
