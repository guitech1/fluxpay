/**
 * Consulta cadastral de CPF (API externa — NÃO é NexusPag).
 *
 * Configuração esperada (backend only):
 *   CPF_LOOKUP_API_URL   — URL base do provedor (ex: https://api.provedor.com/v1/cpf)
 *   CPF_LOOKUP_API_KEY   — Bearer ou header x-api-key conforme o provedor
 *   CPF_LOOKUP_AUTH_HEADER — opcional, default "Authorization" (valor: Bearer <key>)
 *   ou header "x-api-key" se CPF_LOOKUP_AUTH_STYLE=x-api-key
 *
 * Resposta esperada (normalizada):
 *   { name: string, cpf?: string, birth_date?: string, status?: string }
 *
 * Se não configurado, retorna configured:false e o cadastro segue com nome digitado.
 * Nunca inventa nome. Nunca loga a chave.
 */
import { AppError } from "../middleware/error.js";

export interface CpfLookupResult {
  configured: boolean;
  found: boolean;
  name: string | null;
  cpf: string | null;
  birthDate: string | null;
  rawStatus?: string | null;
  error?: string;
}

function onlyDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}

export function isCpfLookupConfigured(): boolean {
  return Boolean(process.env.CPF_LOOKUP_API_URL && process.env.CPF_LOOKUP_API_KEY);
}

export async function lookupCpfByDocument(cpfInput: string): Promise<CpfLookupResult> {
  const cpf = onlyDigits(cpfInput);
  if (cpf.length !== 11) {
    throw new AppError(400, "validation_error", "CPF deve ter 11 digitos.");
  }

  const baseUrl = process.env.CPF_LOOKUP_API_URL?.trim();
  const apiKey = process.env.CPF_LOOKUP_API_KEY?.trim();

  if (!baseUrl || !apiKey) {
    return {
      configured: false,
      found: false,
      name: null,
      cpf,
      birthDate: null,
      error: "CPF_LOOKUP_API_URL / CPF_LOOKUP_API_KEY nao configurados",
    };
  }

  const style = (process.env.CPF_LOOKUP_AUTH_STYLE || "bearer").toLowerCase();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (style === "x-api-key") {
    headers["x-api-key"] = apiKey;
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  // URL: se terminar com placeholder {cpf}, substitui; senão append /{cpf}
  let url = baseUrl;
  if (url.includes("{cpf}")) {
    url = url.replace("{cpf}", cpf);
  } else {
    url = url.replace(/\/$/, "") + "/" + cpf;
  }

  const method = (process.env.CPF_LOOKUP_METHOD || "GET").toUpperCase();
  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(12000),
  };
  if (method === "POST") {
    init.body = JSON.stringify({ cpf });
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    return {
      configured: true,
      found: false,
      name: null,
      cpf,
      birthDate: null,
      error: err instanceof Error ? err.message : "rede",
    };
  }

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (res.status === 404) {
    return { configured: true, found: false, name: null, cpf, birthDate: null, rawStatus: "not_found" };
  }
  if (!res.ok || !data) {
    return {
      configured: true,
      found: false,
      name: null,
      cpf,
      birthDate: null,
      error: `HTTP ${res.status}`,
      rawStatus: String(res.status),
    };
  }

  // Normaliza campos comuns de provedores BR
  const name =
    (typeof data.nome === "string" && data.nome) ||
    (typeof data.name === "string" && data.name) ||
    (typeof data.full_name === "string" && data.full_name) ||
    (typeof (data as any).data?.nome === "string" && (data as any).data.nome) ||
    (typeof (data as any).data?.name === "string" && (data as any).data.name) ||
    null;

  const birth =
    (typeof data.data_nascimento === "string" && data.data_nascimento) ||
    (typeof data.birth_date === "string" && data.birth_date) ||
    (typeof data.nascimento === "string" && data.nascimento) ||
    null;

  if (!name || !String(name).trim()) {
    return {
      configured: true,
      found: false,
      name: null,
      cpf,
      birthDate: birth,
      rawStatus: "incomplete",
    };
  }

  return {
    configured: true,
    found: true,
    name: String(name).trim(),
    cpf,
    birthDate: birth,
    rawStatus: "ok",
  };
}
