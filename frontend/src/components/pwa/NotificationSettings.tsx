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

const DISMISS_KEY = "fluxpay_push_dismissed_at";
const DISMISS_MS = 12 * 60 * 60 * 1000;

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Este navegador nao suporta service worker.");
  }
  let reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) {
    reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }
  if (reg.installing) {
    await new Promise<void>((resolve, reject) => {
      const sw = reg!.installing!;
      const t = setTimeout(() => reject(new Error("Timeout a activar service worker.")), 15000);
      sw.addEventListener("statechange", () => {
        if (sw.state === "activated" || sw.state === "installed") {
          clearTimeout(t);
          resolve();
        }
      });
    });
  }
  return navigator.serviceWorker.ready;
}

export function NotificationSettings() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unknown">("unknown");
  const [hasSub, setHasSub] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
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
      const reg = await ensureServiceWorker();
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        throw new Error(
          perm === "denied"
            ? "Notificacoes bloqueadas neste site. No Chrome: cadeado na barra de endereco → Notificacoes → Permitir, depois tente de novo."
            : "Permissao nao concedida."
        );
      }
      localStorage.removeItem(DISMISS_KEY);

      const keyRes = await dashboardFetch<{ data: { publicKey: string } }>("/push/vapid-public-key");
      const publicKey =
        keyRes?.data?.publicKey || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
      if (!publicKey) {
        throw new Error("Chave VAPID publica indisponivel. Contacte o suporte FluxPay.");
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("O navegador nao devolveu uma subscricao push valida.");
      }

      await dashboardFetch("/push/subscribe", {
        method: "POST",
        body: {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        },
      });
      setHasSub(true);
      setConfigured(true);
      setMsg("Notificacoes activadas neste dispositivo. Use os botoes de teste abaixo.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao activar notificacoes.");
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function test(kind: "pix_generated" | "sale_paid") {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (!hasSub) {
        throw new Error("Active as notificacoes primeiro para receber o teste neste dispositivo.");
      }
      const res = await dashboardFetch<{ data: { sent: number } }>("/push/test", {
        method: "POST",
        body: { kind },
      });
      setMsg(
        res.data.sent > 0
          ? `Teste enviado (${res.data.sent}). Se nao aparecer, verifique o modo Nao incomodar do telemovel.`
          : "Pedido de teste aceite, mas nenhum dispositivo recebeu. Reactive as notificacoes."
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no teste de notificacao.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported && permission !== "unknown") {
    return (
      <div className="card space-y-2">
        <h3 className="font-medium">Notificacoes push</h3>
        <p className="text-sm text-flux-muted">
          Este navegador nao suporta Web Push. Use Chrome/Edge/Firefox no telemovel ou desktop (HTTPS).
        </p>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="font-medium">Notificacoes push</h3>
        <p className="text-sm text-flux-muted mt-1">
          Receba alertas quando um PIX for gerado ou uma venda for paga.
        </p>
      </div>

      {err && <Alert tone="error">{err}</Alert>}
      {msg && <Alert tone="success">{msg}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-flux-muted">
          Estado:{" "}
          {hasSub
            ? "subscricao activa"
            : permission === "denied"
              ? "bloqueado no navegador"
              : configured
                ? "servidor OK — active neste dispositivo"
                : "nao activado"}
        </span>
        {!hasSub && permission !== "denied" && (
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={busy}
            onClick={() => void enable()}
          >
            {busy ? "A activar…" : "Activar notificacoes"}
          </button>
        )}
        {permission === "denied" && (
          <span className="text-xs text-amber-300">
            Desbloqueie notificacoes nas definicoes do site e recarregue a pagina.
          </span>
        )}
      </div>

      <div className="border-t border-flux-border pt-4 space-y-2">
        <p className="text-xs text-flux-muted">Testes (nao criam cobranca nem alteram saldo)</p>
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

/** Banner: aparece enquanto nao houver subscricao (exceto se o browser bloqueou). */
export function NotificationPromptBanner() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission === "denied") return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || "0");
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_MS) return;

    let cancelled = false;
    (async () => {
      try {
        const st = await dashboardFetch<{ data: { has_subscription: boolean } }>("/push/status");
        if (!cancelled && !st.data.has_subscription) setShow(true);
      } catch {
        if (!cancelled && Notification.permission !== "granted") setShow(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function activateInline() {
    setBusy(true);
    setErr(null);
    try {
      await ensureServiceWorker();
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setErr("Permissao nao concedida. Pode activar depois em Definicoes.");
        return;
      }
      localStorage.removeItem(DISMISS_KEY);
      window.location.href = "/dashboard/settings#notificacoes";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao activar.");
    } finally {
      setBusy(false);
    }
  }

  if (!show) return null;

  return (
    <div className="border-b border-flux-border bg-flux-dark/90 px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div>
        <p className="text-white font-medium">Active as notificacoes</p>
        <p className="text-flux-muted text-xs mt-0.5">
          Saiba na hora quando um PIX for gerado ou uma venda for paga.
        </p>
        {err && <p className="text-amber-300 text-xs mt-1">{err}</p>}
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
            setShow(false);
          }}
        >
          Agora nao
        </button>
        <button
          type="button"
          className="btn-primary text-xs"
          disabled={busy}
          onClick={() => void activateInline()}
        >
          {busy ? "A pedir…" : "Activar"}
        </button>
      </div>
    </div>
  );
}
