"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "fluxpay_install_dismissed_at";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Banner "Adicionar ao ecran inicial" (PWA).
 * Chrome/Edge: beforeinstallprompt. iOS Safari: instrucoes manuais.
 */
export function InstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || "0");
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_MS) return;

    if (window.matchMedia("(display-mode: standalone)").matches) return;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari =
      /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    if (isIos && isSafari) {
      setIosHint(true);
      setShow(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="border-b border-flux-border bg-flux-gray/80 px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div>
        <p className="text-white font-medium">Adicionar FluxPay ao ecran inicial</p>
        <p className="text-flux-muted text-xs mt-0.5">
          {iosHint
            ? "No iPhone: toque em Partilhar (□↑) → “Adicionar ao Ecran de Inicio”."
            : "Instale como app para abrir mais rapido e receber notificacoes com mais fiabilidade."}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button type="button" className="btn-ghost text-xs" onClick={dismiss}>
          Agora nao
        </button>
        {!iosHint && deferred && (
          <button type="button" className="btn-primary text-xs" onClick={() => void install()}>
            Instalar
          </button>
        )}
      </div>
    </div>
  );
}
