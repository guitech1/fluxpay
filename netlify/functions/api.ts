import serverless from "serverless-http";
import app from "../../backend/dist/index.js";

/**
 * Empacota o app Express inteiro como uma unica funcao Netlify, em vez de
 * reescrever cada rota como uma function separada. Isso preserva 100% da
 * logica existente (services, middlewares, schemas zod) — muda so como a
 * requisicao chega ate o app.
 *
 * Duas decisoes que valem explicacao:
 *
 * 1. O import aponta para `backend/dist`, nao para `backend/src`. O bundler de
 *    functions da Netlify (esbuild) resolve o especificador literalmente, e
 *    `../../backend/src/index.js` nao existe em disco (o arquivo real e .ts).
 *    Por isso o build roda `npm run build --workspace=backend` antes.
 *
 * 2. Em vez de confiar no `basePath` do serverless-http, normalizamos o
 *    `event.path` na mao. Dependendo de como o redirect e resolvido, a Netlify
 *    entrega ora o caminho da funcao (/.netlify/functions/api/v1/...), ora o
 *    caminho original (/v1/...). Tratando os dois, a rota funciona nos dois
 *    casos — que e exatamente o risco que o CONTINUACAO.md apontava como
 *    "so se confirma com um deploy de teste".
 */
const FUNCTION_PREFIX = "/.netlify/functions/api";

const wrapped = serverless(app);

export const handler = async (event: Record<string, unknown>, context: unknown) => {
  const path = event.path;

  if (typeof path === "string" && path.startsWith(FUNCTION_PREFIX)) {
    event.path = path.slice(FUNCTION_PREFIX.length) || "/";
  }

  return wrapped(event as never, context as never);
};
