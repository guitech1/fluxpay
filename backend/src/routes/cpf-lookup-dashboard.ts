import { Router } from "express";
import { z } from "zod";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import { lookupCpfByDocument, isCpfLookupConfigured } from "../services/cpf-lookup.js";
import { AppError } from "../middleware/error.js";

const router = Router();
router.use(sessionAuth);

/** Validação local de dígitos (não substitui API). */
function isValidCpfLocal(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]!, 10) * (10 - i);
  let rev = (sum * 10) % 11;
  if (rev === 10) rev = 0;
  if (rev !== parseInt(d[9]!, 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]!, 10) * (11 - i);
  rev = (sum * 10) % 11;
  if (rev === 10) rev = 0;
  return rev === parseInt(d[10]!, 10);
}

router.get("/status", requireRole("owner", "admin", "developer", "viewer"), (_req, res) => {
  res.json({ data: { configured: isCpfLookupConfigured() } });
});

router.post("/lookup", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const schema = z.object({ cpf: z.string().min(11).max(14) });
    const body = schema.parse(req.body);
    const digits = body.cpf.replace(/\D/g, "");
    if (!isValidCpfLocal(digits)) {
      throw new AppError(400, "validation_error", "CPF invalido (digitos verificadores).");
    }
    const result = await lookupCpfByDocument(digits);
    // Nunca devolver raw completo do provedor ao frontend
    res.json({
      data: {
        configured: result.configured,
        found: result.found,
        name: result.name,
        cpf: result.cpf,
        birth_date: result.birthDate,
        // se não configurado, frontend deve pedir nome manualmente
        requires_manual_name: !result.configured || !result.found,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
