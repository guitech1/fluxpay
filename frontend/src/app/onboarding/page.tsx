"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Primeira tela de quem acabou de criar a conta e ainda nao tem empresa.
 * O middleware manda para ca quem nao tem nenhuma organizacao.
 *
 * Usa o RPC create_organization (migration 007), que cria a empresa E vincula
 * o usuario como owner na mesma transacao. Fazer isso com um insert direto
 * falharia com 42501: a RLS de organization_members exige que o usuario ja
 * seja membro para poder inserir — o RPC (SECURITY DEFINER) resolve esse
 * ovo-e-galinha.
 */

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [legalName, setLegalName] = useState("");
  const [document, setDocument] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const finalSlug = slugify(slug || name);
    if (!name.trim() || !finalSlug || !email.trim()) {
      setError("Preencha nome, identificador e e-mail da empresa.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { data, error: rpcError } = await supabase.rpc("create_organization", {
      p_name: name.trim(),
      p_slug: finalSlug,
      p_email: email.trim(),
      p_legal_name: legalName.trim() || null,
      p_document: document.trim() || null,
    });

    if (rpcError) {
      setLoading(false);
      setError(
        rpcError.message.includes("duplicate") || rpcError.message.includes("unique")
          ? "Esse identificador ja esta em uso. Escolha outro."
          : rpcError.message
      );
      return;
    }

    // O RPC devolve a linha da organizacao (ou o id direto, dependendo do
    // retorno) — aceitamos os dois formatos para nao depender do shape exato.
    const row = Array.isArray(data) ? data[0] : data;
    const orgId = typeof row === "string" ? row : row?.id;

    if (!orgId) {
      setLoading(false);
      setError("Empresa criada, mas nao foi possivel identifica-la. Recarregue a pagina.");
      return;
    }

    // O mesmo cookie que o middleware e o dashboard-context leem.
    document_setCookie("fluxpay_org_id", orgId);
    document_setCookie("fluxpay_env", "test");

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-flux-black px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-flux-red flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Crie sua empresa</h1>
            <p className="text-flux-muted text-sm">
              Toda cobranca, chave de API e webhook pertence a uma empresa.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">Nome da empresa</label>
            <input
              className="input"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Loja do Joao"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Identificador (slug)</label>
            <input
              className="input font-mono text-sm"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="loja-do-joao"
            />
            <p className="text-xs text-flux-muted mt-1.5">
              Unico na plataforma. Letras minusculas, numeros e hifens.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">E-mail da empresa</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="financeiro@empresa.com.br"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Razao social <span className="text-flux-muted font-normal">(opcional)</span>
              </label>
              <input
                className="input"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Joao Comercio LTDA"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                CNPJ <span className="text-flux-muted font-normal">(opcional)</span>
              </label>
              <input
                className="input"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                placeholder="00.000.000/0001-00"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Criando..." : "Criar empresa e continuar"}
          </button>

          <p className="text-xs text-flux-muted text-center">
            Você entra como <strong className="text-white/80">proprietário da conta</strong> e começa
            no ambiente de testes. Nenhuma cobrança real acontece até você ativar a produção.
          </p>
        </form>
      </div>
    </div>
  );
}

/** Helper isolado so para nao confundir com o estado `document` do formulario. */
function document_setCookie(name: string, value: string) {
  window.document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
