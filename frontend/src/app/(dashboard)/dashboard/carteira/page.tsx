import Link from "next/link";
import {
  Wallet,
  Send,
  QrCode,
  CreditCard,
  Vault,
  FileText,
  Settings2,
  ArrowLeftRight,
} from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

const shortcuts = [
  {
    href: "/dashboard/carteira/pix",
    label: "Pix",
    description: "Transferir, copia e cola e QR Code",
    icon: Send,
  },
  {
    href: "/dashboard/carteira/cartao",
    label: "Cartão virtual",
    description: "Cartão pré-pago Nexus",
    icon: CreditCard,
  },
  {
    href: "/dashboard/fluxpay-card",
    label: "FluxPay Card",
    description: "Carteira interna e transferências",
    icon: Wallet,
  },
  {
    href: "/dashboard/wallet",
    label: "Extrato e saques",
    description: "Saldo, movimentações e saque Pix",
    icon: ArrowLeftRight,
  },
  {
    href: "/dashboard/carteira/comprovantes",
    label: "Comprovantes",
    description: "Pagamentos e saques confirmados",
    icon: FileText,
  },
  {
    href: "/dashboard/carteira/config",
    label: "Configurações",
    description: "Tema, PIN Pix e conta digital",
    icon: Settings2,
  },
];

export default async function CarteiraDigitalPage() {
  const { supabase, organization, environment } = await requireDashboardContext();

  const { data: balance } = await supabase.rpc("get_organization_balance", {
    p_organization_id: organization.id,
    p_environment: environment,
  });

  const balances = (balance || []) as { currency: string; available: number; pending: number }[];
  const primary = balances[0];
  const currency = primary?.currency || organization.default_currency || "BRL";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Carteira Digital"
        description="Saldo real, Pix, cartão e configurações da conta FluxPay"
      />

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-red-600/20 via-black to-black p-6 sm:p-8">
        <p className="text-sm text-white/60 mb-2">Saldo disponível</p>
        <p className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
          {formatCurrency(primary?.available ?? 0, currency)}
        </p>
        <p className="text-sm text-white/50 mt-2">
          A liberar: {formatCurrency(primary?.pending ?? 0, currency)}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-2xl border border-white/10 bg-flux-gray/40 p-4 sm:p-5 hover:border-red-500/40 hover:bg-flux-gray/60 transition-colors"
            >
              <div className="w-11 h-11 rounded-full bg-red-500/15 flex items-center justify-center mb-3 group-hover:bg-red-500/25 transition-colors">
                <Icon className="w-5 h-5 text-red-400" />
              </div>
              <div className="font-medium text-sm sm:text-base">{item.label}</div>
              <div className="text-xs text-flux-muted mt-1 leading-snug">{item.description}</div>
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-flux-muted">
        Todos os valores refletem o ledger real da organização no ambiente {" "}
        <span className="font-mono">{environment}</span>. Nenhum saldo fictício é exibido.
      </p>
    </div>
  );
}
