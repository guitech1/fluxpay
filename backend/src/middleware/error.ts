import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public type: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Formato unico de erro da API: { error: { type, message, request_id? } }.
 *
 * Regra que vale para todo o backend: a mensagem devolvida e SEMPRE escrita
 * para ser lida por uma pessoa. Stack trace, mensagem do Postgres, corpo de
 * resposta do adquirente e qualquer outro detalhe tecnico ficam no log do
 * servidor (console.error) — nunca no corpo da resposta. Quem precisa do
 * detalhe tem acesso ao log; quem esta na tela nao precisa dele.
 *
 * Exceção: erros já redigidos em português pelo próprio backend/triggers
 * (ex.: proteção de status) podem ser repassados sem vazar SQL interno.
 */
function isSafeClientMessage(message: string): boolean {
  const m = message.trim();
  if (!m || m.length > 300) return false;
  // Evita vazar detalhes técnicos de infra
  if (/password|secret|jwt|stack|ECONN|ENOENT|postgres|sql state/i.test(m)) return false;
  return true;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        type: err.type,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        type: "validation_error",
        message: "Alguns campos da requisicao estao invalidos.",
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  // PostgREST / supabase-js errors often carry a useful .message (and .code)
  const anyErr = err as Error & { code?: string; details?: string };
  const code = anyErr.code;

  console.error("[fluxpay] erro nao tratado:", {
    method: req.method,
    path: req.path,
    error: anyErr?.message,
    code,
    details: anyErr?.details,
    stack: err?.stack,
  });

  // Permission / business rules raised by our triggers
  if (code === "42501" || /Somente o backend administrativo/i.test(anyErr.message || "")) {
    res.status(403).json({
      error: {
        type: "permission_error",
        message: isSafeClientMessage(anyErr.message)
          ? anyErr.message
          : "Operacao nao permitida.",
      },
    });
    return;
  }

  if (code === "23514" || code === "P0002" || code === "23505") {
    res.status(409).json({
      error: {
        type: "invalid_request",
        message: isSafeClientMessage(anyErr.message)
          ? anyErr.message
          : "Nao foi possivel concluir a operacao com os dados informados.",
      },
    });
    return;
  }

  if (anyErr.message && isSafeClientMessage(anyErr.message) && /[A-Za-zÀ-ú]/.test(anyErr.message)) {
    // Mensagens de domínio já em português (ex.: Organizacao nao esta ativa)
    res.status(400).json({
      error: {
        type: "api_error",
        message: anyErr.message,
      },
    });
    return;
  }

  res.status(500).json({
    error: {
      type: "api_error",
      message:
        "Nao foi possivel concluir a operacao. Tente novamente em instantes.",
    },
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: {
      type: "not_found",
      message: "Recurso nao encontrado.",
    },
  });
}
