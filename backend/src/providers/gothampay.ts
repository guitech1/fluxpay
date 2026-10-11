import { createNexusLikeProvider } from "./nexus-like-base.js";
export const gothampayProvider = createNexusLikeProvider({
  id: "gothampay", displayName: "GothamPay", baseUrlEnv: "GOTHAMPAY_BASE_URL",
  defaultBaseUrl: "https://gothampay.com.br", apiKeyEnv: "GOTHAMPAY_API_KEY", defaultCostPercent: 5,
});
