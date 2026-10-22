import { AppError } from "../middleware/error.js";
import type { Environment } from "../types/index.js";

/**
 * Em producao, ambiente de teste e provider sandbox nao podem:
 * - criar cobrancas
 * - simular pagamento
 * - credit ar ledger / saldo sacavel
 *
 * Override de emergencia (somente ops): FLUXPAY_ALLOW_TEST_ENV=true
 */
export function isTestEnvBlocked(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.FLUXPAY_ALLOW_TEST_ENV !== "true"
  );
}

export function assertLiveEnvironmentForMoney(
  environment: Environment,
  context: string
): void {
  if (!isTestEnvBlocked()) return;
  if (environment === "test") {
    throw new AppError(
      403,
      "permission_error",
      `Ambiente de teste desabilitado em producao (${context}). Use producao com adquirente real.`
    );
  }
}

export function assertNotSandboxProvider(
  provider: string | null | undefined,
  context: string
): void {
  if (!isTestEnvBlocked()) return;
  if ((provider || "").toLowerCase() === "sandbox") {
    throw new AppError(
      403,
      "permission_error",
      `Pagamentos simulados (sandbox) nao geram saldo em producao (${context}).`
    );
  }
}

export function assertCanCreditLedger(params: {
  environment: Environment;
  provider?: string | null;
  context: string;
}): void {
  assertLiveEnvironmentForMoney(params.environment, params.context);
  assertNotSandboxProvider(params.provider, params.context);
}
