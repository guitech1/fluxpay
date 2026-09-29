"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Minus, X, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { dashboardFetch } from "@/lib/dashboard-api";
import { SupportAgent } from "./SupportAgent";
import { FluxMark } from "@/components/brand/FluxLogo";
import { createClient } from "@/lib/supabase/client";

type Msg = {
  id: string;
  sender_type: "customer" | "agent" | "system" | "assistant";
  message_type: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type Conversation = {
  id: string;
  subject: string;
  status: string;
  customer_unread_count?: number;
};

const OPTIONS = [
  {
    id: "transactions",
    title: "Consultar minhas transacoes",
    description:
      "Consulte suas transacoes recentes, status de pagamentos e movimentacoes da sua conta.",
    action: "get_recent_transactions" as const,
  },
  {
    id: "balance",
    title: "Minha venda foi realizada, mas o saldo ainda nao esta disponivel para saque",
    description:
      "Vamos verificar o status da sua venda e identificar se o valor ainda esta em processamento ou aguardando liberacao.",
    action: "get_balance_release" as const,
  },
  {
    id: "api",
    title: "Preciso de ajuda com a integracao da API",
    description: "Encaminhamos voce para um especialista em integracao.",
    action: "request_api_help" as const,
  },
  {
    id: "human",
    title: "Falar com um atendente",
    description: "Conecte-se com a equipe de suporte da FluxPay.",
    action: "request_human" as const,
  },
];

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [showOptions, setShowOptions] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, []);

  useEffect(() => {
    scrollBottom();
  }, [messages, open, scrollBottom]);

  // Realtime: novas mensagens na conversa atual
  useEffect(() => {
    if (!conversation?.id || !open) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`support-msg-${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const row = payload.new as Msg;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id, open]);

  async function ensureConversation() {
    if (conversation) return conversation;
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardFetch<{ data: { conversation: Conversation; messages: Msg[] } }>(
        "/support/conversations",
        { method: "POST", body: { subject: "Atendimento" } }
      );
      setConversation(res.data.conversation);
      setMessages(res.data.messages || []);
      setShowOptions(true);
      return res.data.conversation;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nao foi possivel iniciar o suporte.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen() {
    setOpen(true);
    setMinimized(false);
    if (!conversation) await ensureConversation();
  }

  async function handleOption(opt: (typeof OPTIONS)[number]) {
    const conv = conversation || (await ensureConversation());
    if (!conv) return;
    setShowOptions(false);
    setActionLoading(true);
    setError(null);
    try {
      await dashboardFetch(`/support/conversations/${conv.id}/actions`, {
        method: "POST",
        body: { action: "select_option", option: opt.title },
      });
      const res = await dashboardFetch<{ data: unknown }>(`/support/conversations/${conv.id}/actions`, {
        method: "POST",
        body: { action: opt.action },
      });
      void res;
      // Recarrega mensagens para garantir ordem
      const full = await dashboardFetch<{ data: { conversation: Conversation; messages: Msg[] } }>(
        `/support/conversations/${conv.id}`
      );
      setConversation(full.data.conversation);
      setMessages(full.data.messages || []);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Nao foi possivel carregar suas informacoes no momento. Tente novamente em instantes."
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || !conversation) return;
    setSending(true);
    setError(null);
    setInput("");
    try {
      const res = await dashboardFetch<{ data: Msg }>(`/support/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: { content: text },
      });
      setMessages((prev) => (prev.some((m) => m.id === res.data.id) ? prev : [...prev, res.data]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar mensagem.");
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  function renderMessage(m: Msg) {
    if (m.message_type === "system_event" && m.metadata?.type === "cta") {
      const href = String(m.metadata.href || "/dashboard/payments");
      const label = String(m.metadata.label || "Ver todas as transacoes");
      return (
        <div key={m.id} className="flex justify-center my-2">
          <Link
            href={href}
            className="btn-secondary text-xs px-3 py-2 min-h-0"
            onClick={() => setOpen(false)}
          >
            {label}
          </Link>
        </div>
      );
    }

    const isCustomer = m.sender_type === "customer";
    const isSystem = m.sender_type === "system";
    const isAssistant = m.sender_type === "assistant";

    if (isSystem) {
      return (
        <div key={m.id} className="flex justify-center my-2">
          <p className="text-xs text-flux-muted text-center max-w-[90%] px-2">{m.content}</p>
        </div>
      );
    }

    return (
      <div
        key={m.id}
        className={cn("flex gap-2 mb-3", isCustomer ? "justify-end" : "justify-start")}
      >
        {!isCustomer && (
          <div className="shrink-0 mt-1">
            {isAssistant ? (
              <SupportAgent className="w-9 h-9" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-flux-gray-light flex items-center justify-center">
                <FluxMark className="w-5 h-5" />
              </div>
            )}
          </div>
        )}
        <div
          className={cn(
            "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
            isCustomer
              ? "bg-flux-red text-white rounded-br-md"
              : "bg-flux-gray-light text-white rounded-bl-md border border-flux-border"
          )}
        >
          {m.content}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Botao flutuante */}
      {!open && (
        <button
          type="button"
          onClick={handleOpen}
          className="fixed bottom-5 right-5 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-flux-red text-white shadow-lg shadow-flux-red/30 hover:bg-flux-red-dark transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flux-red"
          aria-label="Abrir suporte FluxPay"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Painel */}
      <div
        ref={panelRef}
        className={cn(
          "fixed z-50 flex flex-col bg-flux-dark border border-flux-border shadow-2xl transition-all duration-300 ease-out",
          open && !minimized
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none",
          // Desktop
          "bottom-5 right-5 w-[min(420px,calc(100vw-1.5rem))] h-[min(640px,calc(100vh-3rem))] rounded-2xl",
          // Mobile quase tela cheia
          "max-sm:inset-2 max-sm:w-auto max-sm:h-auto max-sm:rounded-xl"
        )}
        aria-hidden={!open || minimized}
      >
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-flux-border bg-flux-black/60 rounded-t-2xl max-sm:rounded-t-xl shrink-0">
          <FluxMark className="w-8 h-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm tracking-tight">Suporte FluxPay</div>
            <div className="flex items-center gap-1.5 text-[11px] text-flux-muted">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Atendimento disponivel
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="p-2 rounded-lg text-flux-muted hover:text-white hover:bg-flux-gray-light transition-colors"
            aria-label="Minimizar"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-2 rounded-lg text-flux-muted hover:text-white hover:bg-flux-gray-light transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-flux-muted text-sm">
              <Loader2 className="w-6 h-6 animate-spin" />
              Consultando suas informacoes...
            </div>
          )}

          {!loading && messages.map(renderMessage)}

          {actionLoading && (
            <div className="flex items-center gap-2 text-sm text-flux-muted my-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              Consultando suas informacoes...
            </div>
          )}

          {showOptions && !loading && conversation && (
            <div className="mt-2 space-y-2">
              {OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleOption(opt)}
                  className="w-full text-left rounded-xl border border-flux-border bg-flux-gray/80 hover:bg-flux-gray-light hover:border-flux-red/40 px-3.5 py-3 transition-colors disabled:opacity-50"
                >
                  <div className="text-sm font-medium text-white">{opt.title}</div>
                  <div className="text-xs text-flux-muted mt-1 leading-relaxed">{opt.description}</div>
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-flux-border p-3 bg-flux-black/40 rounded-b-2xl max-sm:rounded-b-xl">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              rows={1}
              placeholder="Digite sua mensagem..."
              className="input flex-1 min-h-[44px] max-h-28 resize-none py-2.5 text-sm"
              disabled={!conversation || sending || conversation?.status === "resolved"}
            />
            <button
              type="submit"
              disabled={!input.trim() || sending || !conversation}
              className="btn-primary min-h-[44px] px-3 shrink-0"
              aria-label="Enviar"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </div>

      {/* Minimizado: bolha pequena */}
      {open && minimized && (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-flux-dark border border-flux-border pl-2 pr-4 py-2 shadow-lg hover:border-flux-red/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-flux-red flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <span className="text-sm font-medium">Suporte FluxPay</span>
        </button>
      )}
    </>
  );
}
