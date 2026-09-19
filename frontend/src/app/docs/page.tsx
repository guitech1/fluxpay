import Link from "next/link";

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-flux-black">
      <header className="border-b border-flux-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-flux-red flex items-center justify-center">
              <span className="text-white font-bold text-sm">F</span>
            </div>
            <span className="font-semibold">FluxPay Docs</span>
          </Link>
          <Link href="/dashboard" className="text-sm text-flux-muted hover:text-white">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 prose prose-invert prose-red">
        <h1 className="text-3xl font-semibold mb-2">Documentação da API</h1>
        <p className="text-flux-muted mb-10">
          API REST v1 – autenticação por API Key, ambientes test e live.
        </p>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Autenticação</h2>
          <p className="text-flux-muted mb-4">
            Todas as requisições autenticadas devem incluir a chave secreta no header:
          </p>
          <pre className="bg-flux-dark border border-flux-border rounded-lg p-4 text-sm overflow-x-auto">
{`Authorization: Bearer sk_test_...
# ou
X-Api-Key: sk_test_...`}
          </pre>
          <p className="text-flux-muted mt-4 text-sm">
            Use <code className="text-flux-red">sk_test_</code> no sandbox e{" "}
            <code className="text-flux-red">sk_live_</code> em produção. Nunca exponha chaves secretas no frontend.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Endpoints</h2>

          <div className="space-y-6">
            {[
              {
                method: "POST",
                path: "/v1/payments",
                desc: "Criar um pagamento",
                body: `{
  "amount": 15990,
  "currency": "BRL",
  "description": "Pedido #1234",
  "customer_id": "cus_...",
  "idempotency_key": "unique-key-123"
}`,
              },
              {
                method: "GET",
                path: "/v1/payments/:id",
                desc: "Consultar pagamento",
              },
              {
                method: "GET",
                path: "/v1/payments",
                desc: "Listar pagamentos (limit, starting_after, status)",
              },
              {
                method: "POST",
                path: "/v1/payments/:id/cancel",
                desc: "Cancelar pagamento pendente",
              },
              {
                method: "POST",
                path: "/v1/payments/:id/refund",
                desc: "Solicitar reembolso",
                body: `{ "amount": 5000, "reason": "Solicitação do cliente" }`,
              },
              {
                method: "POST",
                path: "/v1/customers",
                desc: "Criar cliente",
                body: `{ "email": "cliente@email.com", "name": "João Silva" }`,
              },
              {
                method: "GET",
                path: "/v1/customers/:id",
                desc: "Consultar cliente",
              },
              {
                method: "POST",
                path: "/v1/checkout/sessions",
                desc: "Criar sessão de checkout",
                body: `{
  "amount": 15990,
  "success_url": "https://seusite.com/sucesso",
  "cancel_url": "https://seusite.com/cancelado"
}`,
              },
              {
                method: "GET",
                path: "/v1/balance",
                desc: "Consultar saldo disponível e pendente",
              },
              {
                method: "POST",
                path: "/v1/webhooks/endpoints",
                desc: "Configurar endpoint de webhook",
                body: `{
  "url": "https://seusite.com/webhooks/fluxpay",
  "events": ["payment.succeeded", "payment.failed", "payment.refunded"]
}`,
              },
            ].map((ep) => (
              <div key={ep.path + ep.method} className="card">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                      ep.method === "GET"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-blue-500/10 text-blue-400"
                    }`}
                  >
                    {ep.method}
                  </span>
                  <code className="text-sm font-mono">{ep.path}</code>
                </div>
                <p className="text-sm text-flux-muted">{ep.desc}</p>
                {ep.body && (
                  <pre className="mt-3 bg-flux-black border border-flux-border rounded-lg p-3 text-xs overflow-x-auto">
                    {ep.body}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Webhooks</h2>
          <p className="text-flux-muted mb-4">
            Eventos enviados: <code>payment.created</code>, <code>payment.pending</code>,{" "}
            <code>payment.succeeded</code>, <code>payment.failed</code>,{" "}
            <code>payment.refunded</code>.
          </p>
          <p className="text-flux-muted mb-4">
            Verifique a assinatura no header <code>FluxPay-Signature</code> (HMAC-SHA256).
          </p>
          <pre className="bg-flux-dark border border-flux-border rounded-lg p-4 text-sm overflow-x-auto">
{`FluxPay-Signature: t=1695000000,v1=abc123...`}
          </pre>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Sandbox</h2>
          <p className="text-flux-muted">
            Use chaves <code className="text-flux-red">sk_test_</code> e{" "}
            <code className="text-flux-red">pk_test_</code>. Pagamentos com valor terminando em{" "}
            <strong>13</strong> centavos falham; terminando em <strong>50</strong> ficam pendentes;
            demais são aprovados. Nenhum dinheiro real é movimentado.
          </p>
        </section>
      </main>
    </div>
  );
}
