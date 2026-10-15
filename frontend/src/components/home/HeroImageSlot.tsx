/**
 * Imagem definitiva da homepage (mock visual FluxPay: cartões + dashboard).
 * Posição: entre o texto do ambiente de teste e a seção "Cobranças PIX em segundos".
 *
 * Assets: /public/images/home-hero.webp (+ .jpg fallback).
 * Override opcional: NEXT_PUBLIC_HOME_HERO_IMAGE (URL pública absoluta).
 */

const ENV_SRC = (process.env.NEXT_PUBLIC_HOME_HERO_IMAGE || "").trim();

export function HeroImageSlot({
  alt = "FluxPay — cartões, faturamento e saldo em tempo real",
}: {
  alt?: string;
}) {
  if (ENV_SRC) {
    return (
      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
        <div className="relative w-full overflow-hidden rounded-2xl border border-flux-border bg-flux-dark/60 aspect-[16/9] sm:aspect-[21/9]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ENV_SRC}
            alt={alt}
            className="w-full h-full object-cover object-center"
            loading="eager"
            decoding="async"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
      <div className="relative w-full overflow-hidden rounded-2xl border border-flux-border bg-flux-dark/60 aspect-[16/9] sm:aspect-[21/9]">
        <picture>
          <source srcSet="/images/home-hero.webp" type="image/webp" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/home-hero.jpg"
            alt={alt}
            className="w-full h-full object-cover object-center"
            loading="eager"
            decoding="async"
            width={1400}
            height={649}
          />
        </picture>
      </div>
    </div>
  );
}
