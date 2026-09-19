"use client";

import { useState } from "react";
import { Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authError as friendlyAuthError } from "@/lib/labels";

/** Conta do usuario logado: nome exibido e troca de senha (Supabase Auth). */
export function AccountSettings({ email, role }: { email: string | null; role: string }) {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"name" | "password" | null>(null);
  const [done, setDone] = useState<"name" | "password" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveName() {
    if (!fullName.trim()) return;
    setBusy("name");
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: dbError } = await supabase
      .from("users")
      .update({ full_name: fullName.trim() })
      .eq("id", user?.id ?? "");

    setBusy(null);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    setDone("name");
    setTimeout(() => setDone(null), 3000);
  }

  async function savePassword() {
    if (password.length < 8) {
      setError("A senha precisa ter ao menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setBusy("password");
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.updateUser({ password });
    setBusy(null);
    if (authError) {
      setError(friendlyAuthError(authError.message));
      return;
    }
    setPassword("");
    setConfirm("");
    setDone("password");
    setTimeout(() => setDone(null), 3000);
  }

  return (
    <div className="card space-y-6">
      <div>
        <h2 className="font-medium">Sua conta</h2>
        <p className="text-sm text-flux-muted mt-1">
          {email} · papel <span className="capitalize">{role}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Nome exibido</label>
          <div className="flex gap-2">
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Seu nome"
            />
            <button className="btn-secondary text-sm whitespace-nowrap" onClick={saveName} disabled={busy !== null}>
              {busy === "name" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </button>
          </div>
          {done === "name" && (
            <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1">
              <Check className="w-3 h-3" /> Nome atualizado
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-flux-border pt-6 space-y-4">
        <h3 className="text-sm font-medium">Trocar senha</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nova senha"
          />
          <input
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirme a nova senha"
          />
        </div>
        <button className="btn-primary text-sm flex items-center gap-2" onClick={savePassword} disabled={busy !== null}>
          {busy === "password" && <Loader2 className="w-4 h-4 animate-spin" />}
          Atualizar senha
        </button>
        {done === "password" && (
          <p className="text-xs text-emerald-400 flex items-center gap-1">
            <Check className="w-3 h-3" /> Senha atualizada
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
