import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase.js";

/**
 * Simple idempotency for payment creation.
 * Looks for existing payment with same organization + idempotency_key.
 * If found, returns the existing resource instead of creating a new one.
 */
export async function idempotencyCheck(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const key = (req.headers["idempotency-key"] as string) || req.body?.idempotency_key;

  if (!key || !req.auth) {
    next();
    return;
  }

  // Store on request for later use by controller
  (req as any).idempotencyKey = key;

  try {
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("organization_id", req.auth.organizationId)
      .eq("idempotency_key", key)
      .maybeSingle();

    if (existing) {
      res.status(200).json({ data: existing, idempotent: true });
      return;
    }

    next();
  } catch {
    next();
  }
}
