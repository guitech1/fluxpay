import Link from "next/link";
import { Send, ClipboardPaste, QrCode, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

const options = [
  {
    href: "/dashboard/wallet",
    label: "Transferir / Sacar para chave Pix",
    description:
      "Envie para CPF, CNPJ, e-mail, telefone ou chave aleatória. Usa o fluxo de saque real (NexusPag withdrawals).",
    icon: Send,
  },
  {
    href: "/dashboard/wallet",
    label: "Pix copia e cola",
    description:
      "Cole o código EMV. Validação de formato no cliente; execução via saque quando a chave for extraída com segurança.",
    icon: ClipboardPaste,
  },
  {
    href: "/dashboard/wallet",
    label: "Pagar QR Code",
    description:
      "Leitura de QR exige permissão de câmera no dispositivo. O pagamento real segue o mesmo provedor de saque.",
    icon: QrCode,
  },
];

export default function CarteiraPixPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/carteira"
          className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <PageHeader title="Área Pix" description="Operações de saída via chave Pix (provedor NexusPag)" />
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
        A API NexusPag documenta <strong>saques</strong> da carteira para chave Pix
        (<code className="text-xs">POST /api/withdrawals</code>). Não há endpoint público de
        "pagar cobrança de terceiro" (copia-e-cola/QR de merchant externo) separado do saque.
        Transferências usam o fluxo de saque já existente, com PIN Pix e aprovação conforme a conta.
      </div>

      <div className="grid gap-3">
        {options.map((opt) => {
          const Icon = opt.icon;
          return (
            <Link
              key={opt.label}
              href={opt.href}
              className="flex items-start gap-4 rounded-2xl border border-white/10 bg-flux-gray/40 p-5 hover:border-red-500/40 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <div className="font-medium">{opt.label}</div>
                <div className="text-sm text-flux-muted mt-1">{opt.description}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
