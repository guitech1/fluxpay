"use client";

import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type Props = {
  onToken: (token: string | null) => void;
  theme?: "light" | "dark" | "auto";
  className?: string;
};

/**
 * Widget oficial Cloudflare Turnstile.
 * Site key pública (NEXT_PUBLIC_TURNSTILE_SITE_KEY).
 * O token deve ser validado no servidor (Supabase Auth captcha ou nosso verifyTurnstile).
 */
export function TurnstileWidget({ onToken, theme = "dark", className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const renderWidget = useCallback(() => {
    if (!SITE_KEY || !containerRef.current || !window.turnstile) return;
    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        /* ignore */
      }
      widgetIdRef.current = null;
    }
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      theme,
      size: "flexible",
      callback: (token) => onTokenRef.current(token),
      "error-callback": () => onTokenRef.current(null),
      "expired-callback": () => onTokenRef.current(null),
    });
  }, [theme]);

  useEffect(() => {
    if (!SITE_KEY) {
      // Sem site key: não bloqueia o formulário em dev; em prod o backend/Supabase rejeitam.
      onTokenRef.current(null);
      return;
    }

    if (window.turnstile) {
      renderWidget();
      return;
    }

    const existing = document.querySelector(
      'script[src*="challenges.cloudflare.com/turnstile"]',
    );
    if (existing) {
      window.onTurnstileLoad = renderWidget;
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
    script.async = true;
    script.defer = true;
    window.onTurnstileLoad = renderWidget;
    document.head.appendChild(script);

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
      }
    };
  }, [renderWidget]);

  if (!SITE_KEY) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="turnstile-widget"
      aria-label="Verificação de segurança"
    />
  );
}

export function resetTurnstile() {
  if (typeof window !== "undefined" && window.turnstile) {
    try {
      window.turnstile.reset();
    } catch {
      /* ignore */
    }
  }
}
