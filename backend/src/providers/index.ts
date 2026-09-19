import type { PaymentProvider, Environment } from "../types/index.js";
import { sandboxProvider } from "./sandbox.js";
import { nexuspagProvider } from "./nexuspag.js";

/**
 * Provider registry.
 * sandbox: nunca move dinheiro real, usado sempre em ambiente "test".
 * nexuspag: adquirente real de PIX, usado em "live" quando NEXUSPAG_API_KEY
 * estiver configurada. Enquanto a chave nao for definida, "live" continua
 * caindo no sandbox para nao travar o desenvolvimento.
 */
const providers: Record<string, PaymentProvider> = {
  sandbox: sandboxProvider,
  nexuspag: nexuspagProvider,
};

export function getProvider(environment: Environment, preferred?: string): PaymentProvider {
  if (environment === "test") {
    return sandboxProvider;
  }

  // Live environment – pick configured provider
  const name = preferred || (process.env.NEXUSPAG_API_KEY ? "nexuspag" : "sandbox");
  const provider = providers[name];

  if (!provider) {
    throw new Error(`Payment provider "${name}" is not configured`);
  }

  return provider;
}

export function listProviders(): string[] {
  return Object.keys(providers);
}
