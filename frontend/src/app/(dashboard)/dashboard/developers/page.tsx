import { requireDashboardContext } from "@/lib/dashboard-server";
import { PageHeader } from "@/components/dashboard/ui";
import Link from "next/link";
import { KeyRound, Webhook, FileText, Code2, BookOpen, FlaskConical } from "lucide-react";

export const dynamic = "force-dynamic";

const CARDS = [
  {
    href: "/dashboard/api-keys",
    title: "API Keys",
    description: "Crie e revogue chaves secretas por ambiente. O secret so e exibido uma vez.",
    icon: KeyRound,
  },
  {
    href: "/dashboard/webhooks",
    title: "Webhooks",
    description: "Endpoints de saida, eventos, entregas e status de retry.",
    icon: Webhook,
  },
  {
    href: "/dashboard/logs",
    title: "API Logs",
    description: "Historico de chamadas: metodo, path, status e duracao.",
    icon: FileText,
  },
  {
    href: "/dashboard/api",
    title: "Documentacao",
    description: "Guia completo de integracao: PIX, autenticacao, erros e exemplos.",
    icon: BookOpen,
  },
  {
    href: "/dashboard/api",
    title: "API Explorer",
    description: "Teste endpoints reais da FluxPay a partir da documentacao e das chaves.",
    icon: Code2,
  },
  {
    href: "/labs",
    title: "Labs",
    description: "Recursos experimentais isolados do produto principal.",
    icon: FlaskConical,
  },
];

export default async function DevelopersHubPage() {
  await requireDashboardContext();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Developer Center"
        description="Central de integracao da FluxPay: chaves, webhooks, logs, documentacao e ferramentas."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.title}
              href={c.href}
              className="card hover:border-flux-accent/40 transition-colors space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-flux-gray flex items-center justify-center">
                  <Icon className="w-4 h-4 text-flux-accent" />
                </div>
                <h2 className="font-medium">{c.title}</h2>
              </div>
              <p className="text-sm text-flux-muted leading-relaxed">{c.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
