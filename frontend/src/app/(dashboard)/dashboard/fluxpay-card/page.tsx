import Link from "next/link";
import { CreditCard } from "lucide-react";
import { PageHeader } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "FluxPay Card · Em breve" };

/** FluxPay Card — em breve; não carrega o client de emissão/gestão. */
export default function FluxPayCardPage() {
  return (
    <div className="space-y-6 max-w-lg">
      <PageHeader title="FluxPay Card" description="Em breve" />

      <div className="card text-center py-12 px-6 space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-500/15 text-red-300 flex items-center justify-center">
          <CreditCard className="w-6 h-6" />
        </div>
        <p className="inline-flex text-[0.7rem] font-extrabold tracking-[0.12em] uppercase text-red-300 bg-red-500/10 border border-red-500/30 rounded-full px-3 py-1">
          Em breve
        </p>
        <h2 className="text-xl font-semibold">Cartão ainda não liberado</h2>
        <p className="text-sm text-flux-muted max-w-sm mx-auto">
          O FluxPay Card está em preparação. As ações de solicitar, visualizar dados e recarregar
          estão desativadas até a abertura oficial.
        </p>
        <Link href="/dashboard/carteira" className="btn-secondary inline-flex text-sm">
          Ir para a Carteira Digital
        </Link>
      </div>
    </div>
  );
}
