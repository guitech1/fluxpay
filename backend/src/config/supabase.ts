import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * Clientes Supabase do backend (service role e anon).
 *
 * Netlify Functions (Node < 22) nao expoe WebSocket nativo. O
 * @supabase/supabase-js inicializa RealtimeClient no createClient e, sem
 * WebSocket, lanca no boot:
 *   "Node.js detected but native WebSocket not found"
 * A funcao inteira cai — /health e /v1/* respondem 502 antes de qualquer rota.
 *
 * O backend nunca assina canais realtime (so REST + Auth admin). Instalamos
 * um WebSocket no-op global ANTES do createClient para a factory nao falhar;
 * o transporte nunca conecta de fato. Tipos DOM (BinaryType, CloseEvent) sao
 * evitados de proposito: o tsconfig do backend so tem "ES2022".
 *
 * O frontend (browser) nao usa este arquivo e mantem realtime normal.
 */
function ensureNoopWebSocket(): void {
  const g = globalThis as typeof globalThis & { WebSocket?: unknown };
  if (typeof g.WebSocket === "function") return;

  class NoopWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;
    readyState = 3;
    url = "";
    protocol = "";
    bufferedAmount = 0;
    extensions = "";
    binaryType: "blob" | "arraybuffer" = "blob";
    onopen: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    onclose: ((ev: unknown) => void) | null = null;
    onmessage: ((ev: unknown) => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_url?: string | URL, _protocols?: string | string[]) {
      /* never connects */
    }
    close(_code?: number, _reason?: string) {
      /* noop */
    }
    send(_data?: unknown) {
      /* noop */
    }
    addEventListener(_type?: string, _listener?: unknown) {
      /* noop */
    }
    removeEventListener(_type?: string, _listener?: unknown) {
      /* noop */
    }
    dispatchEvent(_event?: unknown) {
      return false;
    }
  }

  g.WebSocket = NoopWebSocket as unknown as typeof WebSocket;
}

ensureNoopWebSocket();

const authOpts = {
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false,
} as const;

// Service role client – bypasses RLS. Use only in trusted backend.
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: authOpts,
    global: { headers: { "X-Client-Info": "fluxpay-backend" } },
  }
);

// Anon client for limited operations if needed
export const supabaseAnon: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: authOpts,
  global: { headers: { "X-Client-Info": "fluxpay-backend-anon" } },
});
