import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase.js";

export type PlatformAdminRole = "superadmin" | "admin" | "support";

declare global {
  namespace Express {
    interface Request {
      platformAdmin?: {
        userId: string;
        email: string | null;
        role: PlatformAdminRole;
        environment: "test" | "live";
      };
    }
  }
}

/**
 * Autentica o painel ADM.
 *
 * Duas diferencas em relacao ao sessionAuth do painel normal:
 * 1. Nao existe organizacao: o administrador da plataforma opera sobre todas.
 * 2. A autorizacao nao vem de organization_members e sim de platform_admins,
 *    tabela que so o service_role escreve (migration 011) — ninguem se promove
 *    a administrador pelo navegador.
 *
 * Trocar a URL no navegador nao serve de nada: quem decide e esta verificacao
 * no servidor, nao o frontend.
 */
export async function platformAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const environment = (req.headers["x-environment"] as string) || "test";

    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: { type: "authentication_error", message: "Sessao ausente." } });
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
        error: { type: "authentication_error", message: "Sessao invalida ou expirada." },
      });
      return;
    }

    const { data: admin } = await supabaseAdmin
      .from("platform_admins")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!admin) {
      // 404 em vez de 403: para quem nao e da equipe, o ADM simplesmente nao existe.
      res.status(404).json({ error: { type: "not_found", message: "Recurso nao encontrado." } });
      return;
    }

    req.platformAdmin = {
      userId: userData.user.id,
      email: userData.user.email ?? null,
      role: admin.role as PlatformAdminRole,
      environment: environment as "test" | "live",
    };

    next();
  } catch (err) {
    console.error("Platform admin auth error:", err);
    res.status(500).json({ error: { type: "api_error", message: "Erro interno de autenticacao." } });
  }
}

/** Restringe a rota a papeis especificos do ADM (support e somente leitura). */
export function requireAdminRole(...roles: PlatformAdminRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.platformAdmin || !roles.includes(req.platformAdmin.role)) {
      res.status(403).json({
        error: {
          type: "permission_error",
          message: `Esta acao requer um dos papeis: ${roles.join(", ")}.`,
        },
      });
      return;
    }
    next();
  };
}

/**
 * Grava uma acao administrativa na trilha de auditoria.
 * Falha aqui nunca derruba a acao em si, mas e sempre logada: uma acao sem
 * trilha e um problema operacional que precisa aparecer.
 */
export async function logAdminAction(
  req: Request,
  entry: {
    action: string;
    targetType: string;
    targetId?: string | null;
    targetLabel?: string | null;
    reason?: string | null;
    stateBefore?: unknown;
    stateAfter?: unknown;
  }
): Promise<void> {
  try {
    const admin = req.platformAdmin;
    const forwarded = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();

    await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: admin?.userId ?? null,
      admin_email: admin?.email ?? null,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId ?? null,
      target_label: entry.targetLabel ?? null,
      reason: entry.reason ?? null,
      state_before: (entry.stateBefore as Record<string, unknown>) ?? null,
      state_after: (entry.stateAfter as Record<string, unknown>) ?? null,
      ip_address: forwarded || req.ip || null,
      user_agent: (req.headers["user-agent"] as string | undefined) ?? null,
    });
  } catch (err) {
    console.error("Falha ao gravar admin_audit_log:", err);
  }
}
