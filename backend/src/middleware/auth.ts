import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { hashApiKey } from "../utils/crypto.js";
import type { AuthenticatedRequest, Environment } from "../types/index.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedRequest;
    }
  }
}

/**
 * Authenticates requests via API Key in Authorization header.
 * Expected: Authorization: Bearer sk_test_... or sk_live_...
 * Also accepts X-Api-Key header.
 */
export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers["x-api-key"] as string | undefined;

    let rawKey: string | undefined;

    if (authHeader?.startsWith("Bearer ")) {
      rawKey = authHeader.slice(7).trim();
    } else if (apiKeyHeader) {
      rawKey = apiKeyHeader.trim();
    }

    if (!rawKey) {
      res.status(401).json({
        error: {
          type: "authentication_error",
          message: "Missing API key. Provide Authorization: Bearer <key> or X-Api-Key header.",
        },
      });
      return;
    }

    // Basic format validation
    if (!rawKey.startsWith("sk_") && !rawKey.startsWith("pk_")) {
      res.status(401).json({
        error: {
          type: "authentication_error",
          message: "Invalid API key format.",
        },
      });
      return;
    }

    const keyHash = hashApiKey(rawKey);
    const prefix = rawKey.slice(0, 8); // sk_test_ or similar short prefix for lookup

    const { data: apiKey, error } = await supabaseAdmin
      .from("api_keys")
      .select("id, organization_id, key_type, environment, key_hash, revoked_at")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (error || !apiKey) {
      res.status(401).json({
        error: {
          type: "authentication_error",
          message: "Invalid API key.",
        },
      });
      return;
    }

    // Conta suspensa/banida/desativada nao opera pela API. A checagem fica
    // aqui (e nao so no trigger do banco) para devolver um erro claro em vez
    // de estourar uma exception de constraint no meio do fluxo.
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("status, status_reason")
      .eq("id", apiKey.organization_id)
      .maybeSingle();

    if (!org || org.status !== "active") {
      res.status(403).json({
        error: {
          type: "permission_error",
          message: `Conta indisponivel (status: ${org?.status ?? "desconhecido"}). Fale com o suporte da FluxPay.`,
        },
      });
      return;
    }

    // Update last_used_at asynchronously
    supabaseAdmin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", apiKey.id)
      .then(() => {});

    req.auth = {
      organizationId: apiKey.organization_id,
      environment: apiKey.environment as Environment,
      apiKeyId: apiKey.id,
      apiKeyType: apiKey.key_type as "secret" | "publishable",
    };

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    res.status(500).json({
      error: {
        type: "api_error",
        message: "Internal authentication error.",
      },
    });
  }
}

/**
 * Restricts endpoint to secret keys only (not publishable).
 */
export function requireSecretKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth || req.auth.apiKeyType !== "secret") {
    res.status(403).json({
      error: {
        type: "permission_error",
        message: "This endpoint requires a secret API key.",
      },
    });
    return;
  }
  next();
}
