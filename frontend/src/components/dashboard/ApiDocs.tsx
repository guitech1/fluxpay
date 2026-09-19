import { CopyButton } from "./ui-client";
import { SectionTitle } from "./ui";
import type { Environment } from "@/lib/types";

/**
 * Documentacao da API. Server Component: e conteudo estatico, so o botao de
 * copiar (ui-client) e interativo.
 *
 * Esta pagina vive dentro do painel de proposito. Endpoints, formato de
 * payload e regras de ambiente sao informacao de quem ja e cliente — a rota
 * publica /docs e fechada no middleware (frontend/src/middleware.ts), nao
 * apenas escondida do menu.
 *
 * Nada aqui inventa endpoint: cada rota abaixo existe em
 * backend/src/routes/*.ts. Os exemplos usam sempre a chave do ambiente que a
 * pessoa esta vendo no painel, para nao misturar teste com producao.
 */

function Endpoint({
  method,
  path,
  children,
}: {
  method: "GET" | "POST";
  path: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-4 py-3 border-b border-flux-border last:border-0">
      <div className="flex items-center gap-2 sm:w-64 shrink-0">
        <span
          className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
            method === "GET"
              ? "bg-sky-500/10 text-sky-300"
              : "bg-emerald-500/10 text-emerald-300"
          }`}
        >
          {method}
        </span>
        <code className="font-mono text-xs break-all">{path}</code>
      </div>
      <p className="text-sm text-flux-muted min-w-0">{children}</p>
    </div>
  );
}

function Code({ title, code }: { title?: string; code: string }) {
  return (
    <div className="rounded-lg border border-flux-border bg-flux-black overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-flux-border bg-flux-gray/40">
        <span className="text-xs text-flux-muted">{title || "Exemplo"}</span>
        <CopyButton value={code} className="px-2 py-1 text-xs" />
      </div>
      <pre className="p-4 overflow-x-auto text-xs leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ApiDocs({
  environment,
  apiBaseUrl,
  webhookInUrl,
}: {
  environment: Environment;
  apiBaseUrl: string;
  webhookInUrl: string;
}) {
  const keyExample = `sk_${environment}_...`;

  const createCharge = `curl -X POST ${apiBaseUrl}/v1/payments \\
  -H "Authorization: Bearer ${keyExample}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pedido-1042" \\
  -d '{
    "amount": 4990,
    "currency": "BRL",
    "description": "Pedido 1042",
    "payment_method": { "type": "pix" }
  }'`;

  const createResponse = `{
  "data": {
    "id": "b3f1c0de-...",
    "amount": 4990,
    "currency": "BRL",
    "status": "pending",
    "payment_type": "pix",
    "pix_copy_paste": "00020126...",
    "pix_qr_code_base64": "iVBORw0KGgo...",
    "expires_at": "2026-09-18T15:30:00Z",
    "created_at": "2026-09-18T14:30:00Z"
  }
}`;

  const webhookPayload = `{
  "id": "evt_...",
  "type": "payment.succeeded",
  "created": "2026-09-18T14:31:07Z",
  "data": {
    "id": "b3f1c0de-...",
    "amount": 4990,
    "currency": "BRL",
    "status": "succeeded",
    "paid_at": "2026-09-18T14:31:05Z"
  }
}`;

  const verifySignature = `import crypto from "node:crypto";

// O corpo precisa ser o texto BRUTO recebido, antes de JSON.parse:
// reserializar muda espacos e a assinatura deixa de bater.
function isValid(rawBody, header, secret) {
  const [t, v1] = header.split(",");
  const timestamp = t.replace("t=", "");
  const signature = v1.replace("v1=", "");

  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}`;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionTitle
          title="Autenticação"
          description="Toda chamada vai com a chave secreta no cabeçalho Authorization."
        />
        <div className="card space-y-4">
          <p className="text-sm text-flux-muted leading-relaxed">
            A chave determina o ambiente: uma chave{" "}
            <code className="font-mono text-xs text-white">sk_test_</code> só enxerga dados de
            teste e nunca movimenta dinheiro real; uma chave{" "}
            <code className="font-mono text-xs text-white">sk_live_</code> opera em produção. Não
            existe parâmetro de ambiente na requisição — é a chave que decide.
          </p>
          <Code
            title="Cabeçalho"
            code={`Authorization: Bearer ${keyExample}\nContent-Type: application/json`}
          />
          <p className="text-sm text-flux-muted leading-relaxed">
            Todos os endpoints abaixo exigem uma chave secreta (
            <code className="font-mono text-xs text-white">sk_</code>), inclusive os de leitura:
            cobranças, clientes e saldo são dados privados da sua empresa e não podem trafegar
            pelo navegador do seu cliente final. Guarde a chave secreta apenas no seu servidor.
          </p>
          <p className="text-sm text-flux-muted leading-relaxed">
            Chaves publicáveis (<code className="font-mono text-xs text-white">pk_</code>) existem
            para uso em páginas públicas, mas <strong>ainda não há endpoint que as aceite</strong>.
            Até que exista, crie apenas chaves secretas.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle
          title="Criar uma cobrança PIX"
          description="Valores sempre em centavos. R$ 49,90 é 4990."
        />
        <div className="space-y-4">
          <Code title="Requisição" code={createCharge} />
          <Code title="Resposta (201)" code={createResponse} />
          <div className="card">
            <p className="text-sm text-flux-muted leading-relaxed">
              <code className="font-mono text-xs text-white">pix_copy_paste</code> é o código que o
              pagador cola no aplicativo do banco.{" "}
              <code className="font-mono text-xs text-white">pix_qr_code_base64</code> é a mesma
              informação em imagem, pronta para exibir. A cobrança nasce{" "}
              <code className="font-mono text-xs text-white">pending</code> e vira{" "}
              <code className="font-mono text-xs text-white">succeeded</code> quando o pagamento é
              confirmado — não é preciso ficar consultando: assine o webhook.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle
          title="Idempotência"
          description="Reenviar a mesma requisição não cria duas cobranças."
        />
        <div className="card">
          <p className="text-sm text-flux-muted leading-relaxed">
            Envie o cabeçalho{" "}
            <code className="font-mono text-xs text-white">Idempotency-Key</code> com um valor seu
            (o número do pedido, por exemplo) em toda criação de cobrança. Se a mesma chave chegar
            de novo — por timeout, retry ou clique duplo — a resposta é a cobrança já criada, não
            uma nova.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="Endpoints" description="Base: todas as rotas sob /v1." />
        <div className="card">
          <Endpoint method="POST" path="/v1/payments">
            Cria uma cobrança. Aceita <code className="font-mono text-xs">amount</code>,{" "}
            <code className="font-mono text-xs">currency</code>,{" "}
            <code className="font-mono text-xs">description</code>,{" "}
            <code className="font-mono text-xs">customer_id</code>,{" "}
            <code className="font-mono text-xs">metadata</code> e{" "}
            <code className="font-mono text-xs">payment_method</code>.
          </Endpoint>
          <Endpoint method="GET" path="/v1/payments">
            Lista cobranças. Filtros: <code className="font-mono text-xs">limit</code>,{" "}
            <code className="font-mono text-xs">starting_after</code>,{" "}
            <code className="font-mono text-xs">status</code>.
          </Endpoint>
          <Endpoint method="GET" path="/v1/payments/:id">
            Consulta uma cobrança, incluindo o status atual.
          </Endpoint>
          <Endpoint method="POST" path="/v1/payments/:id/cancel">
            Cancela uma cobrança que ainda não foi paga.
          </Endpoint>
          <Endpoint method="POST" path="/v1/payments/:id/refund">
            Devolve o valor, total ou parcial (<code className="font-mono text-xs">amount</code>).
          </Endpoint>
          <Endpoint method="POST" path="/v1/customers">
            Cadastra um cliente para vincular a cobranças futuras.
          </Endpoint>
          <Endpoint method="GET" path="/v1/customers">
            Lista clientes do ambiente da chave.
          </Endpoint>
          <Endpoint method="GET" path="/v1/customers/:id">
            Consulta um cliente.
          </Endpoint>
          <Endpoint method="POST" path="/v1/checkout/sessions">
            Cria uma sessão de checkout hospedado e devolve a URL para onde enviar o pagador.
          </Endpoint>
          <Endpoint method="GET" path="/v1/checkout/sessions/:id">
            Consulta uma sessão de checkout.
          </Endpoint>
          <Endpoint method="GET" path="/v1/balance">
            Saldo disponível e a liberar, por moeda.
          </Endpoint>
          <Endpoint method="POST" path="/v1/webhooks/endpoints">
            Cadastra um endpoint para receber eventos.
          </Endpoint>
          <Endpoint method="GET" path="/v1/webhooks/endpoints">
            Lista os endpoints cadastrados.
          </Endpoint>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle
          title="Webhooks"
          description="Como o FluxPay avisa o seu sistema de que a cobrança foi paga."
        />
        <div className="space-y-4">
          <Code title="Corpo do evento" code={webhookPayload} />
          <div className="card space-y-3">
            <p className="text-sm text-flux-muted leading-relaxed">
              Toda entrega leva o cabeçalho{" "}
              <code className="font-mono text-xs text-white">FluxPay-Signature</code> no formato{" "}
              <code className="font-mono text-xs text-white">t=&lt;unix&gt;,v1=&lt;hmac&gt;</code>,
              onde o HMAC-SHA256 é calculado sobre{" "}
              <code className="font-mono text-xs text-white">
                &quot;&lt;timestamp&gt;.&lt;corpo&gt;&quot;
              </code>{" "}
              com o segredo do endpoint. Confira a assinatura antes de confiar no evento.
            </p>
            <p className="text-sm text-flux-muted leading-relaxed">
              Responda <code className="font-mono text-xs text-white">2xx</code> rapidamente. Se a
              resposta demorar ou vier com erro, o FluxPay reenvia com intervalos crescentes.
              Trate a entrega como possivelmente repetida: use o{" "}
              <code className="font-mono text-xs text-white">id</code> do evento para não
              processar duas vezes.
            </p>
          </div>
          <Code title="Verificação da assinatura (Node.js)" code={verifySignature} />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle
          title="Webhook de entrada do adquirente"
          description="Configure esta URL no painel do seu adquirente."
        />
        <div className="card space-y-3">
          <p className="text-sm text-flux-muted leading-relaxed">
            Esta é a URL que o adquirente chama para avisar o FluxPay de que um PIX foi pago. Ela
            não substitui os seus webhooks — é a ponta de trás da confirmação.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-flux-border bg-flux-black px-3 py-2">
            <code className="font-mono text-xs break-all min-w-0 flex-1">{webhookInUrl}</code>
            <CopyButton value={webhookInUrl} iconOnly />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="Erros" description="Formato único para toda a API." />
        <div className="space-y-4">
          <Code
            title="Corpo de erro"
            code={`{
  "error": {
    "type": "validation_error",
    "message": "Informe um valor valido para a cobranca."
  }
}`}
          />
          <div className="card">
            <dl className="text-sm">
              {[
                ["400", "Requisição inválida — confira os campos enviados."],
                ["401", "Chave ausente, inválida ou revogada."],
                ["403", "A chave não tem permissão para esta operação."],
                ["404", "Recurso não encontrado neste ambiente."],
                ["429", "Muitas requisições. Aguarde e tente de novo."],
                ["502", "Falha temporária no adquirente. A requisição pode ser repetida."],
              ].map(([code, desc]) => (
                <div
                  key={code}
                  className="flex gap-4 py-2 border-b border-flux-border last:border-0"
                >
                  <dt className="font-mono text-xs w-10 shrink-0 pt-0.5">{code}</dt>
                  <dd className="text-flux-muted">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
