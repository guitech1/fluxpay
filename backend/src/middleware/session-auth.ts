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
 * Diferente do apiKeyAuth (usado por integracoes externas com sk_/pk_), este
 * middleware verifica o access_token do usuario logado e exige o header
 * X-Organization-Id para saber em qual empresa ele quer operar — um mesmo
 * usuario pode pertencer a mais de uma organizacao.
 *
 * Usado apenas pelas rotas em routes/dashboard.ts, que expoem acoes que
 * precisam de logica de servidor (hash de chave, geracao de segredo,
 * chamada ao provider) e por isso nao podem ser feitas direto pelo
 * Supabase client do navegador.
 */
export async function sessionAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const orgId = req.headers["x-organization-id"] as string | undefined;
    const environment = (req.headers["x-environment"] as string) || "test";

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

    if (environment !== "test" && environment !== "live") {
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

    // Acoes privilegiadas do painel (criar chave, reembolsar, convidar) ficam
    // bloqueadas quando a conta nao esta ativa. A LEITURA do painel continua
    // funcionando: ela passa pela RLS do Supabase, nao por aqui — o lojista
    // suspenso ainda consegue ver o proprio historico e o motivo.
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
      environment: environment as "test" | "live",
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
