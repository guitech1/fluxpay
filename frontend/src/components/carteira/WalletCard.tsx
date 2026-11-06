import { cn } from "@/lib/utils";

export interface WalletCardProps {
  fullName: string;
  cardNumber: string | null;
  /** Quando true, mostra apenas os 4 últimos dígitos. */
  masked?: boolean;
  expiry?: string | null;
  status: "approved" | "blocked" | "pending_review" | "rejected";
  className?: string;
}

const STATUS_LABEL = {
  approved: "Ativo",
  blocked: "Bloqueado",
  pending_review: "Em análise",
  rejected: "Recusado",
} as const;

export function WalletCard({
  fullName,
  cardNumber,
  masked = true,
  expiry,
  status,
  className,
}: WalletCardProps) {
  const digits = cardNumber ? cardNumber.replace(/\D/g, "") : "";
  const last4 = digits.slice(-4);
  const shown = !digits
    ? "•••• •••• •••• ••••"
    : masked
      ? `•••• •••• •••• ${last4}`
      : digits.replace(/(\d{4})(?=\d)/g, "$1 ");

  return (
    <div className={cn("fxb-cardwrap fxb-rise", className)}>
      <div className="fxb-cardwrap-layer fxb-cardwrap-layer--b" aria-hidden />
      <div className="fxb-cardwrap-layer fxb-cardwrap-layer--a" aria-hidden />

      <div className="fxb-card3d" data-status={status}>
        <div className="fxb-card3d-top">
          <span className="fxb-card3d-brand">
            <FluxMark />
            FluxPay
          </span>
          <span className="fxb-card3d-status">{STATUS_LABEL[status]}</span>
        </div>

        <div className="fxb-card3d-mid">
          <p className="fxb-card3d-name">{fullName || "—"}</p>
          <p className="fxb-card3d-kind">
            <Contactless />
            Pré-pago
          </p>
        </div>

        <div className="fxb-card3d-bottom">
          <div className="fxb-card3d-valid">
            <span>Validade</span>
            <strong>{expiry || "••/••"}</strong>
          </div>
          <p className="fxb-card3d-number">{shown}</p>
        </div>

        <span className="fxb-card3d-mark" aria-hidden>
          Flux
        </span>
      </div>
    </div>
  );
}

function FluxMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="16" fill="#FC0019" />
      <path
        d="M8 10h12.5c3 0 5 1.8 5 4.4 0 2.5-1.9 4.2-4.7 4.2H13.5V22H8V10zm5.5 5.4h5.2c1.1 0 1.8-.6 1.8-1.5s-.7-1.5-1.8-1.5h-5.2v3z"
        fill="white"
      />
    </svg>
  );
}

function Contactless() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.5 8.5c2.5 2.5 2.5 6.5 0 9M12 6c4 4 4 10 0 14M15.5 3.5c5.5 5.5 5.5 14.5 0 20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
