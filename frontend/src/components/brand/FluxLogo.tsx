/**
 * Identidade visual do FluxPay em SVG — mesma geometria dos icones do PWA
 * (public/icons/*), gerados a partir da mesma marca: hexagono vermelho de
 * cantos arredondados com o "F" recortado em blocos.
 *
 * Usar SVG (e nao <img>) evita mais um request, escala sem perder nitidez e
 * permite pintar a marca de branco em fundos vermelhos quando necessario.
 */

export function FluxMark({
  className = "w-8 h-8",
  color = "#FC0019",
  cut = "#0A0A0A",
}: {
  className?: string;
  /** Cor do hexagono. */
  color?: string;
  /** Cor dos blocos do "F" (normalmente a cor do fundo). */
  cut?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 128"
      className={className}
      role="img"
      aria-label="FluxPay"
      focusable="false"
    >
      <path
        d="M60 10.1 L107 37.1 L107 90.9 L60 117.9 L13 90.9 L13 37.1 Z"
        fill={color}
        stroke={color}
        strokeWidth="14"
        strokeLinejoin="round"
        strokeLinecap="round"
        paintOrder="stroke"
      />
      <g fill={cut}>
        <rect x="56" y="38" width="25" height="14.3" />
        <rect x="40" y="52.3" width="15" height="14.3" />
        <rect x="56" y="66.6" width="25" height="14.3" />
        <rect x="40" y="80.9" width="15" height="14.3" />
      </g>
    </svg>
  );
}

/** Marca + nome, do jeito que aparece na tela de login e no topo do painel. */
export function FluxLogo({
  className = "",
  markClassName = "w-9 h-9",
  textClassName = "text-xl",
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <FluxMark className={markClassName} />
      <span className={`font-semibold tracking-tight ${textClassName}`}>FluxPay</span>
    </span>
  );
}
