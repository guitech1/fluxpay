import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase.js";

export interface MaintenanceSettings {
  enabled: boolean;
  message: string;
  allow_admins: boolean;
  scope: "all" | "api" | "dashboard";
}

const DEFAULT: MaintenanceSettings = {
  enabled: false,
  message: "A FluxPay está em manutenção. Voltamos em instantes.",
  allow_admins: true,
  scope: "all",
};

// Cache curto: em ambiente serverless cada invocacao e um processo novo, mas
// dentro da mesma invocacao (varias requisicoes reaproveitadas) evita ir ao
// banco a cada chamada. 15s e curto o bastante para tirar a manutencao rapido.
let cached: { value: MaintenanceSettings; at: number } | null = null;
const TTL_MS = 15_000;

export async function getMaintenanceSettings(force = false): Promise<MaintenanceSettings> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "maintenance")
    .maybeSingle();

  const value = { ...DEFAULT, ...((data?.value as Partial<MaintenanceSettings>) || {}) };
  cached = { value, at: Date.now() };
  return value;
}

/** Limpa o cache assim que o ADM muda a configuracao. */
export function invalidateMaintenanceCache(): void {
  cached = null;
}

/**
 * Descobre se quem fez a requisicao e administrador da plataforma.
 *
 * So e chamada quando a manutencao esta LIGADA e `allow_admins` esta marcado —
 * fora disso nao ha motivo para pagar duas idas ao banco por request.
 *
 * Chave de API (sk_/pk_) nunca e admin: a excecao vale para gente da equipe
 * logada no painel, nao para integracoes. Por isso o token e descartado antes
 * mesmo de consultar o Supabase Auth quando tem cara de API key.
 */
async function isPlatformAdminRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7).trim();
  if (!token || token.startsWith("sk_") || token.startsWith("pk_")) return false;

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return false;

    const { data: admin } = await supabaseAdmin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();

    return Boolean(admin);
  } catch (err) {
    // Na duvida, NAO libera: a manutencao e a regra, a excecao precisa ser provada.
    console.error("Falha ao verificar administrador durante manutencao:", err);
    return false;
  }
}

/**
 * Bloqueia a plataforma quando o modo manutencao esta ligado.
 *
 * Sempre passam, independentemente da configuracao:
 *   - /admin-api/*  — senao nao haveria como DESLIGAR a manutencao. A rota ja
 *     e protegida por platformAdminAuth, entao "passar" aqui nao abre nada:
 *     quem nao esta em platform_admins continua recebendo 404.
 *   - /health       — o monitoramento precisa continuar respondendo.
 *   - /v1/webhooks/nexuspag — recusar faria o adquirente gastar tentativas de
 *     retry e, no limite, perder a confirmacao de um PIX ja pago.
 *
 * Para o resto (/v1/* do lojista e /dashboard-api/*), o escopo decide quem e
 * afetado e `allow_admins` decide se a equipe da FluxPay continua operando
 * durante a janela. Com `allow_admins` desmarcado, nem a equipe passa — que e
 * exatamente o que a opcao promete no ADM.
 */
export function maintenanceGuard(req: Request, res: Response, next: NextFunction): void {
  const path = req.path || "";

  if (
    path.startsWith("/admin-api") ||
    path === "/health" ||
    path.startsWith("/v1/webhooks/nexuspag")
  ) {
    next();
    return;
  }

  void (async () => {
    try {
      const settings = await getMaintenanceSettings();

      if (!settings.enabled) {
        next();
        return;
      }

      const isApi = path.startsWith("/v1");
      const isDashboard = path.startsWith("/dashboard-api");
      const affected =
        settings.scope === "all" ||
        (settings.scope === "api" && isApi) ||
        (settings.scope === "dashboard" && isDashboard);

      if (!affected) {
        next();
        return;
      }

      if (settings.allow_admins && (await isPlatformAdminRequest(req))) {
        res.setHeader("X-FluxPay-Maintenance", "bypass-admin");
        next();
        return;
      }

      res.setHeader("Retry-After", "300");
      res.status(503).json({
        error: {
          type: "service_unavailable",
          message: settings.message,
          maintenance: true,
        },
      });
    } catch (err) {
      // Falha ao consultar a configuracao nao pode derrubar a plataforma:
      // na duvida, segue funcionando.
      console.error("Falha ao ler configuracao de manutencao:", err);
      next();
    }
  })();
}
