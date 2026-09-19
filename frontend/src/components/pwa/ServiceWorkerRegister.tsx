"use client";

import { useEffect } from "react";

/**
 * Registra o service worker (public/sw.js) depois que a pagina carrega.
 *
 * Em desenvolvimento (http://localhost) o registro acontece normalmente — o
 * navegador trata localhost como origem segura. Em qualquer outro host sem
 * HTTPS o registro falha, e isso e esperado: PWA so existe sobre HTTPS.
 *
 * O SW nao intercepta chamadas de API (ver public/sw.js); ele serve para
 * instalacao no celular/desktop e para a tela de offline.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.warn("Service worker nao registrado:", err);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
