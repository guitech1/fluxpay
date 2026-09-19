"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus, Trash2 } from "lucide-react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { Table, Mono } from "./ui";
import type { Member, OrgRole } from "@/lib/types";

/**
 * Convite passa pelo backend (/dashboard-api/members/invite) porque usa a API
 * admin do Supabase Auth (inviteUserByEmail), que exige service_role.
 * Trocar papel e remover membro o painel faz direto: a policy
 * "Owners/admins can manage members" cobre isso, e o trigger da migration 004
 * impede remover o ultimo owner.
 *
 * Observacao: a RLS da tabela `users` so deixa cada um ver a si mesmo, entao a
 * lista mostra o e-mail apenas do proprio usuario; os demais aparecem pelo id.
 */
export function MembersManager({
  members,
  currentUserId,
  canAdmin,
}: {
  members: Member[];
  currentUserId: string;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<OrgRole, "owner">>("developer");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function invite() {
    if (!email.trim()) {
      setError("Informe o e-mail.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await dashboardFetch("/members/invite", {
        method: "POST",
        body: { email: email.trim(), role },
      });
      setNotice(`Convite enviado para ${email.trim()}.`);
      setEmail("");
      setInviting(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao convidar.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: Member, next: OrgRole) {
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("organization_members")
      .update({ role: next })
      .eq("id", member.id);
    if (dbError) {
      window.alert(`Não foi possível alterar o papel: ${dbError.message}`);
      return;
    }
    router.refresh();
  }

  async function remove(member: Member) {
    if (!window.confirm("Remover este membro da empresa?")) return;
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", member.id);
    if (dbError) {
      window.alert(`Não foi possível remover: ${dbError.message}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Equipe</h2>
        {canAdmin && (
          <button
            className="btn-primary text-sm flex items-center gap-2"
            onClick={() => {
              setError(null);
              setInviting(true);
            }}
          >
            <UserPlus className="w-4 h-4" />
            Convidar
          </button>
        )}
      </div>

      {notice && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm text-emerald-300">
          {notice}
        </div>
      )}

      <Table headers={["Usuário", "Papel", "Desde", ""]}>
        {members.map((m) => (
          <tr key={m.id} className="hover:bg-flux-gray/40">
            <td className="px-6 py-4">
              {m.user_id === currentUserId ? (
                <span>
                  Você <span className="text-flux-muted text-xs">({m.users?.email})</span>
                </span>
              ) : (
                <Mono>{m.user_id.slice(0, 8)}</Mono>
              )}
            </td>
            <td className="px-6 py-4">
              {canAdmin && m.role !== "owner" ? (
                <select
                  className="input w-auto text-xs py-1"
                  value={m.role}
                  onChange={(e) => changeRole(m, e.target.value as OrgRole)}
                >
                  <option value="admin">admin</option>
                  <option value="developer">developer</option>
                  <option value="viewer">viewer</option>
                </select>
              ) : (
                <span className="capitalize text-flux-muted">{m.role}</span>
              )}
            </td>
            <td className="px-6 py-4 text-flux-muted whitespace-nowrap">{formatDate(m.created_at)}</td>
            <td className="px-6 py-4 text-right">
              {canAdmin && m.role !== "owner" ? (
                <button className="text-flux-muted hover:text-red-400" onClick={() => remove(m)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : (
                <span className="text-flux-muted text-xs">—</span>
              )}
            </td>
          </tr>
        ))}
      </Table>

      {inviting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="card w-full max-w-md space-y-4">
            <h3 className="font-medium">Convidar para a equipe</h3>

            <div>
              <label className="block text-sm font-medium mb-1.5">E-mail</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Papel</label>
              <select
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as Exclude<OrgRole, "owner">)}
              >
                <option value="admin">admin — gerencia empresa e equipe</option>
                <option value="developer">developer — chaves, webhooks, cobranças</option>
                <option value="viewer">viewer — somente leitura</option>
              </select>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button className="btn-secondary text-sm" onClick={() => setInviting(false)} disabled={busy}>
                Cancelar
              </button>
              <button className="btn-primary text-sm flex items-center gap-2" onClick={invite} disabled={busy}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Enviar convite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
