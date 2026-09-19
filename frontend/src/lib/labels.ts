import type { OrgRole } from "./types";

/**
 * Traducao de tudo que vem do banco em ingles para o texto que o usuario le.
 *
 * O banco continua usando "owner", "developer", "succeeded" etc. — sao valores
 * de enum, dos quais dependem RLS, triggers e a API. O que muda e so a
 * apresentacao: em nenhuma tela deve aparecer o identificador tecnico.
 */

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Proprietário da conta",
  admin: "Administrador",
  developer: "Desenvolvedor",
  viewer: "Visualizador",
};

/** Versao curta, para caber em tabela e no cabecalho. */
const ROLE_LABELS_SHORT: Record<OrgRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  developer: "Desenvolvedor",
  viewer: "Visualizador",
};

export function roleLabel(role: string, short = false): string {
  const table = short ? ROLE_LABELS_SHORT : ROLE_LABELS;
  return table[role as OrgRole] ?? "Membro";
}

export const ROLE_DESCRIPTIONS: Record<Exclude<OrgRole, "owner">, string> = {
  admin: "Gerencia cobranças, equipe e dados da empresa.",
  developer: "Cria cobranças, chaves de API e webhooks.",
  viewer: "Apenas consulta; não altera nada.",
};

/** Rotulo do ambiente. Nunca mostrar "test"/"live" crus na interface. */
export function environmentLabel(environment: string): string {
  return environment === "live" ? "Produção" : "Teste";
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  pix: "PIX",
  card: "Cartão",
  boleto: "Boleto",
  transfer: "Transferência",
  wallet: "Carteira",
  spei: "SPEI",
};

export function paymentTypeLabel(type: string | null | undefined): string {
  if (!type) return "—";
  return PAYMENT_TYPE_LABELS[type] ?? type.toUpperCase();
}

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  success: "Entregue",
  failed: "Falhou",
  pending: "Pendente",
  retrying: "Reenviando",
};

export function deliveryStatusLabel(status: string): string {
  return DELIVERY_STATUS_LABELS[status] ?? status;
}

/**
 * Converte qualquer erro que chegou de uma camada tecnica em uma frase que
 * faz sentido para quem esta na tela.
 *
 * Mensagens do Supabase, do Postgres, do fetch e do runtime nunca sao
 * exibidas: elas vao para o console (diagnostico) e a pessoa ve a frase
 * equivalente. A unica excecao sao as mensagens que o proprio backend do
 * FluxPay escreveu para serem lidas — essas ja passam prontas pelo
 * dashboardFetch e chegam aqui apenas quando nao ha nada melhor.
 */
export function friendlyError(error: unknown, fallback = "Não foi possível concluir a operação. Tente novamente."): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";

  if (!raw) return fallback;

  const technical = [
    "supabase",
    "postgrest",
    "axioserror",
    "fetch failed",
    "networkerror",
    "internal server error",
    "undefined",
    "null value",
    "duplicate key",
    "violates",
    "jwt",
    "pgrst",
    "econnrefused",
    "typeerror",
  ];

  const lower = raw.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed")) {
    return "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
  }

  if (lower.includes("duplicate key") || lower.includes("already exists") || lower.includes("unique")) {
    return "Já existe um registro com esses dados.";
  }

  if (lower.includes("sessao expirada") || lower.includes("sessão expirada") || lower.includes("jwt")) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }

  if (technical.some((t) => lower.includes(t))) {
    if (process.env.NODE_ENV !== "production") console.error("[fluxpay] erro técnico:", raw);
    return fallback;
  }

  return raw;
}

/** Erros de autenticacao do Supabase Auth em texto de gente. */
export function authError(message: string): string {
  const map: Record<string, string> = {
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "Email not confirmed": "Confirme seu e-mail antes de entrar.",
    "User already registered": "Já existe uma conta com este e-mail.",
    "Password should be at least 6 characters.": "A senha precisa ter pelo menos 8 caracteres.",
    "Unable to validate email address: invalid format": "Informe um e-mail válido.",
    "Email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
    "New password should be different from the old password.":
      "A nova senha precisa ser diferente da atual.",
  };

  if (map[message]) return map[message];

  const lower = message.toLowerCase();
  if (lower.includes("already registered") || lower.includes("already exists"))
    return "Já existe uma conta com este e-mail.";
  if (lower.includes("password")) return "Senha inválida. Use pelo menos 8 caracteres.";
  if (lower.includes("email")) return "Informe um e-mail válido.";
  if (lower.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos.";

  console.error("[fluxpay] auth:", message);
  return "Não foi possível concluir. Tente novamente.";
}
