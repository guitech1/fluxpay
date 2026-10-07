import { FluxMark } from "@/components/brand/FluxLogo";
import Link from "next/link";

const EXPERIMENTS = [
  {
    id: "score-preview",
    title: "FluxPay Score",
    status: "beta",
    description:
      "Indicador de evolucao do vendedor calculado a partir de vendas reais, consistencia e tempo de uso.",
    href: "/dashboard",
  },
  {
    id: "ranking-3d",
    title: "Ranking com podio 3D",
    status: "beta",
    description:
      "Experiencia visual premium do ranking com profundidade, iluminacao e reflexos.",
    href: "/ranking",
  },
  {
    id: "risk-radar",
    title: "Risk Radar",
    status: "experimental",
    description:
      "Alertas informativos sobre variacoes incomuns de volume, aprovacao e cancelamentos.",
    href: "/dashboard/risk",
  },
  {
    id: "vaults",
    title: "Cofres",
    status: "beta",
    description:
      "Organizacao interna do saldo disponivel sem criar contas bancarias separadas.",
    href: "/dashboard/vaults",
  },
];

export default function LabsPage() {
  return (
    <div className="min-h-screen bg-flux-black text-white">
      <header className="border-b border-flux-border">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <FluxMark className="w-6 h-6" />
            <span className="font-semibold tracking-tight">FluxPay</span>
          </Link>
          <span className="text-[10px] uppercase tracking-[0.25em] text-violet-300/80 border border-violet-500/30 rounded-full px-3 py-1">
            Labs
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">FluxPay Labs</h1>
          <p className="text-sm text-flux-muted max-w-xl leading-relaxed">
            Area experimental da FluxPay. Recursos em teste ficam isolados e podem mudar.
            Nao substituem as funcionalidades de producao do painel principal.
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
      </main>
    </div>
  );
}
