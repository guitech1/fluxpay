import Link from "next/link";
import { CreditCard, ArrowLeft } from "lucide-react";
import { ScreenHeader } from "@/components/carteira/ScreenHeader";

export const dynamic = "force-dynamic";

export const metadata = { title: "Cartão · Em breve" };

/** Cartão virtual — ainda não liberado. Acesso às ações bloqueado. */
export default function CarteiraCartaoPage() {
  return (
    <div className="fxb-narrow" style={{ maxWidth: 560 }}>
      <ScreenHeader
        title="Cartão"
        description="Em breve"
        icon={
          <span className="fxb-round fxb-round--lg">
            <CreditCard size={22} />
          </span>
        }
      />

      <div
        className="fxb-panel"
        style={{
          textAlign: "center",
          padding: "2.5rem 1.5rem",
          border: "1px solid rgba(239, 68, 68, 0.25)",
        }}
      >
        <p
          style={{
            display: "inline-block",
            fontSize: "0.7rem",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#fca5a5",
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            borderRadius: 999,
            padding: "0.35rem 0.85rem",
            marginBottom: "1.25rem",
          }}
        >
          Em breve
        </p>
        <h2 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: 8 }}>Cartão FluxPay</h2>
        <p style={{ color: "var(--fx-muted)", maxWidth: 360, margin: "0 auto 1.5rem" }}>
          Esta área ainda não está disponível. Quando liberarmos, você solicita e gerencia o cartão
          por aqui — por enquanto o acesso às funções está bloqueado.
        </p>
        <Link href="/dashboard/carteira" className="btn btn-secondary" style={{ display: "inline-flex", gap: 8 }}>
          <ArrowLeft size={16} />
          Voltar à carteira
        </Link>
      </div>
    </div>
  );
}
