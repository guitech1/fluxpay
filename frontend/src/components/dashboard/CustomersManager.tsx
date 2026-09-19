"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dashboardFetch } from "@/lib/dashboard-api";
import { Plus, Loader2, Trash2, Pencil, Users } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Table, Mono, EmptyState } from "./ui";
import type { Customer } from "@/lib/types";

/**
 * Clientes sao a unica entidade do dominio que o painel escreve direto pelo
 * Supabase: a RLS permite (policy "Members can manage customers" para
 * owner/admin/developer) e nao ha nenhum segredo a gerar do lado do servidor.
 * Pagamentos, reembolsos, chaves e endpoints continuam passando pelo backend.
 */
export function CustomersManager({
  customers,
  canWrite,
}: {
  customers: Customer[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", document: "", external_id: "" });

  function openNew() {
    setForm({ name: "", email: "", phone: "", document: "", external_id: "" });
    setError(null);
    setEditing("new");
  }

  function openEdit(c: Customer) {
    setForm({
      name: c.name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      document: c.document ?? "",
      external_id: c.external_id ?? "",
    });
    setError(null);
    setEditing(c);
  }

  async function save() {
    setBusy(true);
    setError(null);
    // Escrita via backend (/dashboard-api/customers), não direto pelo Supabase.
    // A RLS confere se a pessoa é da empresa, mas não sabe qual ambiente o
    // painel está mostrando: um id do outro ambiente era gravável só com o id.
    // Organização e ambiente passam a vir da sessão conferida no servidor.
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      document: form.document.trim(),
      external_id: form.external_id.trim(),
    };

    try {
      if (editing === "new") {
        await dashboardFetch("/customers", { method: "POST", body: payload });
      } else {
        await dashboardFetch(`/customers/${(editing as Customer).id}`, {
          method: "PATCH",
          body: payload,
        });
      }
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar o cliente.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(customer: Customer) {
    if (!window.confirm(`Remover ${customer.name || customer.email || "este cliente"}?`)) return;
    try {
      await dashboardFetch(`/customers/${customer.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Não foi possível remover.");
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <button className="btn-primary flex items-center gap-2 text-sm" onClick={openNew}>
            <Plus className="w-4 h-4" />
            Novo cliente
          </button>
        </div>
      )}

      {customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente cadastrado"
          description="Cadastre clientes para vincular cobranças a quem pagou e acompanhar o histórico de cada um."
        />
      ) : (
        <Table headers={["Nome", "E-mail", "Documento", "ID externo", "Criado em", ""]}>
          {customers.map((c) => (
            <tr key={c.id} className="hover:bg-flux-gray/40">
              <td className="px-6 py-4">{c.name || <span className="text-flux-muted">—</span>}</td>
              <td className="px-6 py-4 text-flux-muted">{c.email || "—"}</td>
              <td className="px-6 py-4 text-flux-muted">{c.document || "—"}</td>
              <td className="px-6 py-4">
                {c.external_id ? <Mono>{c.external_id}</Mono> : <span className="text-flux-muted">—</span>}
              </td>
              <td className="px-6 py-4 text-flux-muted whitespace-nowrap">{formatDate(c.created_at)}</td>
              <td className="px-6 py-4 text-right">
                {canWrite ? (
                  <div className="flex justify-end gap-3">
                    <button className="text-flux-muted hover:text-white" onClick={() => openEdit(c)}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button className="text-flux-muted hover:text-red-400" onClick={() => remove(c)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-flux-muted text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="card w-full max-w-md space-y-4">
            <h3 className="font-medium">{editing === "new" ? "Novo cliente" : "Editar cliente"}</h3>

            {(
              [
                ["name", "Nome"],
                ["email", "E-mail"],
                ["phone", "Telefone"],
                ["document", "CPF / CNPJ"],
                ["external_id", "ID externo (seu sistema)"],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label className="block text-sm font-medium mb-1.5">{label}</label>
                <input
                  className="input"
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                />
              </div>
            ))}

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button className="btn-secondary text-sm" onClick={() => setEditing(null)} disabled={busy}>
                Cancelar
              </button>
              <button className="btn-primary text-sm flex items-center gap-2" onClick={save} disabled={busy}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
