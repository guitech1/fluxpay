import { FluxMark } from "@/components/brand/FluxLogo";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * FluxPay Labs — area experimental isolada.
 * Nao executa operacoes financeiras. Links apenas navegam para telas ja existentes.
 * Recursos marcados como experimental/beta nao sao garantias de producao.
 */
const EXPERIMENTS = [
  {
    id: "score-preview",
    title: "FluxPay Score",
    status: "beta",
    description:
      "Indicador de evolucao do vendedor calculado no backend a partir de vendas reais.",
    href: "/dashboard",
  },
  {
    id: "ranking-3d",
    title: "Ranking com podio 3D",
    status: "beta",
    description:
      "Experiencia visual do ranking. Volume e Score continuam vindo das fontes oficiais.",
    href: "/ranking",
  },
  {
    id: "risk-radar",
    title: "Risk Radar",
    status: "experimental",
    description:
      "Alertas informativos. Nao bloqueia pagamentos automaticamente.",
    href: "/dashboard/risk",
  },
  {
    id: "vaults",
    title: "Cofres",
    status: "beta",
    description:
      "Organizacao interna do saldo. Nao cria dinheiro nem conta bancaria.",
    href: "/dashboard/vaults",
  },
];

export default function LabsPage() {
  return (
    <div className="min-h-screen bg-flux-black text-white">
      <header className="border-b border-flux-border">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm text-flux-muted hover:text-white shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Voltar</span>
            </Link>
            <Link href="/" className="flex items-center gap-2 min-w-0">
              <FluxMark className="w-6 h-6 shrink-0" />
              <span className="font-semibold tracking-tight truncate">FluxPay</span>
            </Link>
          </div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-violet-300/80 border border-violet-500/30 rounded-full px-3 py-1 shrink-0">
            Labs
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
          Area experimental. Nenhum fluxo nesta pagina altera saldo, ledger ou pagamentos.
          Funcionalidades em teste podem mudar ou ser removidas.
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">FluxPay Labs</h1>
          <p className="text-sm text-flux-muted max-w-xl leading-relaxed">
            Recursos em avaliacao. O painel principal permanece a experiencia de producao.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {EXPERIMENTS.map((exp) => (
            <Link
              key={exp.id}
              href={exp.href}
              className="group rounded-xl border border-flux-border bg-flux-dark/80 p-5 hover:border-violet-500/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="font-medium group-hover:text-white">{exp.title}</h2>
                <span className="text-[10px] uppercase tracking-wider text-violet-300/70">
                  {exp.status}
                </span>
              </div>
              <p className="text-sm text-flux-muted leading-relaxed">{exp.description}</p>
            </Link>
          ))}
        </div>

        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-flux-muted hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao painel
          </Link>
        </div>
      </main>
    </div>
  );
}
