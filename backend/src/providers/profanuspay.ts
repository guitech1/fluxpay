/**
 * ProfanusPay — adquirente PIX (contrato documentado em https://profanuspay.com/docs).
 * Base URL documentada: https://nexuspag.com (mesma família de API).
 * Credenciais exclusivas via PROFANUSPAY_API_KEY / PROFANUSPAY_BASE_URL / PROFANUSPAY_WEBHOOK_SECRET.
 * Nome só aparece na área admin de adquirentes; UI pública permanece FluxPay.
 */
import { createNexusLikeProvider } from "./nexus-like-base.js";

export const profanuspayProvider = createNexusLikeProvider({
  id: "profanuspay" as any,
  displayName: "ProfanusPay",
  baseUrlEnv: "PROFANUSPAY_BASE_URL",
  defaultBaseUrl: "https://nexuspag.com",
  apiKeyEnv: "PROFANUSPAY_API_KEY",
  defaultCostPercent: 5,
  minAmountCents: 100,
});
