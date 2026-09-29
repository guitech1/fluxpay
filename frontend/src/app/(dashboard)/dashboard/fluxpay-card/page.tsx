import { FluxPayCardClient } from "@/components/fluxpay-card/FluxPayCardClient";

export const dynamic = "force-dynamic";

export default function FluxPayCardPage() {
  return (
    <div className="py-2">
      <FluxPayCardClient />
    </div>
  );
}
