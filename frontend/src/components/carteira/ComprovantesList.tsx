"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PixReceipt, type PixReceiptData } from "./PixReceipt";

type Row = {
  id: string;
  net: number;
  fee: number;
  amount: number;
  currency: string;
  status: string;
  pix_key_type: string;
  created_at: string;
  provider_reference?: string | null;
  pix_key_masked?: string | null;
  e2e_id?: string | null;
};

interface Props {
  rows: Row[];
  payerName?: string | null;
  payerDocumentMasked?: string | null;
}

function splitProviderRef(ref?: string | null): { id: string | null; e2e: string | null } {
  if (!ref) return { id: null, e2e: null };
  if (ref.includes("|")) {
    const [a, b] = ref.split("|");
    return { id: a || null, e2e: b || null };
  }
  return { id: ref, e2e: null };
}

export function ComprovantesList({ rows, payerName, payerDocumentMasked }: Props) {
  const [selected, setSelected] = useState<PixReceiptData | null>(null);

  if (selected) {
    return <PixReceipt data={selected} onClose={() => setSelected(null)} />;
  }

  if (rows.length === 0) {
    return (
      <div className="fxb-empty">
        <span className="fxb-round fxb-round--lg">
          <FileText size={22} />
        </span>
        <h3>Nenhum comprovante ainda</h3>
        <p>
          Quando um Pix for confirmado pelo provedor, ele aparece aqui com status real. Pendentes
          não recebem status de concluído.
        </p>
      </div>
    );
  }

  return (
    <div className="fxb-list">
      {rows.map((w, i) => {
        const { id: provId, e2e } = splitProviderRef(w.provider_reference);
        return (
          <button
            key={w.id}
            type="button"
            className="fxb-row fxb-row--link fxb-rise"
            style={{ "--i": i + 1, width: "100%", textAlign: "left", cursor: "pointer" } as any}
            onClick={() =>
              setSelected({
                id: w.id,
                status: w.status,
                net: Number(w.net),
                fee: Number(w.fee || 0),
                amount: Number(w.amount || w.net + (w.fee || 0)),
                currency: w.currency || "BRL",
                created_at: w.created_at,
                pix_key_type: w.pix_key_type,
                pix_key_masked: w.pix_key_masked ?? null,
                provider_reference: provId,
                e2e_id: w.e2e_id || e2e,
                payer_name: payerName ?? null,
                payer_document_masked: payerDocumentMasked ?? null,
                receiver_name: null,
                receiver_document_masked: null,
                receiver_institution: null,
              })
            }
          >
            <span className="fxb-round">
              <FileText size={18} />
            </span>
            <div className="fxb-row-main">
              <p className="fxb-row-title">
                {formatCurrency(Number(w.net), w.currency || "BRL")}
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    color:
                      w.status === "completed"
                        ? "#3dd68c"
                        : w.status === "failed" || w.status === "rejected"
                          ? "#f31260"
                          : "#f5a524",
                  }}
                >
                  {w.status === "completed"
                    ? "Realizado"
                    : w.status === "processing"
                      ? "Processando"
                      : w.status}
                </span>
              </p>
              <p className="fxb-row-sub">
                {formatDate(w.created_at)} ·{" "}
                {w.pix_key_type === "qrc" ? "QR / Copia e cola" : "Chave"}
              </p>
            </div>
            <span className="fxb-row-sub" style={{ fontSize: 12 }}>
              Ver
            </span>
          </button>
        );
      })}
    </div>
  );
}
