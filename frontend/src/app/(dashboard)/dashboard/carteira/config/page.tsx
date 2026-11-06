"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function CarteiraConfigPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [pixPin, setPixPin] = useState("");
  const [pixPin2, setPixPin2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveTheme(next: "dark" | "light") {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/dashboard-api/digital-account/theme", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      setTheme(next);
      document.documentElement.classList.toggle("light", next === "light");
      setMsg("Tema salvo.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar tema");
    } finally {
      setBusy(false);
    }
  }

  async function savePixPin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/dashboard-api/digital-account/pix-pin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pix_pin: pixPin, pix_pin_confirmation: pixPin2 }),
      });
      if (res.status === 204) {
        setMsg("PIN Pix configurado.");
        setPixPin("");
        setPixPin2("");
        return;
      }
      const json = await res.json().catch(() => null);
      throw new Error(json?.error?.message || `HTTP ${res.status}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar PIN");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8 max-w-md">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/carteira"
          className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Configurações</h1>
          <p className="text-sm text-flux-muted">Tema e PIN Pix</p>
        </div>
      </div>

      {msg && <div className="text-sm text-emerald-300">{msg}</div>}
      {err && <div className="text-sm text-red-300">{err}</div>}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-flux-muted uppercase tracking-wide">Tema</h2>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => saveTheme("dark")}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm ${
              theme === "dark" ? "border-red-500 bg-red-500/10" : "border-white/10"
            }`}
          >
            Preto
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => saveTheme("light")}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm ${
              theme === "light" ? "border-red-500 bg-red-500/10" : "border-white/10"
            }`}
          >
            Branco
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-flux-muted uppercase tracking-wide">PIN Pix</h2>
        <p className="text-xs text-flux-muted">
          PIN numérico exclusivo para autorizar saques/transferências Pix. Diferente da senha de
          acesso da carteira. Armazenado apenas como hash.
        </p>
        <form onSubmit={savePixPin} className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            placeholder="Novo PIN Pix (4–8 dígitos)"
            className="input w-full"
            value={pixPin}
            onChange={(e) => setPixPin(e.target.value.replace(/\D/g, ""))}
            autoComplete="off"
          />
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            placeholder="Confirmar PIN Pix"
            className="input w-full"
            value={pixPin2}
            onChange={(e) => setPixPin2(e.target.value.replace(/\D/g, ""))}
            autoComplete="off"
          />
          <button type="submit" disabled={busy || pixPin.length < 4} className="btn-primary w-full">
            Salvar PIN Pix
          </button>
        </form>
      </section>
    </div>
  );
}
