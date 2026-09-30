import Link from "next/link";
import { FluxLogo } from "@/components/brand/FluxLogo";

export const dynamic = "force-dynamic";

/**
 * Pagina generica de retorno do link de pagamento.
 * O checkout hospedado por API ainda usa success_url/cancel_url do lojista;
 * links gerados no painel apontam para ca.
 */
export default async function CheckoutDonePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const ok = params.status === "success";

  return (
    <div className="min-h-screen bg-flux-darker flex flex-col items-center justify-center px-4">
      <FluxLogo className="h-8 mb-8" />
      <div className="card max-w-md w-full text-center py-10 px-6 space-y-3">
        <h1 className="text-xl font-semibold">
          {ok ? "Pagamento recebido" : "Pagamento nao concluido"}
        </h1>
        <p className="text-sm text-flux-muted">
          {ok
            ? "O valor foi confirmado. Voce ja pode fechar esta pagina."
            : "Nenhum pagamento foi confirmado. Se ainda quiser pagar, use o link enviado pelo vendedor."}
        </p>
        <Link href="/" className="text-sm text-flux-accent hover:underline inline-block mt-2">
          Voltar ao inicio
        </Link>
      </div>
    </div>
  );
}
