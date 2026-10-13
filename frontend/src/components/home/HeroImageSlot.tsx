/**
 * Espaço reservado para a imagem definitiva da homepage.
 * Posição: entre o texto do ambiente de teste e a seção "Cobranças PIX em segundos".
 *
 * Quando a arte estiver pronta, defina NEXT_PUBLIC_HOME_HERO_IMAGE (URL pública)
 * ou coloque o ficheiro em /public/images/home-hero.webp e atualize DEFAULT_SRC.
 * Não inventar imagem: sem SRC válido o slot permanece neutro e responsivo.
 */

const DEFAULT_SRC = process.env.NEXT_PUBLIC_HOME_HERO_IMAGE || "";

export function HeroImageSlot({
  src = DEFAULT_SRC,
  alt = "FluxPay — gateway de pagamentos PIX",
}: {
  src?: string;
  alt?: string;
}) {
  const hasImage = Boolean(src && src.trim());

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-flux-border bg-flux-dark/60 aspect-[16/9] sm:aspect-[21/9] flex items-center justify-center"
        aria-hidden={!hasImage}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-cover object-center"
            loading="eager"
            decoding="async"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 text-flux-muted/50 px-6 text-center">
            <div className="w-16 h-16 rounded-xl border border-dashed border-flux-border/60 bg-flux-gray/20" />
            <span className="text-xs tracking-wide">Imagem em produção</span>
          </div>
        )}
      </div>
    </div>
  );
}
