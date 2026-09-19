import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * Clientes Supabase do backend (service role e anon).
 *
 * Netlify Functions (Node 20) nao expoe WebSocket nativo. O
 * @supabase/supabase-js inicializa RealtimeClient no createClient e, sem
 * WebSocket, lanca no boot:
 *   "Node.js detected but native WebSocket not found"
 * A funcao inteira cai — /health e /v1/* respondem 502 antes de qualquer rota.
 *
 * O backend nunca assina canais realtime (so REST + Auth admin). Instalamos
 * um WebSocket no-op global ANTES do createClient para a factory nao falhar;
 * o transporte nunca conecta de fato.
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
    binaryType: BinaryType = "blob";
    onopen: ((ev: Event) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    constructor(_url?: string | URL, _protocols?: string | string[]) {
      /* never connects */
    }
    close() {
      /* noop */
    }
    send() {
      /* noop */
    }
    addEventListener() {
      /* noop */
    }
    removeEventListener() {
      /* noop */
    }
    dispatchEvent() {
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
