"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Organization } from "@/lib/types";

/**
 * Dados cadastrais da empresa. Escrita direta pelo Supabase: a policy
 * "Owners can update their organizations" (migration 002) ja limita isso a
 * owner/admin, entao nao ha rota de backend envolvida.
 */
export function CompanyForm({
  organization,
  canEdit,
}: {
  organization: Organization;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: organization.name ?? "",
    legal_name: organization.legal_name ?? "",
    document: organization.document ?? "",
    email: organization.email ?? "",
    phone: organization.phone ?? "",
    website: organization.website ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);

    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("organizations")
      .update({
        name: form.name.trim(),
        legal_name: form.legal_name.trim() || null,
        document: form.document.trim() || null,
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
      })
      .eq("id", organization.id);

    setBusy(false);

    if (dbError) {
      setError(dbError.message);
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    router.refresh();
  }

  const fields = [
    ["name", "Nome da empresa"],
    ["legal_name", "Razão social"],
    ["document", "CNPJ"],
    ["email", "E-mail"],
    ["phone", "Telefone"],
    ["website", "Site"],
  ] as const;

  return (
    <div className="card space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map(([field, label]) => (
          <div key={field}>
            <label className="block text-sm font-medium mb-1.5">{label}</label>
            <input
              className="input disabled:opacity-60"
              value={form[field]}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
            />
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium mb-1.5">Identificador (slug)</label>
          <input className="input opacity-60 font-mono text-sm" value={organization.slug} disabled />
          <p className="text-xs text-flux-muted mt-1.5">O slug não pode ser alterado.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {canEdit ? (
        <div className="flex items-center gap-3">
          <button className="btn-primary text-sm flex items-center gap-2" onClick={save} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar alterações
          </button>
          {saved && (
            <span className="text-sm text-emerald-400 flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              Salvo
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-flux-muted">
          Somente o proprietário da conta e administradores podem alterar os dados da empresa.
        </p>
      )}
    </div>
  );
}
