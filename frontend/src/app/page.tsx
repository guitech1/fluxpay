import Link from "next/link";
import { ArrowRight, Shield, Zap, Code2, BarChart3, Webhook, Lock } from "lucide-react";
import { FluxLogo } from "@/components/brand/FluxLogo";

/**
 * Site público. O visitante vê a proposta do produto e dois caminhos: entrar
 * ou criar conta.
 *
 * O que NÃO fica aqui, de propósito: a documentação da API. Endpoints,
 * formato de payload, regras de ambiente e comportamento do sandbox são
 * informação de quem já é cliente — vive em /dashboard/api, atrás de login
 * (a rota /docs é fechada no middleware, não só escondida da navegação).
 */

const BENEFITS = [
  {
    icon: Zap,
    title: "Cobranças PIX em segundos",
    desc: "Gere uma cobrança pelo painel ou por API e receba a confirmação automaticamente, sem conferência manual.",
  },
  {
    icon: Shield,
    title: "Segurança desde a base",
    desc: "Isolamento por conta no banco, chaves guardadas apenas como hash, webhooks assinados e limite de requisições.",
  },
  {
    icon: BarChart3,
    title: "Painel para o time financeiro",
    desc: "Saldo, extrato, cobranças, clientes e reembolsos na mesma tela — sem depender do time de tecnologia.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Crie sua conta",
    desc: "Cadastro em um minuto. Sua empresa já começa no ambiente de teste, sem risco.",
  },
  {
    step: "02",
    title: "Gere sua primeira cobrança",
    desc: "Pelo painel, em Pagamentos → Nova cobrança. QR Code e código copia e cola na hora.",
  },
  {
    step: "03",
    title: "Integre quando quiser",
    desc: "Chaves de API, webhooks e documentação completa ficam disponíveis dentro da sua conta.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-flux-black flex flex-col">
      <header className="border-b border-flux-border sticky top-0 bg-flux-black/80 backdrop-blur z-30">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <FluxLogo markClassName="w-8 h-8" textClassName="text-lg" />
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="btn-ghost text-sm px-3 sm:px-4">
              Entrar
            </Link>
            <Link href="/signup" className="btn-primary text-sm px-3 sm:px-4">
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Proposta */}
        <section className="surface-grid border-b border-flux-border">
          <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-24 text-center">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-flux-border bg-flux-dark text-xs font-medium text-flux-muted">
              Gateway de pagamentos PIX
            </span>
            <h1 className="mt-6 text-3xl sm:text-5xl font-semibold tracking-tight max-w-3xl mx-auto leading-[1.15]">
              Receba por PIX com <span className="text-flux-red">controle total</span> do
              início ao fim
            </h1>
            <p className="mt-5 text-base sm:text-lg text-flux-muted max-w-2xl mx-auto leading-relaxed">
              Cobranças, checkout hospedado, confirmação automática e um painel que mostra
              exatamente onde seu dinheiro está. Para quem vende pelo site, pelo WhatsApp ou
              por integração própria.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/signup" className="btn-primary px-6 py-3 w-full sm:w-auto">
                Criar conta
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/login" className="btn-secondary px-6 py-3 w-full sm:w-auto">
                Já tenho conta
              </Link>
            </div>
            <p className="mt-5 text-xs text-flux-muted">
              Sua conta começa no ambiente de teste. Nenhuma cobrança real acontece até você
              ativar a produção.
            </p>
          </div>
        </section>

        {/* Benefícios */}
        <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {BENEFITS.map((f) => (
              <div key={f.title} className="card">
                <div className="p-2.5 rounded-lg bg-flux-red/10 w-fit mb-4">
                  <f.icon className="w-5 h-5 text-flux-red" />
                </div>
                <h2 className="font-medium">{f.title}</h2>
                <p className="mt-2 text-sm text-flux-muted leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Como funciona */}
        <section className="border-y border-flux-border bg-flux-dark/40">
          <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
            <h2 className="text-2xl font-semibold tracking-tight">Como funciona</h2>
            <p className="text-flux-muted mt-2 text-sm">Do cadastro à primeira cobrança.</p>
            <ol className="mt-9 grid grid-cols-1 md:grid-cols-3 gap-5">
              {STEPS.map((s) => (
                <li key={s.step} className="card">
                  <span className="font-mono text-xs text-flux-red">{s.step}</span>
                  <h3 className="font-medium mt-3">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-flux-muted leading-relaxed">{s.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Recursos técnicos — visão geral, sem documentação */}
        <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Feito para integrar</h2>
              <p className="text-flux-muted mt-3 text-sm leading-relaxed max-w-lg">
                Uma API REST com chaves separadas por ambiente, chave de idempotência em toda
                criação de cobrança e webhooks assinados para você confirmar o pagamento no seu
                sistema sem ficar consultando a API.
              </p>
              <p className="text-flux-muted mt-3 text-sm leading-relaxed max-w-lg">
                A documentação completa, com endpoints e exemplos, fica dentro da sua conta —
                junto das suas chaves.
              </p>
              <Link href="/signup" className="btn-secondary mt-6 inline-flex">
                Criar conta para ver a documentação
              </Link>
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { icon: Code2, title: "API REST", desc: "Cobranças, clientes, checkout e saldo." },
                { icon: Webhook, title: "Webhooks assinados", desc: "HMAC-SHA256 e reenvio automático." },
                { icon: Lock, title: "Ambientes separados", desc: "Teste e produção com chaves distintas." },
                { icon: Shield, title: "Dados isolados", desc: "Cada conta enxerga apenas os próprios dados." },
              ].map((item) => (
                <li key={item.title} className="card">
                  <item.icon className="w-5 h-5 text-flux-muted" />
                  <h3 className="font-medium text-sm mt-3">{item.title}</h3>
                  <p className="text-sm text-flux-muted mt-1">{item.desc}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Segurança */}
        <section className="border-t border-flux-border bg-flux-dark/40">
          <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
            <h2 className="text-2xl font-semibold tracking-tight">Segurança</h2>
            <dl className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                ["Isolamento por conta", "Regras no próprio banco impedem que uma conta leia dados de outra."],
                ["Chaves protegidas", "Chaves de API são guardadas apenas como hash e podem ser revogadas a qualquer momento."],
                ["Webhooks assinados", "Toda notificação vai com assinatura, para você confirmar a origem."],
                ["Auditoria", "Cada chamada autenticada fica registrada com data, origem e resultado."],
              ].map(([title, desc]) => (
                <div key={title}>
                  <dt className="font-medium text-sm">{title}</dt>
                  <dd className="text-sm text-flux-muted mt-1.5 leading-relaxed">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* CTA final */}
        <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Comece pelo ambiente de teste
          </h2>
          <p className="text-flux-muted mt-3 text-sm max-w-md mx-auto">
            Crie a conta, gere uma cobrança e veja o fluxo inteiro antes de ativar a produção.
          </p>
          <Link href="/signup" className="btn-primary mt-7 px-6 py-3 inline-flex">
            Criar conta
            <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      </main>

      <footer className="border-t border-flux-border">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-flux-muted">
          <FluxLogo markClassName="w-6 h-6" textClassName="text-sm" />
          <span>© 2026 FluxPay. Todos os direitos reservados.</span>
        </div>
      </footer>
    </div>
  );
}
