"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Botão de copiar com retorno visual — usado em código PIX, chaves e IDs. */
export function CopyButton({
  value,
  label = "Copiar",
  copiedLabel = "Copiado",
  className,
  iconOnly = false,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Contexto sem clipboard (http, permissão negada): seleciona o texto
      // para o usuário copiar na mão em vez de falhar em silêncio.
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        setCopied(true);
      } catch {
        /* sem alternativa: o valor continua visível na tela */
      }
      document.body.removeChild(area);
    }
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? copiedLabel : label}
        className={cn(
          "shrink-0 p-2 rounded-md text-flux-muted hover:text-white hover:bg-flux-gray-light transition-colors",
          className
        )}
      >
        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
      </button>
    );
  }

  return (
    <button type="button" onClick={copy} className={cn("btn-ghost text-sm", className)}>
      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
      {copied ? copiedLabel : label}
    </button>
  );
}

/** Modal acessível: fecha com Esc e com clique fora. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-flux-dark border border-flux-border rounded-t-2xl sm:rounded-xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 -m-1.5 rounded-md text-flux-muted hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 pt-1">{footer}</div>}
      </div>
    </div>
  );
}

/** Mensagem inline de erro ou sucesso. Texto sempre já tratado para leitura. */
export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: ReactNode;
}) {
  const tones = {
    error: "bg-red-500/10 border-red-500/20 text-red-200",
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-200",
    info: "bg-flux-gray border-flux-border text-flux-muted",
  };

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-lg border px-3.5 py-2.5 text-sm", tones[tone])}
    >
      {children}
    </div>
  );
}

/**
 * Botão com estado de carregando embutido.
 *
 * A variante entra por prop (e não por className) porque `btn-primary` e
 * `btn-secondary` são classes de componente: passar as duas faria a que vem
 * depois no CSS vencer, não a que foi pedida.
 */
export function SubmitButton({
  loading,
  variant = "primary",
  children,
  className,
  ...props
}: {
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  children: ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    ghost: "btn-ghost",
    danger: "btn-danger",
  };

  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={cn(variants[variant], className)}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}
