"use client";

import { useCallback, useEffect, useState } from "react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { Alert } from "@/components/dashboard/ui-client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const DENIED_KEY = "fluxpay_push_denied";

export function NotificationSettings() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unknown">("unknown");
  const [hasSub, setHasSub] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    if (localStorage.getItem(DENIED_KEY) === "1") setDismissed(true);
    try {
      const st = await dashboardFetch<{ data: { configured: boolean; has_subscription: boolean } }>(
        "/push/status"
      );
      setConfigured(st.data.configured);
      setHasSub(st.data.has_subscription);
    } catch {
      setConfigured(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (!supported) throw new Error("Este navegador nao suporta notificacoes push.");
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        localStorage.setItem(DENIED_KEY, "1");
        setDismissed(true);
        throw new Error("Permissao de notificacoes recusada. Pode ativar depois nas definicoes do navegador.");
      }
      localStorage.removeItem(DENIED_KEY);

      const keyRes = await dashboardFetch<{ data: { publicKey: string } }>("/push/vapid-public-key");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.data.publicKey) as BufferSource,
      });
      const json = sub.toJSON();
      await dashboardFetch("/push/subscribe", {
        method: "POST",
        body: {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        },
      });
      setHasSub(true);
      setMsg("Notificacoes ativadas neste dispositivo.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao ativar notificacoes.");
    } finally {
      setBusy(false);
    }
  }

  async function test(kind: "pix_generated" | "sale_paid") {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (!hasSub) {
        throw new Error("Ative as notificacoes primeiro para receber o teste neste dispositivo.");
      }
      const res = await dashboardFetch<{ data: { sent: number; amount_label?: string } }>("/push/test", {
        method: "POST",
        body: { kind },
      });
      setMsg(
        kind === "pix_generated"
          ? `Teste PIX gerado enviado (${res.data.sent} dispositivo(s)).`
          : `Teste venda paga enviado${res.data.amount_label ? ` · ${res.data.amount_label}` : ""} (${res.data.sent} dispositivo(s)).`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no teste.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <div className="card space-y-2">
        <h3 className="font-medium">Notificacoes</h3>
        <p className="text-sm text-flux-muted">
          Este dispositivo ou navegador nao suporta Web Push (comum em alguns browsers no iOS
          sem a app instalada). No iPhone, adicione a FluxPay a ecran inicial e use Safari 16.4+.
        </p>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="font-medium">Notificacoes</h3>
        <p className="text-sm text-flux-muted mt-1">
          Receba avisos quando um PIX for gerado e quando uma venda for confirmada. A confirmacao de
          pagamento vem sempre do servidor — nunca apenas do browser.
        </p>
      </div>

      {err && <Alert tone="error">{err}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}

      {!configured && (
        <p className="text-xs text-amber-200/80">
          O servidor ainda nao tem chaves VAPID configuradas. As subscricoes ficam guardadas; o
          envio activa-se quando VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY estiverem definidas.
        </p>
      )}

      <div className="flex flex-wrap gap-2 items-center text-sm">
        <span className="text-flux-muted">
          Estado:{" "}
          {hasSub
            ? "subscricao activa"
            : permission === "denied" || dismissed
              ? "recusado"
              : "nao activado"}
        </span>
        {!hasSub && permission !== "denied" && (
          <button type="button" className="btn-primary text-sm" disabled={busy} onClick={() => void enable()}>
            {busy ? "A activar…" : "Activar notificacoes"}
          </button>
        )}
      </div>

      <div className="border-t border-flux-border pt-4 space-y-2">
        <p className="text-xs text-flux-muted">Testes de demonstracao (nao criam cobranca nem alteram saldo)</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={busy || !hasSub}
            onClick={() => void test("pix_generated")}
          >
            Testar PIX gerado
          </button>
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={busy || !hasSub}
            onClick={() => void test("sale_paid")}
          >
            Testar venda paga
          </button>
        </div>
      </div>
    </div>
  );
}

/** Banner pos-login: so se ainda nao autorizou e nao recusou de forma persistente. */
export function NotificationPromptBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (localStorage.getItem(DENIED_KEY) === "1") return;
    if (Notification.permission === "granted") return;
    if (Notification.permission === "denied") return;
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="border-b border-flux-border bg-flux-dark/80 px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <p className="text-flux-muted">
        Active as notificacoes para saber na hora quando um PIX for gerado ou uma venda for paga.
      </p>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => {
            localStorage.setItem(DENIED_KEY, "1");
            setShow(false);
          }}
        >
          Agora nao
        </button>
        <a href="/dashboard/settings" className="btn-primary text-xs">
          Activar
        </a>
      </div>
    </div>
  );
}
