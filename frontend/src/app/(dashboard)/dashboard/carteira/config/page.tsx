"use client";

import { useState } from "react";
import { Settings2, KeyRound } from "lucide-react";
import { ScreenHeader } from "@/components/carteira/ScreenHeader";

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
    <div className="fxb-narrow">
      <ScreenHeader
        title="Configurações"
        description="Aparência e segurança da sua carteira"
        icon={<span className="fxb-round fxb-round--lg"><Settings2 size={22} /></span>}
      />

      <div className="fxb-col">
        {msg && <div className="fxb-note fxb-note--ok" role="status">{msg}</div>}
        {err && <div className="fxb-note fxb-note--err" role="alert">{err}</div>}

        <section className="fxb-panel fxb-rise">
          <div className="fxb-section-head">
            <div>
              <h2>Aparência</h2>
              <p>Escolha como a carteira aparece para você</p>
            </div>
          </div>
          <div className="fxb-themes">
            <button
              type="button"
              disabled={busy}
              onClick={() => saveTheme("dark")}
              className="fxb-theme"
              data-active={theme === "dark"}
              aria-pressed={theme === "dark"}
            >
              <span className="fxb-theme-preview fxb-theme-preview--dark" />
              Preto
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => saveTheme("light")}
              className="fxb-theme"
              data-active={theme === "light"}
              aria-pressed={theme === "light"}
            >
              <span className="fxb-theme-preview fxb-theme-preview--light" />
              Branco
            </button>
          </div>
        </section>

        <section className="fxb-panel fxb-rise" style={{ "--i": 1 } as React.CSSProperties}>
          <div className="fxb-section-head">
            <div>
              <h2>PIN Pix</h2>
              <p>Usado para autorizar suas transferências. É diferente da senha de acesso.</p>
            </div>
            <span className="fxb-round"><KeyRound size={20} /></span>
          </div>
          <form onSubmit={savePixPin} className="fxb-form">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              placeholder="Novo PIN Pix (4 a 8 dígitos)"
              className="w-full"
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
              className="w-full"
              value={pixPin2}
              onChange={(e) => setPixPin2(e.target.value.replace(/\D/g, ""))}
              autoComplete="off"
            />
            <button type="submit" disabled={busy || pixPin.length < 4} className="btn btn-primary w-full">
              Salvar PIN Pix
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
