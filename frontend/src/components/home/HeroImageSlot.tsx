/**
 * Banner da homepage — arte oficial FluxPay (cards, faturamento, saldo).
 * Imagem em /public/images/home-banner-fluxpay.png (referência visual do produto).
 * Responsivo: object-cover em mobile, object-contain em ecrãs largos para não cortar texto.
 */

const DEFAULT_SRC =
  process.env.NEXT_PUBLIC_HOME_HERO_IMAGE || "/images/home-banner-fluxpay.png";

export function HeroImageSlot({
  src = DEFAULT_SRC,
  alt = "FluxPay — Transforme sua gestão de pagamentos. FluxPay Card, taxas baixas e link de pagamento.",
}: {
  src?: string;
  alt?: string;
}) {
  const hasImage = Boolean(src && src.trim());

  if (!hasImage) {
    return (
      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
        <div
          className="relative w-full overflow-hidden rounded-2xl border border-flux-border bg-flux-dark/60 aspect-[16/9] sm:aspect-[21/9] flex items-center justify-center"
          aria-hidden
        >
          <div className="flex flex-col items-center justify-center gap-2 text-flux-muted/50 px-6 text-center">
            <div className="w-16 h-16 rounded-xl border border-dashed border-flux-border/60 bg-flux-gray/20" />
            <span className="text-xs tracking-wide">Imagem em produção</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      className="w-full border-b border-flux-border bg-black"
      aria-label="Vantagens FluxPay"
    >
      <div className="max-w-7xl mx-auto px-0 sm:px-4 md:px-6">
        <div className="relative w-full overflow-hidden sm:rounded-2xl sm:my-6 md:my-8 border-0 sm:border border-flux-border/80 shadow-none sm:shadow-2xl sm:shadow-red-950/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="w-full h-auto object-cover object-center block"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width={1920}
            height={900}
          />
        </div>
      </div>
    </section>
  );
}
