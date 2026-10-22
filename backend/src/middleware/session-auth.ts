import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase.js";
import type { AuthenticatedRequest } from "../types/index.js";

declare global {
  namespace Express {
    interface Request {
      dashboardAuth?: AuthenticatedRequest & {
        userId: string;
        role: "owner" | "admin" | "developer" | "viewer";
      };
    }
  }
}

/**
 * Autentica requisicoes do PAINEL (dashboard) via sessao do Supabase Auth.
 *
 * Em producao (NODE_ENV=production) o ambiente e SEMPRE live: o header
 * X-Environment e o cookie de teste sao ignorados. Isso impede que o lojista
 * opere sandbox/simulacao e veja saldo ficticio como se fosse dinheiro real.
 */
export async function sessionAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const orgId = req.headers["x-organization-id"] as string | undefined;
    const requestedEnv = (req.headers["x-environment"] as string) || "live";

    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({
        error: { type: "authentication_error", message: "Faca login para continuar." },
      });
      return;
    }

    if (!orgId) {
      res.status(400).json({
        error: {
          type: "validation_error",
          message: "Header X-Organization-Id e obrigatorio.",
        },
      });
      return;
    }

    const forceLive =
      process.env.NODE_ENV === "production" &&
      process.env.FLUXPAY_ALLOW_TEST_ENV !== "true";

    let environment: "test" | "live";
    if (forceLive) {
      environment = "live";
    } else if (requestedEnv === "test" || requestedEnv === "live") {
      environment = requestedEnv;
    } else {
      res.status(400).json({
        error: { type: "validation_error", message: "X-Environment deve ser 'test' ou 'live'." },
      });
      return;
    }

    const token = authHeader.slice(7).trim();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData?.user) {
      res.status(401).json({
        error: { type: "authentication_error", message: "Sua sessao expirou. Entre novamente." },
      });
      return;
    }

    const { data: userStatus } = await supabaseAdmin
      .from("users")
      .select("status, status_reason")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!userStatus || userStatus.status !== "active") {
      res.status(403).json({
        error: {
          type: "permission_error",
          message: "Este usuário está com as operações bloqueadas. Fale com o suporte da FluxPay.",
        },
      });
      return;
    }

    const { data: membership, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (memberError || !membership) {
      res.status(403).json({
        error: { type: "permission_error", message: "Voce nao pertence a essa organizacao." },
      });
      return;
    }

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("status")
      .eq("id", orgId)
      .maybeSingle();

    if (!org || org.status !== "active") {
      res.status(403).json({
        error: {
          type: "permission_error",
          message:
            "Esta conta esta com as operacoes bloqueadas. Fale com o suporte da FluxPay.",
        },
      });
      return;
    }

    req.dashboardAuth = {
      organizationId: orgId,
      environment,
      apiKeyId: "dashboard",
      apiKeyType: "secret",
      userId: userData.user.id,
      role: membership.role as "owner" | "admin" | "developer" | "viewer",
    };

    next();
  } catch (err) {
    console.error("Session auth error:", err);
    res.status(500).json({
      error: { type: "api_error", message: "Nao foi possivel validar sua sessao. Tente novamente." },
    });
  }
}

/** Restringe a rota a papeis especificos dentro da organizacao. */
export function requireRole(...roles: Array<"owner" | "admin" | "developer" | "viewer">) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.dashboardAuth || !roles.includes(req.dashboardAuth.role)) {
      res.status(403).json({
        error: {
          type: "permission_error",
          message: "Voce nao tem permissao para executar esta acao.",
        },
      });
      return;
    }
    next();
  };
}
