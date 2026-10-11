import { createNexusLikeProvider } from "./nexus-like-base.js";
export const smokepayProvider = createNexusLikeProvider({
  id: "smokepay", displayName: "SmokePay", baseUrlEnv: "SMOKEPAY_BASE_URL",
  defaultBaseUrl: "https://smokepay.com.br", apiKeyEnv: "SMOKEPAY_API_KEY", defaultCostPercent: 5,
});
