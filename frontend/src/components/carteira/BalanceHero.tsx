"use client";

import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

function splitMoney(value: string): [string, string] {
  const i = value.lastIndexOf(",");
  return i > 0 ? [value.slice(0, i), value.slice(i)] : [value, ""];
}

export function BalanceHero({
  available,
  pending,
  total,
  children,
}: {
  available: string;
  pending: string;
  total: string;
  children?: ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const [main, cents] = splitMoney(available);
  const mask = "••••";

  return (
    <section className="fxb-hero fxb-rise" aria-label="Saldo">
      <div className="fxb-hero-top">
        <span className="fxb-hero-label">Saldo disponível</span>
        <button
          type="button"
          className="fxb-hero-eye"
          onClick={() => setHidden((h) => !h)}
          aria-label={hidden ? "Mostrar saldo" : "Ocultar saldo"}
          aria-pressed={hidden}
        >
          {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      <p className="fxb-amount" aria-live="polite">
        {hidden ? (
          "••••••"
        ) : (
          <>
            {main}
            <small>{cents}</small>
          </>
        )}
      </p>

      <div className="fxb-hero-chips">
        <span className="fxb-chip">A liberar {hidden ? mask : pending}</span>
        <span className="fxb-chip">Total {hidden ? mask : total}</span>
      </div>

      {children && <div className="fxb-hero-actions">{children}</div>}
    </section>
  );
}
