import Link from "next/link";
import { ArrowRight, Shield, Zap, Code2, BarChart3 } from "lucide-react";
import { FluxLogo } from "@/components/brand/FluxLogo";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-flux-black">
      <header className="border-b border-flux-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <FluxLogo markClassName="w-8 h-8" textClassName="text-lg" />
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/docs"
              className="text-sm text-flux-muted hover:text-white hidden sm:inline"
            >
              Documentação
            </Link>
            <Link href="/login" className="text-sm text-flux-muted hover:text-white">
              Entrar
            </Link>
            <Link href="/dashboard" className="btn-primary text-sm px-3 sm:px-4">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-16 sm:py-24 text-center surface-grid">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-flux-red/10 text-flux-red text-sm font-medium mb-6">
          <Zap className="w-4 h-4" />
          Gateway de pagamentos PIX
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight max-w-3xl mx-auto leading-tight">
          Receba pagamentos com{" "}
          <span className="text-flux-red">segurança</span> e escala
        </h1>
        <p className="mt-6 text-lg text-flux-muted max-w-2xl mx-auto">
          API completa, checkout profissional, webhooks confiáveis e painel
          administrativo. Feita para desenvolvedores e empresas que precisam de
          controle total.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/dashboard" className="btn-primary flex items-center gap-2 px-6 py-3">
            Abrir Dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/docs" className="btn-secondary px-6 py-3">
            Ver documentação
          </Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: Code2,
              title: "API REST moderna",
              desc: "Endpoints claros, autenticação por API Key, idempotência e documentação OpenAPI.",
            },
            {
              icon: Shield,
              title: "Segurança em primeiro lugar",
              desc: "RLS, chaves com hash, rate limiting, webhooks assinados e nunca armazenamos CVV.",
            },
            {
              icon: BarChart3,
              title: "Painel completo",
              desc: "Saldo, transações, clientes, reembolsos, disputas, logs e gráficos em tempo real.",
            },
          ].map((f) => (
            <div key={f.title} className="card">
              <div className="p-2.5 rounded-lg bg-flux-red/10 w-fit mb-4">
                <f.icon className="w-5 h-5 text-flux-red" />
              </div>
              <h3 className="font-semibold text-lg">{f.title}</h3>
              <p className="mt-2 text-sm text-flux-muted leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-flux-border py-8 text-center text-sm text-flux-muted">
        © 2026 FluxPay. Plataforma de pagamentos.
      </footer>
    </div>
  );
}
