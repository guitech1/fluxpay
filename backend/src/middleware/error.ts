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
 */
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
    // Os campos invalidos sao uteis para quem integra (e a propria tela usa
    // para marcar o campo), mas a mensagem geral continua em portugues claro.
    res.status(400).json({
      error: {
        type: "validation_error",
        message: "Alguns campos da requisicao estao invalidos.",
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  console.error("[fluxpay] erro nao tratado:", {
    method: req.method,
    path: req.path,
    error: err?.message,
    stack: err?.stack,
  });

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
