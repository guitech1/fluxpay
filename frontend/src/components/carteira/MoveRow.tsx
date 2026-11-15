import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowDownLeft, Receipt, SlidersHorizontal, Undo2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PixBadge } from "./PixMark";

export interface WalletMove {
  id: string;
  type: string;
  amount: number;
  net: number;
  fee: number | null;
  currency: string;
  description: string | null;
  payment_id: string | null;
  available_on: string | null;
  created_at: string;
  /** Nome de quem pagou o PIX (quando disponível) */
  payer_name?: string | null;
}

export const MOVE_LABELS: Record<string, string> = {
  charge: "Cobrança recebida",
  refund: "Reembolso",
  fee: "Taxa",
  payout: "Saque via Pix",
  adjustment: "Ajuste",
};

function MoveIcon({ type }: { type: string }) {
  if (type === "payout") return <PixBadge />;
  const Icon =
    type === "charge"
      ? ArrowDownLeft
      : type === "refund"
        ? Undo2
        : type === "fee"
          ? Receipt
          : SlidersHorizontal;
  return (
    <span className="fxb-round">
      <Icon size={20} />
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function MoveRow({
  move,
  detailed = false,
  index = 0,
}: {
  move: WalletMove;
  detailed?: boolean;
  index?: number;
}) {
  const negative = move.amount < 0;
  const released = !move.available_on || new Date(move.available_on) <= new Date();
  const style = { "--i": index } as CSSProperties;
  const payer = move.payer_name?.trim() || null;
  const title =
    move.type === "charge" && payer
      ? `Recebido de ${payer}`
      : MOVE_LABELS[move.type] || move.type;

  const body = (
    <>
      {payer && move.type === "charge" ? (
        <span
          className="fxb-round"
          style={{ fontSize: "0.75rem", fontWeight: 800, letterSpacing: "-0.02em" }}
          aria-hidden
        >
          {initials(payer)}
        </span>
      ) : (
        <MoveIcon type={move.type} />
      )}
      <div className="fxb-row-main">
        <p className="fxb-row-title">{title}</p>
        <p className="fxb-row-sub">
          {move.description ? `${move.description} · ` : ""}
          {formatDate(move.created_at)}
        </p>
        {detailed && (
          <p className="fxb-row-meta">
            {move.fee ? `Taxa ${formatCurrency(-Math.abs(move.fee), move.currency)} · ` : ""}
            {released ? "Liberado" : `Libera em ${formatDate(move.available_on as string)}`}
          </p>
        )}
      </div>
      <div className="fxb-row-end">
        <p className={`fxb-money ${negative ? "fxb-money--neg" : "fxb-money--pos"}`}>
          {negative ? "" : "+ "}
          {formatCurrency(move.amount, move.currency)}
        </p>
        {detailed && move.net !== move.amount && (
          <p className="fxb-row-sub">Líquido {formatCurrency(move.net, move.currency)}</p>
        )}
      </div>
    </>
  );

  if (move.payment_id) {
    return (
      <Link
        href={`/dashboard/payments/${move.payment_id}`}
        className="fxb-row fxb-row--link fxb-rise"
        style={style}
      >
        {body}
      </Link>
    );
  }
  return (
    <div className="fxb-row fxb-rise" style={style}>
      {body}
    </div>
  );
}
