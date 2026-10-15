/**
 * Banner de vantagens da homepage — layout fiel à arte de referência FluxPay.
 * Texto, cartões e métricas alinhados à imagem enviada; sem dependência de asset binário.
 */
import Link from "next/link";
import { CreditCard, Percent, Link2, ArrowRight } from "lucide-react";

export function HomeAdvantagesBanner() {
  return (
    <section
      className="w-full border-b border-flux-border overflow-hidden"
      aria-label="Vantagens FluxPay"
    >
      <div
        className="relative w-full"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 70% 50%, rgba(180,20,30,0.45) 0%, transparent 55%), linear-gradient(180deg, #0a0a0a 0%, #120808 40%, #1a0505 100%)",
        }}
      >
        {/* Cortinas vermelhas laterais (efeito da referência) */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-40 hidden md:block"
          style={{
            background:
              "repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(120,10,15,0.35) 18px, rgba(120,10,15,0.35) 36px)",
          }}
          aria-hidden
        />

        <div className="relative max-w-7xl mx-auto px-5 sm:px-6 py-12 sm:py-16 lg:py-20 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-8 items-center">
          {/* Coluna esquerda — copy + CTA */}
          <div className="z-10 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-1 py-1 pr-3">
              <span className="rounded-full bg-flux-red px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-white">
                FLUXPAY
              </span>
              <span className="text-xs text-flux-muted">Vantagens</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold tracking-tight leading-[1.15] text-white">
              Transforme sua gestão de{" "}
              <span className="text-white">pagamentos com a FluxPay.</span>
            </h2>

            <p className="text-sm sm:text-base text-flux-muted leading-relaxed max-w-md">
              O hub completo para sua operação decolar. E muito mais para gerenciar{" "}
              <span className="text-white/90">seu negócio com alta performance.</span>
            </p>

            <ul className="space-y-2.5">
              {[
                { icon: CreditCard, label: "FLUXPAY CARD", desc: "mais facilidade e controle" },
                { icon: Percent, label: "TAXAS BAIXAS", desc: "mais margem de lucro" },
                { icon: Link2, label: "LINK DE PAGAMENTO", desc: "vendas rápidas e seguras" },
              ].map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-flux-red/15 text-flux-red">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <span className="font-medium text-white tracking-wide text-xs sm:text-sm">
                    {item.label}
                  </span>
                  <span className="text-flux-muted text-xs sm:text-sm">· {item.desc}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/signup"
              className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-sm font-medium"
            >
              Descubra todas as vantagens
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Coluna direita — mock UI (cards + métricas) */}
          <div className="relative z-10 min-h-[320px] sm:min-h-[380px]">
            {/* Card físico vermelho */}
            <div
              className="absolute right-0 top-0 w-[72%] max-w-[280px] rounded-2xl p-4 text-white shadow-2xl shadow-red-950/50 rotate-3 sm:rotate-6"
              style={{
                background: "linear-gradient(145deg, #e11d2e 0%, #9f1239 55%, #7f1d1d 100%)",
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center text-xs font-bold">
                    F
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest opacity-80">FluxPay</div>
                    <div className="text-xs font-semibold">CARD</div>
                  </div>
                </div>
                <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-medium">
                  FÍSICO
                </span>
              </div>
              <div className="mt-10 text-[10px] opacity-70">REDE FLUX</div>
            </div>

            {/* Card virtual preto */}
            <div className="absolute left-0 sm:left-4 top-16 sm:top-20 w-[78%] max-w-[300px] rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-4 text-white shadow-2xl -rotate-2 sm:-rotate-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-flux-red flex items-center justify-center text-xs font-bold">
                    F
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-400">FluxPay</div>
                    <div className="text-xs font-semibold">CARD</div>
                  </div>
                </div>
                <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                  VIRTUAL
                </span>
              </div>
              <div className="mt-8 flex items-center gap-2 text-zinc-500">
                <span className="inline-block h-6 w-8 rounded bg-zinc-700/80" />
                <span className="text-xs tracking-widest">•••• 4455 5253</span>
              </div>
              <div className="mt-4 flex justify-between text-[10px] text-zinc-500">
                <span>
                  TITULAR
                  <br />
                  <span className="text-zinc-300">SEU NOME AQUI</span>
                </span>
                <span className="text-right">
                  REDE
                  <br />
                  <span className="text-zinc-300">FLUX</span>
                </span>
              </div>
            </div>

            {/* Painel total de transações */}
            <div className="absolute left-0 top-0 w-[48%] max-w-[200px] rounded-xl border border-white/10 bg-black/70 backdrop-blur-md p-3 text-xs shadow-lg hidden sm:block">
              <div className="text-[10px] text-zinc-400 mb-2">Total de transações · Hoje</div>
              <div className="space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Geradas</span>
                  <span className="text-white font-medium tabular-nums">R$ 412.980,00</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Pagas</span>
                  <span className="text-emerald-400 font-medium tabular-nums">R$ 287.413,60</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Pendentes</span>
                  <span className="text-amber-400/90 font-medium tabular-nums">R$ 9.320,00</span>
                </div>
              </div>
            </div>

            {/* Saldo disponível */}
            <div className="absolute bottom-0 right-2 sm:right-8 w-[70%] max-w-[240px] rounded-xl border border-white/10 bg-black/80 backdrop-blur-md p-3.5 shadow-xl">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                <span>Saldo disponível</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </div>
              <div className="text-xl sm:text-2xl font-semibold text-white tabular-nums tracking-tight">
                R$ 22.550,92
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="text-zinc-500">
                  Saldo bloqueado
                  <br />
                  <span className="text-zinc-300">R$ 12.340,00</span>
                </span>
                <span className="rounded-full bg-flux-red px-3 py-1 text-[11px] font-medium text-white">
                  Sacar
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
