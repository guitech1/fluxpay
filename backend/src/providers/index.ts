import type { PaymentProvider, Environment } from "../types/index.js";
import { AppError } from "../middleware/error.js";
import { sandboxProvider } from "./sandbox.js";
import { nexuspagProvider } from "./nexuspag.js";

/**
 * Registro de providers.
 *
 * sandbox : NUNCA move dinheiro real. Exclusivo do ambiente "test".
 * nexuspag: adquirente real de PIX. Exclusivo do ambiente "live".
 *
 * A separacao e rigida de proposito. Antes, "live" sem NEXUSPAG_API_KEY caia
 * silenciosamente no sandbox: o lojista via "Produção" na tela, gerava um QR
 * Code falso e ficava esperando um pagamento que nunca ia existir — uma
 * simulacao apresentada como cobranca real. Agora, producao sem adquirente
 * configurado falha na hora, com mensagem clara, e nada e gravado.
 */
const providers: Record<string, PaymentProvider> = {
  sandbox: sandboxProvider,
  nexuspag: nexuspagProvider,
};

/** true quando o adquirente real esta configurado e producao pode operar. */
export function isLiveEnabled(): boolean {
  return Boolean(process.env.NEXUSPAG_API_KEY);
}

export function getProvider(environment: Environment, preferred?: string): PaymentProvider {
  if (environment === "test") {
    return sandboxProvider;
  }

  if (!isLiveEnabled()) {
    throw new AppError(
      503,
      "provider_unavailable",
      "Pagamentos em producao ainda nao estao disponiveis nesta conta. " +
        "Use o ambiente de teste ou fale com o suporte da FluxPay."
    );
  }

  const name = preferred || "nexuspag";
  const provider = providers[name];

  if (!provider || provider.name === "sandbox") {
    // Sandbox em "live" nunca e uma escolha valida: seria dinheiro de mentira
    // gravado como producao.
    throw new AppError(
      503,
      "provider_unavailable",
      "Nenhum adquirente valido configurado para o ambiente de producao."
    );
  }

  return provider;
}

export function listProviders(): string[] {
  return Object.keys(providers);
}
