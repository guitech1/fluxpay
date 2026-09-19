import { headers } from "next/headers";

/**
 * Origem publica do FluxPay (protocolo + host), para montar URLs que alguem
 * vai copiar e colar FORA do painel — o caso concreto e a URL do webhook de
 * entrada, cadastrada no painel da NexusPag.
 *
 * Por que isto existe: em producao `NEXT_PUBLIC_API_URL` fica VAZIA de
 * proposito (painel e API na mesma origem, via redirects do netlify.toml).
 * As duas telas que mostram essa URL liam essa variavel direto e caiam em
 * fallbacks errados — uma em "https://api.fluxpay.com.br" (dominio que nao e
 * o do deploy) e outra em "" (caminho relativo, inutil para colar no
 * adquirente). Nos dois casos o webhook nunca chegaria e o PIX ficaria
 * pendente para sempre.
 *
 * Ordem de resolucao, da configuracao explicita para a deducao:
 *   1. NEXT_PUBLIC_API_URL  — ambiente local, onde a API roda em outra porta;
 *   2. NEXT_PUBLIC_SITE_URL — URL publica declarada do site;
 *   3. host da propria requisicao (x-forwarded-host/host + x-forwarded-proto).
 *
 * Só pode ser chamada de Server Component / Route Handler: usa headers().
 */
export async function getPublicBaseUrl(): Promise<string> {
  const explicit =
    process.env.NEXT_PUBLIC_API_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (explicit) return explicit.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");

  if (!host) return "";

  const proto =
    h.get("x-forwarded-proto") ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${proto}://${host}`;
}
