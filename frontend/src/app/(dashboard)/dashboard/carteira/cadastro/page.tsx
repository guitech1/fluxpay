"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isValidCpf, formatCpf, onlyDigits } from "@/lib/cpf";
import { dashboardFetch } from "@/lib/dashboard-api";

type Step = 1 | 2;

type WalletKycState = "none" | "needs_kyc" | "in_review" | "approved";

function isAdult(birthDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const d = new Date(birthDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  if (d.getTime() > now.getTime()) return false;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 18 && age <= 120;
}

export default function CadastroContaDigitalPage() {
  const router = useRouter();
  const [kycState, setKycState] = useState<WalletKycState | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [cpf, setCpf] = useState("");
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nameFromApi, setNameFromApi] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [accessPin, setAccessPin] = useState("");
  const [accessPin2, setAccessPin2] = useState("");
  const [pixPin, setPixPin] = useState("");
  const [pixPin2, setPixPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Descobre se é reenvio (needs_kyc) ou conta nova; redireciona se já em análise/aprovado
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await dashboardFetch<{ data: { kyc_status?: string; kyc_submitted_at?: string | null } | null }>(
          "/fluxpay-card"
        );
        if (cancelled) return;
        const card = res.data;
        if (!card) {
          setKycState("none");
          return;
        }
        const kyc = card.kyc_status ?? "pending";
        if (kyc === "approved") {
          setKycState("approved");
          router.replace("/dashboard/carteira");
          return;
        }
        if (kyc === "pending" && card.kyc_submitted_at) {
          setKycState("in_review");
          router.replace("/dashboard/carteira");
          return;
        }
        // rejected ou pending sem submitted → needs_kyc
        setKycState("needs_kyc");
      } catch {
        if (!cancelled) setKycState("none");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onCpfBlur() {
    const d = onlyDigits(cpf);
    if (!isValidCpf(d)) return;
    setLookupMsg(null);
    setNameFromApi(false);
    try {
      const res = await dashboardFetch<{
        data: {
          configured: boolean;
          found: boolean;
          name: string | null;
          birth_date: string | null;
          requires_manual_name: boolean;
        };
      }>("/cpf/lookup", { method: "POST", body: { cpf: d } });
      if (res.data.found && res.data.name) {
        setFullName(res.data.name);
        setNameFromApi(true);
        setLookupMsg("Nome obtido pela consulta cadastral.");
        if (res.data.birth_date) setBirthDate(res.data.birth_date.slice(0, 10));
      } else if (!res.data.configured) {
        setLookupMsg("Consulta de CPF não configurada. Informe o nome manualmente.");
      } else {
        setLookupMsg("CPF não encontrado na consulta. Informe o nome manualmente.");
      }
    } catch {
      setLookupMsg("Consulta indisponível. Informe o nome manualmente.");
    }
  }

  function nextFromStep1(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidCpf(cpf)) {
      setError("CPF inválido.");
      return;
    }
    if (fullName.trim().split(/\s+/).length < 2) {
      setError("Informe nome e sobrenome.");
      return;
    }
    if (!birthDate) {
      setError("Informe a data de nascimento.");
      return;
    }
    if (!isAdult(birthDate)) {
      setError("É necessário ter 18 anos ou mais. Data não pode ser futura.");
      return;
    }
    if (onlyDigits(phone).length < 10) {
      setError("Celular inválido.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("E-mail inválido.");
      return;
    }
    setStep(2);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (accessPin.length < 8 || accessPin !== accessPin2) {
      setError("PIN de acesso: mínimo 8 caracteres e confirmação igual.");
      return;
    }
    if (!/^\d{4,8}$/.test(pixPin) || pixPin !== pixPin2) {
      setError("PIN Pix: 4 a 8 dígitos e confirmação igual.");
      return;
    }
    setBusy(true);
    try {
      await dashboardFetch("/fluxpay-card/create", {
        method: "POST",
        body: {
          full_name: fullName.trim(),
          phone: onlyDigits(phone),
          password: accessPin,
          password_confirmation: accessPin2,
          cpf: onlyDigits(cpf),
          email: email.trim().toLowerCase(),
          birth_date: birthDate,
        },
      });
      await dashboardFetch("/digital-account/pix-pin", {
        method: "POST",
        body: { pix_pin: pixPin, pix_pin_confirmation: pixPin2 },
      });
      router.push("/dashboard/carteira");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no cadastro.");
    } finally {
      setBusy(false);
    }
  }

  if (kycState === null || kycState === "in_review" || kycState === "approved") {
    return (
      <div className="max-w-md mx-auto py-12 text-center text-sm text-flux-muted">
        Carregando…
      </div>
    );
  }

  const isCompleteExisting = kycState === "needs_kyc";
  const title = isCompleteExisting ? "Complete seu cadastro" : "Abrir conta digital";

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/carteira"
          className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-flux-muted">Etapa {step} de 2</p>
        </div>
      </div>

      {isCompleteExisting && (
        <p className="text-sm text-flux-muted rounded-lg border border-white/10 px-3 py-2">
          Sua conta continua com o mesmo número e saldo. Complete os dados para liberar Pix,
          transferências e cartão após a aprovação da equipe.
        </p>
      )}

      {step === 1 && (
        <form onSubmit={nextFromStep1} className="space-y-4 card">
          <label className="block text-sm">
            <span className="text-flux-muted">CPF</span>
            <input
              className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5"
              value={formatCpf(cpf)}
              onChange={(e) => setCpf(onlyDigits(e.target.value).slice(0, 11))}
              onBlur={onCpfBlur}
              inputMode="numeric"
            />
          </label>
          {lookupMsg && <p className="text-xs text-flux-muted">{lookupMsg}</p>}
          <label className="block text-sm">
            <span className="text-flux-muted">Nome completo</span>
            <input
              className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setNameFromApi(false);
              }}
              readOnly={nameFromApi}
            />
          </label>
          <label className="block text-sm">
            <span className="text-flux-muted">Data de nascimento</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-flux-muted">Celular</span>
            <input
              className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
            />
          </label>
          <label className="block text-sm">
            <span className="text-flux-muted">E-mail</span>
            <input
              type="email"
              className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button type="submit" className="btn-primary w-full py-3">
            Continuar
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submit} className="space-y-4 card">
          <p className="text-sm text-flux-muted">
            PIN de acesso (senha da carteira, mín. 8 caracteres com letras e números) e PIN Pix
            (somente números, 4–8 dígitos).
          </p>
          <label className="block text-sm">
            <span className="text-flux-muted">PIN de acesso</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5"
              value={accessPin}
              onChange={(e) => setAccessPin(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="block text-sm">
            <span className="text-flux-muted">Confirmar PIN de acesso</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5"
              value={accessPin2}
              onChange={(e) => setAccessPin2(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="block text-sm">
            <span className="text-flux-muted">PIN Pix</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5"
              value={pixPin}
              onChange={(e) => setPixPin(e.target.value.replace(/\D/g, ""))}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="text-flux-muted">Confirmar PIN Pix</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5"
              value={pixPin2}
              onChange={(e) => setPixPin2(e.target.value.replace(/\D/g, ""))}
              autoComplete="off"
            />
          </label>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setStep(1)}>
              Voltar
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={busy}>
              {busy ? "Enviando…" : "Enviar para análise"}
            </button>
          </div>
          <p className="text-xs text-flux-muted">
            Após o envio a conta fica em análise. Operações financeiras liberam só após aprovação.
          </p>
        </form>
      )}
    </div>
  );
}
