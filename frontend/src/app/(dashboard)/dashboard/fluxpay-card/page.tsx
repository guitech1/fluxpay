import { FluxPayCardClient } from "@/components/fluxpay-card/FluxPayCardClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "FluxPay Card" };

/** Transferências entre contas FluxPay (fora da carteira digital). */
export default function FluxPayCardPage() {
  return (
    <div className="py-2">
      <FluxPayCardClient />
    </div>
  );
}
