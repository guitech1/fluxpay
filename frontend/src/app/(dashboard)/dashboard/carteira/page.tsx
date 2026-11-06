import Link from "next/link";
import {
  Send,
  CreditCard,
  FileText,
  Settings2,
  UserPlus,
} from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

const shortcuts = [
  {
    href: "/dashboard/carteira/cartao",
    label: "Cartao virtual",
    description: "Pre-pago da carteira",
    icon: CreditCard,
  },
  {
    href: "/dashboard/carteira/pix",
    label: "Pix",
    description: "Transferir por chave",
    icon: Send,
  },
  {
    href: "/dashboard/wallet",
    label: "Extrato",
    description: "Movimentacoes e saques",
    icon: FileText,
  },
  {
    href: "/dashboard/carteira/comprovantes",
    label: "Comprovantes",
    description: "Historico de transferencias",
    icon: FileText,
  },
  {
    href: "/dashboard/carteira/config",
    label: "Configuracoes",
    description: "PIN e preferencias",
    icon: Settings2,
  },
];

function walletStatusLabel(status: string | null | undefined): {
  title: string;
  description: string;
  tone: "neutral" | "pending" | "ok" | "bad";
} {
  if (!status) {
    return {
      title: "Carteira nao solicitada",
      description: "Abra sua conta digital para usar Pix e cartao virtual.",
      tone: "neutral",
    };
  }
  if (status === "pending_review") {
    return {
      title: "Sua carteira esta aguardando aprovacao",
      description:
        "Voce pode acompanhar o status aqui. As operacoes financeiras ficam disponiveis apos a aprovacao.",
      tone: "pending",
    };
  }
  if (status === "rejected") {
    return {
      title: "Sua carteira foi reprovada",
      description: "Entre em contato com o suporte para mais informacoes.",
      tone: "bad",
    };
  }
  if (status === "blocked") {
    return {
      title: "Sua carteira esta bloqueada",
      description: "Operacoes financeiras estao temporariamente indisponiveis.",
      tone: "bad",
    };
  }
  if (status === "approved") {
    return {
      title: "Sua carteira foi aprovada",
      description: "Voce ja pode usar Pix, cartao virtual e demais operacoes.",
      tone: "ok",
    };
  }
  return {
    title: "Carteira Digital",
    description: "Acompanhe o status da sua conta.",
    tone: "neutral",
  };
}

export default async function CarteiraDigitalPage() {
  const { supabase, organization, environment } = await requireDashboardContext();

  const { data: balance } = await supabase.rpc("get_organization_balance", {
    p_organization_id: organization.id,
    p_environment: environment,
  });

  const balances = (balance || []) as {
    currency: string;
    available: number;
    pending: number;
  }[];
  const primary = balances[0];
  const currency = primary?.currency || organization.default_currency || "BRL";

  let walletStatus: string | null = null;
  try {
    const { data: row } = await supabase
      .from("fluxpay_cards")
      .select("status")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    walletStatus = row?.status ?? null;
  } catch {
    walletStatus = null;
  }

  const statusInfo = walletStatusLabel(walletStatus);
  const hasNoWallet = !walletStatus;

  const toneClass =
    statusInfo.tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
      : statusInfo.tone === "pending"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
        : statusInfo.tone === "bad"
          ? "border-red-500/30 bg-red-500/10 text-red-100"
          : "border-white/10 bg-white/5 text-flux-muted";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Carteira Digital"
        description="Saldo, Pix, cartao virtual e configuracoes"
      />

      <div className={`rounded-xl border px-4 py-3 text-sm ${toneClass}`}>
        <p className="font-medium">{statusInfo.title}</p>
        <p className="mt-1 opacity-90">{statusInfo.description}</p>
        {hasNoWallet && (
          <Link
            href="/dashboard/carteira/cadastro"
            className="inline-flex mt-3 text-sm font-medium text-white underline-offset-2 hover:underline"
          >
            Solicitar carteira digital
          </Link>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-red-600/20 via-black to-black p-6 sm:p-8">
        <p className="text-sm text-white/60 mb-2">Saldo disponivel</p>
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
        {hasNoWallet && (
          <Link
            href="/dashboard/carteira/cadastro"
            className="group rounded-2xl border border-white/10 bg-flux-gray/40 p-4 sm:p-5 hover:border-red-500/40 hover:bg-flux-gray/60 transition-colors"
          >
            <div className="w-11 h-11 rounded-full bg-red-500/15 flex items-center justify-center mb-3 group-hover:bg-red-500/25 transition-colors">
              <UserPlus className="w-5 h-5 text-red-400" />
            </div>
            <div className="font-medium text-sm sm:text-base">Solicitar carteira</div>
            <div className="text-xs text-flux-muted mt-1 leading-snug">Cadastro digital</div>
          </Link>
        )}
      </div>
    </div>
  );
}
