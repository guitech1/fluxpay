"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  ShieldCheck,
  Building2,
  Users,
  CreditCard,
  Banknote,
  Webhook,
  ScrollText,
  Settings,
  Activity,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FluxMark } from "@/components/brand/FluxLogo";

const NAV = [
  { href: "/admin", label: "Visão geral", icon: ShieldCheck },
  { href: "/admin/organizations", label: "Contas", icon: Building2 },
  { href: "/admin/users", label: "Usuários", icon: Users },
  { href: "/admin/payments", label: "Pagamentos", icon: CreditCard },
  { href: "/admin/withdrawals", label: "Saques", icon: Banknote },
  { href: "/admin/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/admin/security", label: "Segurança", icon: Activity },
  { href: "/admin/audit", label: "Auditoria", icon: ScrollText },
  { href: "/admin/settings", label: "Plataforma", icon: Settings },
];

export function AdminShell({
  email,
  role,
  environment,
  children,
}: {
  email: string | null;
  role: string;
  environment: "test" | "live";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchEnvironment(next: "test" | "live") {
    if (next === environment) return;
    document.cookie = `fluxpay_env=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div className="min-h-screen bg-flux-black">
      <header className="border-b border-flux-border bg-flux-dark">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <FluxMark className="w-8 h-8 shrink-0" />
            <div>
              <div className="font-semibold tracking-tight leading-tight">FluxPay · ADM</div>
              <div className="text-[11px] text-flux-muted capitalize">{role}</div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center rounded-lg border border-flux-border bg-flux-gray p-0.5">
              {(["test", "live"] as const).map((env) => (
                <button
                  key={env}
                  onClick={() => switchEnvironment(env)}
                  disabled={pending}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-60",
                    environment === env
                      ? env === "live"
                        ? "bg-flux-red text-white"
                        : "bg-flux-gray-light text-white"
                      : "text-flux-muted hover:text-white"
                  )}
                >
                  {env === "test" ? "Teste" : "Produção"}
                </button>
              ))}
            </div>
            <span className="hidden sm:inline text-sm text-flux-muted max-w-[180px] truncate">
              {email}
            </span>
            <Link
              href="/dashboard"
              className="text-sm text-flux-muted hover:text-white flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Meu painel</span>
            </Link>
          </div>
        </div>

        <nav className="max-w-7xl mx-auto px-4 lg:px-8 flex gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                  active
                    ? "border-flux-red text-white"
                    : "border-transparent text-flux-muted hover:text-white"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {environment === "live" && (
        <div className="bg-flux-red/10 border-b border-flux-red/20 px-4 lg:px-8 py-1.5 text-xs text-flux-red-light text-center">
          Dados de <strong>produção</strong>. Ações aqui afetam contas e dinheiro reais.
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8">{children}</main>
    </div>
  );
}
