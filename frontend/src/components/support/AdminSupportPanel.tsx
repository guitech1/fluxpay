"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/admin-api";
import { createClient } from "@/lib/supabase/client";

type ConvRow = {
  id: string;
  user_id: string;
  organization_id: string;
  subject: string;
  status: string;
  last_message_at: string;
  last_message_preview: string | null;
  agent_unread_count: number;
  customer_name: string | null;
  customer_email: string | null;
  organization_name: string | null;
};

type Msg = {
  id: string;
  sender_type: string;
  content: string;
  message_type: string;
  created_at: string;
};

const FILTERS = [
  { id: "all", label: "Todas" },
  { id: "open", label: "Abertas" },
  { id: "in_progress", label: "Em atendimento" },
  { id: "waiting_customer", label: "Aguardando cliente" },
  { id: "resolved", label: "Resolvidas" },
] as const;

function statusLabel(s: string) {
  switch (s) {
    case "open":
      return "Aberta";
    case "in_progress":
      return "Em atendimento";
    case "waiting_customer":
      return "Aguardando cliente";
    case "resolved":
      return "Resolvida";
    default:
      return s;
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AdminSupportPanel() {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<ConvRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    conversation: ConvRow & { assigned_admin_id?: string | null };
    messages: Msg[];
    customer: { id: string; email: string | null; name: string | null };
    organization: { id: string; name: string; status: string } | null;
    contexts: Array<{ payment_id: string | null; metadata: Record<string, unknown> }>;
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (filter !== "all") qs.set("status", filter);
      if (search.trim()) qs.set("search", search.trim());
      const res = await adminFetch<{ data: ConvRow[] }>(`/support/conversations?${qs.toString()}`);
      setList(res.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao listar atendimentos.");
    } finally {
      setLoadingList(false);
    }
  }, [filter, search]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // Realtime lista
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-support-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_conversations" },
        () => {
          setBanner("Nova atualizacao de atendimento");
          void loadList();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        () => {
          setBanner("Nova mensagem");
          void loadList();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadList]);

  async function openConversation(id: string) {
    setSelectedId(id);
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: NonNullable<typeof detail> }>(`/support/conversations/${id}`);
      setDetail(res.data);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao abrir atendimento.");
    } finally {
      setLoadingDetail(false);
    }
  }

  // Realtime mensagens da conversa selecionada
  useEffect(() => {
    if (!selectedId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-support-${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        (payload) => {
          const row = payload.new as Msg;
          setDetail((prev) =>
            prev && prev.conversation.id === selectedId
              ? {
                  ...prev,
                  messages: prev.messages.some((m) => m.id === row.id)
                    ? prev.messages
                    : [...prev.messages, row],
                }
              : prev
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  async function sendReply() {
    if (!selectedId || !input.trim()) return;
    setSending(true);
    try {
      await adminFetch(`/support/conversations/${selectedId}/messages`, {
        method: "POST",
        body: { content: input.trim() },
      });
      setInput("");
      await openConversation(selectedId);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar.");
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(status: string, assignSelf?: boolean) {
    if (!selectedId) return;
    try {
      await adminFetch(`/support/conversations/${selectedId}/status`, {
        method: "POST",
        body: { status, assign_self: assignSelf },
      });
      await openConversation(selectedId);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar status.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Suporte</h1>
          <p className="text-sm text-flux-muted mt-0.5">Atendimentos dos clientes FluxPay</p>
        </div>
        {banner && (
          <button
            type="button"
            onClick={() => {
              setBanner(null);
              void loadList();
            }}
            className="text-xs px-3 py-1.5 rounded-full bg-flux-red/15 text-flux-red-light border border-flux-red/30"
          >
            {banner}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[70vh]">
        {/* Lista */}
        <aside className="lg:col-span-4 card !p-0 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-flux-border space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-flux-muted" />
              <input
                className="input pl-9 text-sm"
                placeholder="Nome, e-mail, ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadList()}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                    filter === f.id
                      ? "bg-flux-red text-white"
                      : "bg-flux-gray text-flux-muted hover:text-white"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingList && (
              <div className="flex justify-center py-10 text-flux-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
            {!loadingList && list.length === 0 && (
              <p className="text-sm text-flux-muted text-center py-10 px-4">Nenhum atendimento.</p>
            )}
            {list.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void openConversation(c.id)}
                className={cn(
                  "w-full text-left px-3 py-3 border-b border-flux-border/60 hover:bg-flux-gray/50 transition-colors",
                  selectedId === c.id && "bg-flux-gray-light/40"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {c.customer_name || c.customer_email || c.user_id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-flux-muted truncate">{c.customer_email}</div>
                  </div>
                  <div className="text-[10px] text-flux-muted shrink-0">{formatTime(c.last_message_at)}</div>
                </div>
                <div className="text-xs text-flux-muted mt-1 truncate">{c.subject}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="badge-pending text-[10px]">{statusLabel(c.status)}</span>
                  {c.agent_unread_count > 0 && (
                    <span className="badge bg-flux-red/20 text-flux-red-light text-[10px]">
                      {c.agent_unread_count} nova{c.agent_unread_count > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {c.last_message_preview && (
                  <p className="text-xs text-flux-muted/80 mt-1 line-clamp-1">{c.last_message_preview}</p>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* Conversa */}
        <section className="lg:col-span-5 card !p-0 flex flex-col overflow-hidden min-h-[420px]">
          {!selectedId && (
            <div className="flex-1 flex items-center justify-center text-sm text-flux-muted px-6 text-center">
              Selecione um atendimento na lista.
            </div>
          )}
          {selectedId && loadingDetail && (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-flux-muted" />
            </div>
          )}
          {selectedId && detail && !loadingDetail && (
            <>
              <div className="px-4 py-3 border-b border-flux-border flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium">{detail.conversation.subject}</span>
                <span className="badge-pending text-[10px]">
                  {statusLabel(detail.conversation.status)}
                </span>
                <div className="ml-auto flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="btn-ghost text-xs min-h-0 py-1.5 px-2"
                    onClick={() => void changeStatus("in_progress", true)}
                  >
                    Assumir
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs min-h-0 py-1.5 px-2"
                    onClick={() => void changeStatus("waiting_customer")}
                  >
                    Aguardando cliente
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs min-h-0 py-1.5 px-2"
                    onClick={() => void changeStatus("resolved")}
                  >
                    Encerrar
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs min-h-0 py-1.5 px-2"
                    onClick={() => void changeStatus("open")}
                  >
                    Reabrir
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                {detail.messages.map((m) => {
                  const isAgent = m.sender_type === "agent";
                  const isCustomer = m.sender_type === "customer";
                  const isSystem = m.sender_type === "system" || m.sender_type === "assistant";
                  if (isSystem) {
                    return (
                      <p key={m.id} className="text-xs text-flux-muted text-center py-1">
                        {m.content}
                      </p>
                    );
                  }
                  return (
                    <div
                      key={m.id}
                      className={cn("flex", isAgent ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                          isAgent
                            ? "bg-flux-red text-white rounded-br-md"
                            : isCustomer
                              ? "bg-flux-gray-light border border-flux-border rounded-bl-md"
                              : "bg-flux-gray text-flux-muted"
                        )}
                      >
                        {m.content}
                        <div className="text-[10px] opacity-60 mt-1">{formatTime(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-flux-border p-3">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendReply();
                  }}
                >
                  <input
                    className="input flex-1 text-sm"
                    placeholder="Digite sua mensagem..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={detail.conversation.status === "resolved"}
                  />
                  <button type="submit" className="btn-primary px-3" disabled={sending || !input.trim()}>
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>
              </div>
            </>
          )}
        </section>

        {/* Cliente */}
        <aside className="lg:col-span-3 card space-y-4">
          <h2 className="text-sm font-semibold">Cliente</h2>
          {!detail && <p className="text-sm text-flux-muted">Selecione um atendimento.</p>}
          {detail && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-flux-muted text-xs">Nome</dt>
                <dd className="font-medium">{detail.customer.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-flux-muted text-xs">E-mail</dt>
                <dd className="break-all">{detail.customer.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-flux-muted text-xs">ID da conta</dt>
                <dd className="font-mono text-xs break-all">{detail.customer.id}</dd>
              </div>
              {detail.organization && (
                <div>
                  <dt className="text-flux-muted text-xs">Empresa</dt>
                  <dd>
                    {detail.organization.name}
                    <span className="text-xs text-flux-muted block font-mono">{detail.organization.id}</span>
                  </dd>
                </div>
              )}
              {detail.contexts?.length > 0 && (
                <div>
                  <dt className="text-flux-muted text-xs mb-1">Contexto</dt>
                  {detail.contexts.map((ctx, i) => (
                    <div key={i} className="rounded-lg border border-flux-border p-2 text-xs space-y-1">
                      {ctx.payment_id && (
                        <div>
                          Transacao: <span className="font-mono">{ctx.payment_id}</span>
                        </div>
                      )}
                      {ctx.metadata?.amount != null && (
                        <div>
                          Valor:{" "}
                          {(Number(ctx.metadata.amount) / 100).toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </div>
                      )}
                      {ctx.metadata?.status != null && <div>Status: {String(ctx.metadata.status)}</div>}
                    </div>
                  ))}
                </div>
              )}
            </dl>
          )}
          {error && (
            <div className="text-xs text-red-300 border border-red-500/30 bg-red-500/10 rounded-lg p-2">
              {error}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
