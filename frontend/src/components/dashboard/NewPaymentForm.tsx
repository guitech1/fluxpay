"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QrCode } from "lucide-react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { friendlyError } from "@/lib/labels";
import { formatCurrency } from "@/lib/utils";
import { Alert, SubmitButton } from "@/components/dashboard/ui-client";
import type { Customer, Environment } from "@/lib/types";

/**
 * Criação de cobrança PIX pelo painel.
 *
 * Passa por POST /dashboard-api/payments, que usa o MESMO caminho de código da
 * API pública (services/payments.createPayment -> provider). Ou seja: em
 * produção a cobrança é criada de verdade na NexusPag; em teste, no provider
 * sandbox. Não existe um "modo painel" que invente cobrança.
 *
 * Os campos são os que a API de PIX da NexusPag realmente aceita
 * (valor, descrição, external_id e expiração — docs/nexuspag-api.md), mais o
 * vínculo opcional com um cliente cadastrado no FluxPay.
 */

const EXPIRY_OPTIONS = [
  { minutes: 30, label: "30 minutos" },
  { minutes: 60, label: "1 hora" },
  { minutes: 1440, label: "24 horas" },
  { minutes: 4320, label: "3 dias" },
];

/** "1.234,56" / "1234,56" / "1234.56" -> centavos. */
function parseAmountToCents(value: string): number | null {
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return null;

  // Formato brasileiro: ponto é milhar, vírgula é decimal.
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.round(parsed * 100);
}

export function NewPaymentForm({
  customers,
  environment,
}: {
  customers: Customer[];
  environment: Environment;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [expiry, setExpiry] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = useMemo(() => parseAmountToCents(amount), [amount]);
  const amountValid = cents !== null && cents >= 100;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!amountValid) {
      setError("Informe um valor de pelo menos R$ 1,00.");
      return;
    }

    setLoading(true);
    try {
      const response = await dashboardFetch<{ data: { id: string } }>("/payments", {
        method: "POST",
        body: {
          amount: cents,
          description: description.trim() || undefined,
          reference: reference.trim() || undefined,
          customer_id: customerId || undefined,
          expires_in_minutes: expiry,
        },
      });

      router.push(`/dashboard/payments/${response.data.id}`);
      router.refresh();
    } catch (err) {
      setError(friendlyError(err, "Não foi possível gerar a cobrança. Tente novamente."));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-2 space-y-6">
        <div className="card space-y-5">
          <div>
            <label htmlFor="amount" className="label">
              Valor
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-flux-muted text-sm pointer-events-none">
                R$
              </span>
              <input
                id="amount"
                className="input pl-10 text-lg"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                autoFocus
                aria-describedby="amount-help"
              />
            </div>
            <p id="amount-help" className="text-xs text-flux-muted mt-1.5">
              {cents && cents >= 100
                ? `Você vai cobrar ${formatCurrency(cents)}.`
                : "Valor mínimo de R$ 1,00."}
            </p>
          </div>

          <div>
            <label htmlFor="description" className="label">
              Descrição <span className="text-flux-muted font-normal">(opcional)</span>
            </label>
            <input
              id="description"
              className="input"
              value={description}
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Pedido 1234"
              aria-describedby="description-help"
            />
            <p id="description-help" className="text-xs text-flux-muted mt-1.5">
              Aparece para o pagador no aplicativo do banco.
            </p>
          </div>

          <div>
            <label htmlFor="reference" className="label">
              Sua referência <span className="text-flux-muted font-normal">(opcional)</span>
            </label>
            <input
              id="reference"
              className="input font-mono text-sm"
              value={reference}
              maxLength={120}
              onChange={(e) => setReference(e.target.value)}
              placeholder="pedido-1234"
              aria-describedby="reference-help"
            />
            <p id="reference-help" className="text-xs text-flux-muted mt-1.5">
              Identificador do seu sistema. Também serve de proteção contra cobrança
              duplicada: reenviar a mesma referência devolve a cobrança que já existe.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="customer" className="label">
                Cliente <span className="text-flux-muted font-normal">(opcional)</span>
              </label>
              <select
                id="customer"
                className="input"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Não vincular</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.email || c.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              {customers.length === 0 && (
                <p className="text-xs text-flux-muted mt-1.5">
                  Nenhum cliente cadastrado neste ambiente.{" "}
                  <Link href="/dashboard/customers" className="text-flux-red hover:underline">
                    Cadastrar
                  </Link>
                </p>
              )}
            </div>

            <div>
              <label htmlFor="expiry" className="label">
                Validade
              </label>
              <select
                id="expiry"
                className="input"
                value={expiry}
                onChange={(e) => setExpiry(Number(e.target.value))}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.minutes} value={o.minutes}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-flux-muted mt-1.5">
                Depois desse prazo a cobrança expira sozinha.
              </p>
            </div>
          </div>

          {error && <Alert>{error}</Alert>}

          <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-1">
            <Link href="/dashboard/payments" className="btn-secondary sm:w-auto justify-center">
              Cancelar
            </Link>
            <SubmitButton type="submit" loading={loading} disabled={!amountValid}>
              <QrCode className="w-4 h-4" />
              Gerar cobrança PIX
            </SubmitButton>
          </div>
        </div>
      </div>

      <aside className="card space-y-4 lg:sticky lg:top-24">
        <h2 className="font-medium text-sm">Resumo</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-flux-muted">Valor</dt>
            <dd className="font-medium">{cents ? formatCurrency(cents) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-flux-muted">Método</dt>
            <dd>PIX</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-flux-muted">Validade</dt>
            <dd>{EXPIRY_OPTIONS.find((o) => o.minutes === expiry)?.label}</dd>
          </div>
        </dl>
        <p className="text-xs text-flux-muted leading-relaxed border-t border-flux-border pt-4">
          {environment === "live"
            ? "Esta cobrança é real: o valor cai na sua conta assim que o pagador confirmar."
            : "No ambiente de teste a cobrança serve para validar seu fluxo. Nenhum valor é movimentado e o código gerado não funciona em aplicativo de banco."}
        </p>
      </aside>
    </form>
  );
}
