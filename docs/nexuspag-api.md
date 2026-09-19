# NexusPag API — Documentacao completa pra LLMs

Base URL: `https://nexuspag.com`

Autenticacao: header `x-api-key: nxp_live_a089b1f...` em todas as chamadas.

Webhooks: assinados com HMAC-SHA256 no header `x-webhook-signature`. Validar antes de processar.

---

## PIX

Endpoints para criar e consultar cobrancas PIX

### POST /api/pix/create — Criar Cobranca PIX

Gera um QR Code PIX para recebimento de pagamentos. Suporta split automatico para dividir o valor entre multiplas contas.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API
- `Content-Type` (string) **(required)** — application/json

**Body (JSON):**
- `amount` (number) **(required)** — Valor em reais (ex: 50.00 = R$50,00). Minimo: R$1,00
- `description` (string) — Descricao da cobranca (exibida no app do banco)
- `external_id` (string) — ID externo para referencia no seu sistema. Funciona como chave de idempotencia: se ja existir uma transacao com esse external_id, ela e retornada sem criar nova cobranca.
- `webhook_url` (string) — URL para receber notificacao quando o pagamento for confirmado
- `expiration` (integer) — Tempo de expiracao em SEGUNDOS (padrao: 1800 = 30min)
- `shop_id` (string) — Identificador (external_ref) da subconta. Quando informado, o pagamento e creditado na carteira da subconta em vez da carteira principal. A subconta e criada automaticamente no primeiro uso. Veja "Splits entre Subcontas" na categoria Subcontas para dividir o valor entre multiplas subcontas.
- `split` (array) — Split user-to-user entre contas da plataforma. Cada item tem user_id + (amount OU percent). Maximo 10 regras.
- `split[].user_id` (string) — UUID do usuario de destino do split.
- `split[].amount` (number) — Valor fixo em reais. Mutuamente exclusivo com percent.
- `split[].percent` (number) — Percentual do valor liquido. Soma dos percent nao pode atingir 100.

**Resposta (200):**
```json
{
  "success": true,
  "transaction": {
    "id": "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
    "txid": "1919700995",
    "external_id": "pedido-123",
    "amount": 50.00,
    "fee": 2.50,
    "fee_percent": 5,
    "net_amount": 47.50,
    "status": "pending",
    "pix_copia_cola": "00020126580014BR.GOV.BCB.PIX0136...",
    "qr_code_base64": "data:image/png;base64,iVBORw0KGgo...",
    "expires_at": "2024-01-15T11:30:00.000Z",
    "splits_preview": {
      "owner_net_amount": 35.63,
      "splits": [
        { "user_id": "abc123...", "amount": 11.88, "percent": 25 }
      ]
    }
  }
}
```

**Campos da resposta:**
- `success` (boolean) — Indica que a cobranca foi criada ou retornada por idempotencia
- `transaction` (object) — Objeto com os dados da cobranca PIX
- `transaction.id` (string) — Identificador unico da transacao na plataforma
- `transaction.txid` (string) — Identificador da transacao no gateway
- `transaction.external_id` (string | null) — Seu ID externo para referencia (null se nao informado)
- `transaction.amount` (number) — Valor bruto em reais
- `transaction.fee` (number) — Taxa cobrada em reais
- `transaction.fee_percent` (number) — Percentual da taxa
- `transaction.net_amount` (number) — Valor liquido total (apos taxas, antes dos splits)
- `transaction.status` (string) — Status inicial da cobranca: pending
- `transaction.pix_copia_cola` (string) — Codigo PIX copia e cola
- `transaction.qr_code_base64` (string) — Imagem do QR Code em base64
- `transaction.expires_at` (string) — Data/hora de expiracao (ISO 8601)
- `transaction.shop_id` (string?) — ID interno do shop quando shop_id for usado
- `transaction.shop_external_ref` (string?) — Referencia externa do shop quando informada
- `transaction.splits_preview` (object) — Previsao dos splits (so aparece quando split foi informado)
- `transaction.splits_preview.owner_net_amount` (number) — Valor liquido que sobra apos os splits
- `transaction.splits_preview.splits[]` (array) — Lista de splits com user_id, amount e percent quando aplicavel

**Erros:**
- **400** — amount invalido (zero, negativo ou abaixo do minimo de R$ 1,00).
- **400** — Validacoes do split (singular, user-to-user): falta user_id; soma dos amount fixos >= amount total; soma dos percent >= 100; mais de 10 regras.
- **400** — Validacoes do splits (plural, entre subcontas): falta shop_id no payload top-level; item sem shop_id e sem parent: true; item com amount E percent juntos (mutuamente exclusivos); soma dos percent >= 100; mais de 10 regras.
- **401** — API Key invalida ou nao fornecida
- **409** — Conflito de external_id quando a cobranca existente nao pode ser retornada
- **429** — Muitas requisicoes - aguarde alguns segundos
- **500** — Erro interno - tente novamente
- **502** — Gateway indisponivel ou falha ao gerar a cobranca PIX

**Notas importantes:**
- Valores em REAIS com 2 casas decimais (ex: 50.00 = R$50,00)
- Valor minimo: R$ 1,00
- Idempotencia: se voce enviar o mesmo external_id mais de uma vez, a API retorna a transacao existente (200) sem criar uma nova cobranca.
- Split: use amount (valor fixo) OU percent (percentual) em cada regra, nao ambos. O split e calculado sobre o net_amount e so e creditado quando o pagamento for confirmado.
- Pra criar PIX em uma subconta, informe shop_id (a subconta e criada automaticamente no primeiro uso). Pra dividir o valor entre multiplas subcontas, veja "Splits entre Subcontas" na categoria Subcontas.
- splits_preview na resposta mostra a previsao exata da distribuicao antes do pagamento ser confirmado.
- Configure webhook_url para receber notificacao automatica do pagamento, incluindo os splits processados.

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/pix/create' \
  --header 'x-api-key: nxp_live_a089b1f...' \
  --header 'Content-Type: application/json' \
  --data '{
  "amount": 50,
  "description": "Pedido #123",
  "external_id": "pedido-123",
  "webhook_url": "https://sua-api.com/webhooks/pagamentos",
  "expiration": 1800,
  "shop_id": "cliente-joao",
  "split": [
    {
      "user_id": "UUID_DO_USUARIO_DESTINO",
      "amount": 5
    }
  ]
}'
```

---

### GET /api/pix/{id} — Consultar PIX

Consulta o status e detalhes de uma cobranca PIX, incluindo splits processados. O {id} pode ser o UUID interno da transacao, o txid do gateway ou o external_id informado na criacao.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API

**Resposta (200):**
```json
{
  "id": "e2ea6061-54b6-47e2-a098-0fafa560cb6c",
  "txid": "7c9b0bf4e30e4eb2ad50e3e02aabd8b1",
  "external_id": "pedido-123",
  "status": "paid",
  "amount": 50.00,
  "fee": 2.50,
  "fee_percent": 5,
  "net_amount": 47.50,
  "description": "Pagamento via PIX",
  "pix_copia_cola": "00020126580014BR.GOV.BCB.PIX0136...",
  "qr_code_base64": "data:image/png;base64,iVBORw0KGgo...",
  "payer_name": "Joao Silva",
  "payer_document": "***.456.789-**",
  "paid_at": "2024-01-15T10:32:00.000Z",
  "expires_at": "2024-01-15T11:30:00.000Z",
  "created_at": "2024-01-15T10:30:00.000Z",
  "metadata": {},
  "splits": {
    "owner_net_amount": 35.63,
    "details": [
      {
        "shop_id": "cliente-pedro",
        "amount": 11.88,
        "percent": 25,
        "credited": true,
        "credited_at": "2024-01-15T10:32:01.000Z"
      }
    ]
  }
}
```

**Campos da resposta:**
- `id` (string) — ID interno da transacao
- `txid` (string) — ID da transacao no gateway
- `external_id` (string) — Seu ID externo (se informado)
- `status` (string) — pending | paid | expired | cancelled
- `amount` (number) — Valor bruto em reais
- `fee` (number) — Taxa cobrada em reais
- `fee_percent` (number) — Percentual da taxa
- `net_amount` (number) — Valor liquido total (apos taxas)
- `description` (string) — Descricao da cobranca
- `pix_copia_cola` (string) — Codigo PIX copia e cola
- `qr_code_base64` (string) — Imagem do QR Code em base64
- `payer_name` (string | null) — Nome do pagador (apos pagamento)
- `payer_document` (string | null) — CPF/CNPJ mascarado do pagador
- `paid_at` (string | null) — Data/hora do pagamento (se pago)
- `expires_at` (string) — Data/hora de expiracao da cobranca
- `created_at` (string) — Data/hora em que a cobranca foi criada
- `metadata` (object) — Metadados internos e dados adicionais da cobranca
- `shop_id` (string?) — ID interno do shop quando a cobranca veio de shop_id
- `shop_external_ref` (string?) — Referencia externa do shop quando informada
- `splits` (object) — Detalhes dos splits processados (so aparece quando splits ou split foram configurados)
- `splits.owner_net_amount` (number) — Valor que sobrou pra carteira principal/shop apos os splits
- `splits.details` (array) — Lista de splits com status de creditacao. Cada item tem a chave de destino (shop_id, parent ou user_id) e o status credited.
- `splits.details[].shop_id` (string?) — external_ref da subconta de destino (quando o split foi pra outra subconta)
- `splits.details[].parent` (boolean?) — true quando o split foi pra carteira principal
- `splits.details[].user_id` (string?) — UUID do usuario destino (quando o split veio do formato legado user-to-user)
- `splits.details[].amount` (number) — Valor calculado em reais para o destino
- `splits.details[].percent` (number?) — Percentual usado na regra, quando aplicavel
- `splits.details[].credited` (boolean) — Se o split ja foi creditado no destino
- `splits.details[].credited_at` (string?) — Data/hora da creditacao (null se pendente)

**Erros:**
- **401** — API Key invalida
- **404** — Transacao nao encontrada

**Notas importantes:**
- O {id} pode ser o UUID interno, o txid do gateway ou o external_id informado na criacao
- Se o status ainda for "pending", a API verifica no gateway se ja foi pago
- O campo splits mostra o status real dos splits; credited indica se ja foi creditado na conta do destinatario

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/pix/9c29870c-9f69-...' \
  --header 'x-api-key: nxp_live_a089b1f...'
```

---

## México · SPEI

Cobranças em pesos mexicanos (MXN) por CLABE, com splits entre subcontas e crédito em reais após a conversão efetiva.

### POST /api/spei/create — Criar cobrança MXN

Gera uma instrução de recebimento SPEI com CLABE para sua venda no México. Informe um external_id por venda e apresente a CLABE, o banco e o beneficiário retornados ao pagador. A CLABE aceita recebimentos de valor aberto; cada transferência confirmada gera um pagamento próprio.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API. Use apenas no seu servidor.
- `Content-Type` (string) **(required)** — application/json

**Body (JSON):**
- `external_id` (string) **(required)** — Referência da venda no seu sistema, de 1 a 200 bytes em UTF-8. Chave de idempotência por comerciante e subconta.
- `expected_amount_mxn` (number) — Preço esperado em MXN, positivo e com até duas casas decimais. É apenas uma referência: não fixa nem limita o valor que o pagador transfere.
- `description` (string) — Descrição da venda, até 500 bytes em UTF-8.
- `webhook_url` (string) — URL pública do seu servidor para os eventos spei.payment.confirmed e spei.payment.available.
- `shop_id` (string) — UUID ou external_ref da subconta principal. Uma nova referência cria a subconta automaticamente. Obrigatório ao usar splits. Sem shop_id, o recebimento pertence à carteira principal.
- `splits` (array) — Até 10 regras de divisão do líquido, no mesmo formato de subcontas do PIX. Cada regra indica shop_id OU parent: true, e amount OU percent. Valores fixos são em MXN; a soma dos percentuais deve ser menor que 100.
- `splits[].shop_id` (string) — Subconta de destino do mesmo integrador. Não combine com parent: true na mesma regra.
- `splits[].parent` (boolean) — true para direcionar o split à carteira principal do integrador.
- `splits[].amount` (number) — Parcela fixa em MXN, com até duas casas decimais. Não combine com percent.
- `splits[].percent` (number) — Percentual do líquido restante após as parcelas fixas. Não combine com amount.

**Resposta (201):**
```json
{
  "success": true,
  "currency": "MXN",
  "settlement_currency": "BRL",
  "instruction": {
    "id": "b4665812-52ca-4a5e-8917-a730522574aa",
    "external_id": "pedido-mx-123",
    "clabe": "000000000000000000",
    "bank_name": "Banco de exemplo",
    "beneficiary": "Beneficiário de exemplo",
    "expected_amount_mxn": 1000,
    "status": "active",
    "created_at": "2026-09-10T12:00:00Z",
    "shop_id": "5f378f85-b348-405b-b898-f6e4108662d2",
    "splits": [
      {
        "parent": true,
        "amount": 10
      },
      {
        "shop_id": "afiliado-pedro",
        "percent": 10
      }
    ]
  }
}
```

**Campos da resposta:**
- `instruction.id` (string) — UUID da instrução. Guarde para filtrar os pagamentos em GET /api/spei/payments.
- `instruction.clabe` (string) — CLABE de 18 dígitos para o pagador transferir por SPEI. A CLABE deste exemplo é fictícia.
- `instruction.bank_name` (string) — Banco de destino retornado para esta CLABE.
- `instruction.beneficiary` (string) — Beneficiário que deve ser apresentado ao pagador.
- `instruction.expected_amount_mxn` (number | null) — Preço esperado, apenas como referência da venda.
- `instruction.status` (string) — active quando a CLABE foi emitida. Não indica que a venda foi paga.
- `instruction.splits` (array) — Regras de split da instrução. Os valores amount são em MXN; os créditos BRL aparecem em split_credits do pagamento após liquidação.

**Erros:**
- **400** — external_id, valor esperado ou regras de split inválidos.
- **401** — Chave de API ausente ou inválida.
- **403** — Recebimentos internacionais indisponíveis para a conta ou subconta inativa.
- **404** — Subconta não encontrada ou não pertencente ao integrador.
- **409** — external_id já utilizado com dados diferentes.
- **503** — Serviço temporariamente indisponível. Repita com o mesmo external_id e os mesmos dados.

**Notas importantes:**
- POST /api/spei/instructions é um alias compatível. Use /api/spei/create para criar cobranças MXN nesta integração.
- Idempotência: repetir external_id, shop_id e os mesmos dados recupera a mesma instrução. Use um novo external_id para outra venda.
- expected_amount_mxn é opcional e não é enviado para fixar o valor bancário. Compare cada amount_mxn recebido com o preço da venda no seu sistema.
- A mesma CLABE pode receber várias transferências. Não descarte uma nova transferência só porque external_id já foi pago: identifique cada recebimento por payment_id / e2e.
- A tarifa total padrão por recebimento é 6% + MXN 10,00. Consulte /api/spei/config para a tarifa habilitada na sua conta. Por exemplo: MXN 1.000,00 recebidos, MXN 70,00 de tarifa e MXN 930,00 líquidos antes dos splits.
- Use splits (plural), com shop_id no topo. Valores fixos são em MXN; percentuais e o saldo restante são distribuídos sobre o líquido. O crédito dos destinos ocorre em BRL após a conversão efetiva.
- Exemplo de splits: {parent: true, amount: 10} reserva MXN 10,00 para a carteira principal; {shop_id: "afiliado-pedro", percent: 10} destina 10% do restante à subconta. O saldo remanescente pertence ao shop_id principal.
- Se os valores fixos não couberem no recebimento real após a tarifa, o pagamento fica em review, sem crédito automático. O preço esperado não impede pagamentos menores.
- O evento spei.payment.confirmed informa o recebimento em MXN. Aguarde spei.payment.available ou conversion_status = credited para considerar o saldo BRL disponível.
- Não há cotação fixa nem promessa de liberação em 24 horas. converted_amount_brl e exchange_rate só são preenchidos após a conversão efetiva.

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/spei/create' \
  --header 'x-api-key: nxp_live_a089b1f...' \
  --header 'Content-Type: application/json' \
  --data '{
  "external_id": "pedido-mx-123",
  "expected_amount_mxn": 1000,
  "description": "Pedido #123",
  "webhook_url": "https://sua-api.com/webhooks/pagamentos",
  "shop_id": "cliente-joao",
  "splits": [
    {
      "parent": true,
      "amount": 10
    },
    {
      "shop_id": "afiliado-pedro",
      "percent": 10
    }
  ]
}'
```

---

### GET /api/spei/instructions — Listar cobranças MXN

Lista as instruções SPEI do integrador. Uma instrução identifica a CLABE da venda; os valores efetivamente recebidos são consultados em Listar pagamentos SPEI.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API. Use apenas no seu servidor.

**Query params:**
- `page` (integer) — Página, começando em 1.
- `limit` (integer) — Itens por página. Padrão: 30; máximo: 100.

**Resposta (200):**
```json
{
  "success": true,
  "instructions": [
    {
      "id": "b4665812-52ca-4a5e-8917-a730522574aa",
      "external_id": "pedido-mx-123",
      "clabe": "000000000000000000",
      "bank_name": "Banco de exemplo",
      "beneficiary": "Beneficiário de exemplo",
      "expected_amount_mxn": 1000,
      "status": "active",
      "created_at": "2026-09-10T12:00:00Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "pages": 1,
    "limit": 30
  }
}
```

**Notas importantes:**
- A CLABE do exemplo é fictícia. Exiba os dados bancários retornados na resposta real.
- Guarde instruction.id junto ao external_id e shop_id da venda para conciliar os recebimentos.

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/spei/instructions' \
  --header 'x-api-key: nxp_live_a089b1f...'
```

---

### GET /api/spei/payments — Listar pagamentos SPEI

Consulta cada transferência SPEI confirmada e o andamento de sua conversão para BRL. Use instruction_id para localizar todos os recebimentos de uma venda, inclusive transferências repetidas para a mesma CLABE.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API. Use apenas no seu servidor.

**Query params:**
- `page` (integer) — Página, começando em 1.
- `limit` (integer) — Itens por página. Padrão: 30; máximo: 100.
- `instruction_id` (string) — UUID da instrução retornado ao criar a cobrança. Não é o external_id.

**Resposta (200):**
```json
{
  "success": true,
  "payments": [
    {
      "id": "7983fbdf-d780-4a7b-a07b-d2eaa85ba0bd",
      "instruction_id": "b4665812-52ca-4a5e-8917-a730522574aa",
      "external_id": "pedido-mx-123",
      "e2e": "SPEI-EXEMPLO-123",
      "amount_mxn": 1000,
      "fee_mxn": 70,
      "net_amount_mxn": 930,
      "status": "confirmed",
      "conversion_status": "pending",
      "converted_amount_brl": null,
      "exchange_rate": null,
      "credited_at": null,
      "created_at": "2026-09-10T12:02:00Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "pages": 1,
    "limit": 30
  }
}
```

**Campos da resposta:**
- `payments[].id` (string) — UUID único do pagamento. Use para evitar processar o mesmo recebimento duas vezes.
- `payments[].e2e` (string) — Identificador bancário da transferência. Diferencia pagamentos para a mesma CLABE.
- `payments[].amount_mxn` (number) — Valor bruto efetivamente recebido em MXN.
- `payments[].fee_mxn` (number) — Tarifa total do cliente em MXN.
- `payments[].net_amount_mxn` (number) — Líquido em MXN após tarifa e antes dos splits.
- `payments[].conversion_status` (string) — pending: aguardando conversão; processing: convertendo; review: em análise; converted: convertido, aguardando crédito; credited: crédito BRL concluído.
- `payments[].converted_amount_brl` (number | null) — Líquido total do comerciante efetivamente convertido em BRL, antes da distribuição dos splits. null enquanto não convertido.
- `payments[].exchange_rate` (number | null) — Cotação efetiva informada na conversão. Não use uma cotação estimada para creditar saldo.
- `payments[].credited_at` (string | null) — Data/hora do crédito em BRL. null enquanto o crédito não foi concluído.
- `payments[].split_credits` (array) — Distribuição concluída: shop_id ou parent, amount_mxn (parcela em pesos) e amount_brl (crédito real em reais). Ausente antes do crédito.

**Notas importantes:**
- Os valores com sufixo _mxn e _brl são de moedas distintas. Não some MXN ao saldo BRL.
- status = confirmed confirma o recebimento em MXN. Disponibilidade em reais exige conversion_status = credited.
- A consulta lê os pagamentos já conciliados pela plataforma; receber uma CLABE ativa não comprova pagamento. Use os webhooks e esta listagem para acompanhar.

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/spei/payments' \
  --header 'x-api-key: nxp_live_a089b1f...'
```

---

### GET /api/spei/config — Consultar tarifa SPEI

Informa se a conta pode criar cobranças MXN e qual tarifa total se aplica aos novos recebimentos.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API. Use apenas no seu servidor.

**Resposta (200):**
```json
{
  "success": true,
  "enabled": true,
  "currency": "MXN",
  "settlement_currency": "BRL",
  "client_pct": 6,
  "client_fixed_mxn": 10
}
```

**Notas importantes:**
- Os números do exemplo são os valores padrão; utilize a configuração retornada para a sua conta.
- Quando enabled = false, não crie novas cobranças. Os campos de tarifa podem estar ausentes.

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/spei/config' \
  --header 'x-api-key: nxp_live_a089b1f...'
```

---

### POST Sua URL configurada — Webhook · SPEI confirmado

Evento spei.payment.confirmed enviado após confirmar o recebimento em MXN. A conversão e o crédito BRL ainda podem estar pendentes.

**Headers:**
- `Content-Type` (string) **(required)** — application/json
- `X-Webhook-Event` (string) **(required)** — spei.payment.confirmed
- `X-Webhook-Signature` (string) — HMAC-SHA256 no formato t=<unix>,v1=<hmac_hex>, quando houver webhook_secret configurado.

**Resposta (200):**
```json
{
  "event_id": "246c6848-2713-420d-b6d8-06b8ac8aaf33",
  "event": "spei.payment.confirmed",
  "type": "cashin",
  "rail": "SPEI",
  "currency": "MXN",
  "settlement_currency": "BRL",
  "payment_id": "7983fbdf-d780-4a7b-a07b-d2eaa85ba0bd",
  "instruction_id": "b4665812-52ca-4a5e-8917-a730522574aa",
  "external_id": "pedido-mx-123",
  "e2e": "SPEI-EXEMPLO-123",
  "amount": 1000,
  "fee": 70,
  "net_amount": 930,
  "status": "confirmed",
  "conversion_status": "pending",
  "converted_amount_brl": null,
  "exchange_rate": null,
  "credited_at": null,
  "shop_id": "5f378f85-b348-405b-b898-f6e4108662d2",
  "splits": [
    {
      "parent": true,
      "amount": 10
    },
    {
      "shop_id": "afiliado-pedro",
      "percent": 10
    }
  ],
  "split_credits": null
}
```

**Notas importantes:**
- Este JSON é o corpo enviado por POST para seu webhook_url ou endpoint global inscrito no evento (ou *). Não é uma chamada que seu servidor deve fazer à API.
- No webhook, amount, fee e net_amount estão na moeda declarada em currency: MXN. Na consulta /api/spei/payments, os mesmos campos usam o sufixo _mxn.
- splits contém as regras solicitadas. Após o crédito, split_credits informa a parcela MXN e o crédito BRL de cada destino. O restante de converted_amount_brl pertence à subconta principal, incluindo os centavos residuais da divisão.
- Configure webhook_secret e valide HMAC-SHA256 de "<unix>.<body_cru>" antes de processar. Compare a assinatura em tempo constante e rejeite timestamps fora da sua janela de tolerância.
- Responda com 2xx após persistir o evento. Trate reentregas de modo idempotente por event + payment_id; os eventos confirmed e available são etapas diferentes do mesmo pagamento.
- A ordem de chegada dos webhooks pode variar. Não regrida um crédito já confirmado ao receber uma reentrega de confirmed. Consulte /api/spei/payments para o estado atual.
- A cotação e os valores BRL apresentados no exemplo são fictícios. A disponibilidade depende da conversão e do crédito efetivos, sem prazo fixo de 24 horas.

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.comSua URL configurada' \
  --header 'x-api-key: nxp_live_a089b1f...' \
  --header 'Content-Type: application/json'
```

---

### POST Sua URL configurada — Webhook · SPEI disponível em BRL

Evento spei.payment.available enviado após a conversão efetiva e o crédito em BRL, incluindo a distribuição dos splits configurados.

**Headers:**
- `Content-Type` (string) **(required)** — application/json
- `X-Webhook-Event` (string) **(required)** — spei.payment.available
- `X-Webhook-Signature` (string) — HMAC-SHA256 no formato t=<unix>,v1=<hmac_hex>, quando houver webhook_secret configurado.

**Resposta (200):**
```json
{
  "event_id": "246c6848-2713-420d-b6d8-06b8ac8aaf33",
  "event": "spei.payment.available",
  "type": "cashin",
  "rail": "SPEI",
  "currency": "MXN",
  "settlement_currency": "BRL",
  "payment_id": "7983fbdf-d780-4a7b-a07b-d2eaa85ba0bd",
  "instruction_id": "b4665812-52ca-4a5e-8917-a730522574aa",
  "external_id": "pedido-mx-123",
  "e2e": "SPEI-EXEMPLO-123",
  "amount": 1000,
  "fee": 70,
  "net_amount": 930,
  "status": "confirmed",
  "conversion_status": "credited",
  "converted_amount_brl": 251.38,
  "exchange_rate": 0.27029,
  "credited_at": "2026-09-10T12:05:00Z",
  "shop_id": "5f378f85-b348-405b-b898-f6e4108662d2",
  "splits": [
    {
      "parent": true,
      "amount": 10
    },
    {
      "shop_id": "afiliado-pedro",
      "percent": 10
    }
  ],
  "split_credits": [
    {
      "parent": true,
      "amount_mxn": 10,
      "amount_brl": 2.7
    },
    {
      "shop_id": "afiliado-pedro",
      "amount_mxn": 92,
      "amount_brl": 24.86
    }
  ]
}
```

**Notas importantes:**
- Este JSON é o corpo enviado por POST para seu webhook_url ou endpoint global inscrito no evento (ou *). Não é uma chamada que seu servidor deve fazer à API.
- No webhook, amount, fee e net_amount estão na moeda declarada em currency: MXN. Na consulta /api/spei/payments, os mesmos campos usam o sufixo _mxn.
- splits contém as regras solicitadas. Após o crédito, split_credits informa a parcela MXN e o crédito BRL de cada destino. O restante de converted_amount_brl pertence à subconta principal, incluindo os centavos residuais da divisão.
- Configure webhook_secret e valide HMAC-SHA256 de "<unix>.<body_cru>" antes de processar. Compare a assinatura em tempo constante e rejeite timestamps fora da sua janela de tolerância.
- Responda com 2xx após persistir o evento. Trate reentregas de modo idempotente por event + payment_id; os eventos confirmed e available são etapas diferentes do mesmo pagamento.
- A ordem de chegada dos webhooks pode variar. Não regrida um crédito já confirmado ao receber uma reentrega de confirmed. Consulte /api/spei/payments para o estado atual.
- A cotação e os valores BRL apresentados no exemplo são fictícios. A disponibilidade depende da conversão e do crédito efetivos, sem prazo fixo de 24 horas.

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.comSua URL configurada' \
  --header 'x-api-key: nxp_live_a089b1f...' \
  --header 'Content-Type: application/json'
```

---

## Subcontas

Sub-contas com saldo proprio para integradores. Cada subconta tem carteira independente, recebe pagamentos via shop_id na criacao do PIX, e pode sacar diretamente.

### POST /api/pix/create — Splits entre Subcontas

Quando voce cria um PIX em uma subconta (shop_id), pode dividir o valor liquido entre outras subcontas, a carteira principal (parent) e a propria subconta destino, usando o campo splits (plural). Esta pagina documenta SOMENTE os campos relacionados a divisao em subcontas — o endpoint completo (POST /api/pix/create) esta documentado em "Criar Cobranca PIX" na categoria PIX.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API
- `Content-Type` (string) **(required)** — application/json

**Body (JSON):**
- `shop_id` (string) **(required)** — Identificador (external_ref) da subconta destino principal. OBRIGATORIO quando usar splits. A subconta e criada automaticamente no primeiro uso.
- `splits` (array) — Regras de divisao entre subcontas/parent. Cada item tem (shop_id OU parent: true) + (amount OU percent). Maximo 10. Calculo: fixos primeiro, depois percentuais sobre o restante, o remanescente vai pra subconta principal (shop_id top-level).
- `splits[].shop_id` (string) — external_ref de outra subconta que vai receber este split. Criada automaticamente se nao existir. Mutuamente exclusivo com parent.
- `splits[].parent` (boolean) — Quando true, este split vai pra carteira principal do dono da API key (em vez de uma subconta). Mutuamente exclusivo com shop_id.
- `splits[].amount` (number) — Valor fixo em reais (ex: 0.50 = R$0,50). Mutuamente exclusivo com percent.
- `splits[].percent` (number) — Percentual do valor que sobrou apos os splits fixos. Mutuamente exclusivo com amount.

**Resposta (200):**
```json
{
  "success": true,
  "transaction": {
    "id": "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
    "txid": "1919700995",
    "external_id": "pedido-123",
    "amount": 50.00,
    "fee": 2.50,
    "fee_percent": 5,
    "net_amount": 47.50,
    "status": "pending",
    "shop_id": "d3a8...",
    "shop_external_ref": "cliente-joao",
    "pix_copia_cola": "00020126580014BR.GOV.BCB.PIX0136...",
    "qr_code_base64": "data:image/png;base64,iVBORw0KGgo...",
    "expires_at": "2024-01-15T11:30:00.000Z",
    "splits_preview": {
      "owner_net_amount": 42.25,
      "splits": [
        { "parent": true, "amount": 0.50 },
        { "shop_id": "afiliado-pedro", "percent": 10, "amount": 4.70 }
      ]
    }
  }
}
```

**Campos da resposta:**
- `transaction.shop_id` (string) — UUID interno da subconta destino principal
- `transaction.shop_external_ref` (string) — O shop_id que voce informou (external_ref da subconta)
- `transaction.splits_preview` (object) — Previsao da distribuicao antes do pagamento. Aparece sempre que splits ou split foram informados.
- `transaction.splits_preview.owner_net_amount` (number) — Valor que sobra pra subconta destino principal (shop_id top-level) apos todos os splits
- `transaction.splits_preview.splits[]` (array) — Lista de splits com chave de destino (shop_id, parent ou user_id legado), amount e percent quando aplicavel

**Erros:**
- **400** — splits informado sem shop_id top-level.
- **400** — Regra invalida em splits[]: faltando shop_id E parent; faltando amount E percent; amount e percent enviados juntos (sao mutuamente exclusivos).
- **400** — Soma dos splits[].percent atingiu ou ultrapassou 100. Mais de 10 regras de split em um unico payload.
- **400** — Atencao: soma dos splits[].amount fixos maior que o restante NAO retorna erro; itens que excederem o saldo restante sao silenciosamente descartados na hora do processamento (webhook). Valide antes de enviar.
- **401** — API Key invalida ou nao fornecida

**Notas importantes:**
- O endpoint e o MESMO de "Criar Cobranca PIX" (POST /api/pix/create). Esta pagina destaca SO os campos de divisao em subcontas pra ficar claro o que muda.
- shop_id no payload TOP-LEVEL e a subconta destino principal (recebe o que sobrar). shop_id DENTRO de splits[] e uma subconta que recebe parte do valor.
- parent: true direciona o split pra carteira principal (a carteira dona da API key) em vez de pra outra subconta.
- Ordem do calculo: taxa da plataforma -> splits[] fixos (amount) -> splits[] percentuais (percent sobre o restante) -> remanescente vai pra subconta destino principal.
- Subcontas referenciadas via shop_id sao criadas automaticamente no primeiro uso, igual quando voce cria um PIX comum em subconta.
- O split (singular) user-to-user continua disponivel em "Criar Cobranca PIX" — pode coexistir com splits (plural) no mesmo payload.
- Veja "Detalhe da Subconta" e "Saldo da Subconta" pra consultar quanto cada subconta recebeu via splits.

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/pix/create' \
  --header 'x-api-key: nxp_live_a089b1f...' \
  --header 'Content-Type: application/json' \
  --data '{
  "shop_id": "cliente-joao",
  "splits": [
    {
      "parent": true,
      "amount": 0.5
    },
    {
      "shop_id": "afiliado-pedro",
      "percent": 10
    }
  ]
}'
```

---

### GET /api/shops — Listar Subcontas

Retorna a lista paginada de subcontas vinculadas a sua conta. Permite busca por nome ou external_ref.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API

**Query params:**
- `page` (integer) — Pagina (padrao: 1)
- `limit` (integer) — Itens por pagina (padrao: 20, maximo: 100)
- `search` (string) — Filtra por external_ref ou name (busca parcial, case-insensitive)

**Resposta (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
      "name": "Loja do Joao",
      "external_ref": "usuario_joao",
      "email": "joao@exemplo.com",
      "wallet_balance": 152.30,
      "blocked_balance": 0.00,
      "pix_key": "12345678900",
      "pix_key_type": "cpf",
      "is_active": true,
      "created_at": "2024-01-10T14:22:00.000Z",
      "updated_at": "2024-01-15T10:32:00.000Z"
    }
  ],
  "total": 47,
  "page": 1,
  "limit": 20
}
```

**Campos da resposta:**
- `success` (boolean) — Indica sucesso da requisicao
- `data` (array) — Lista de subcontas
- `data[].id` (string) — UUID interno da subconta
- `data[].name` (string) — Nome de exibicao da subconta
- `data[].external_ref` (string) — Sua referencia externa (shop_id usado na criacao do PIX)
- `data[].email` (string?) — Email da subconta. Omitido quando nao informado.
- `data[].wallet_balance` (number) — Saldo disponivel para saque (em reais)
- `data[].blocked_balance` (number) — Saldo bloqueado (saques pendentes)
- `data[].pix_key` (string?) — Chave PIX padrao para saque. Omitido quando nao configurada.
- `data[].pix_key_type` (string?) — cpf | cnpj | email | phone | random. Omitido quando nao configurado.
- `data[].is_active` (boolean) — Se a subconta esta ativa
- `data[].created_at` (string) — Data de criacao (ISO 8601)
- `data[].updated_at` (string) — Ultima atualizacao (ISO 8601)
- `total` (integer) — Total de subcontas (sem considerar paginacao)
- `page` (integer) — Pagina atual
- `limit` (integer) — Itens por pagina

**Erros:**
- **401** — API Key invalida ou nao fornecida

**Notas importantes:**
- Subcontas sao criadas automaticamente no primeiro POST /api/pix/create com shop_id informado
- O external_ref e a string que voce passa em shop_id (qualquer identificador do seu sistema)
- Use search pra encontrar subcontas pelo external_ref ou nome (busca parcial, case-insensitive)
- Campos opcionais (email, pix_key, pix_key_type) sao omitidos do JSON quando nao informados

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/shops' \
  --header 'x-api-key: nxp_live_a089b1f...'
```

---

### GET /api/shops/{id} — Detalhe da Subconta

Retorna os dados completos de uma subconta. O {id} pode ser o UUID interno ou o external_ref informado por voce.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API

**Resposta (200):**
```json
{
  "success": true,
  "shop": {
    "id": "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
    "name": "Loja do Joao",
    "external_ref": "usuario_joao",
    "email": "joao@exemplo.com",
    "wallet_balance": 152.30,
    "blocked_balance": 0.00,
    "pix_key": "12345678900",
    "pix_key_type": "cpf",
    "is_active": true,
    "created_at": "2024-01-10T14:22:00.000Z",
    "updated_at": "2024-01-15T10:32:00.000Z"
  }
}
```

**Campos da resposta:**
- `success` (boolean) — Indica sucesso da requisicao
- `shop` (object) — Dados da subconta
- `shop.id` (string) — UUID interno da subconta
- `shop.name` (string) — Nome de exibicao
- `shop.external_ref` (string) — Sua referencia externa
- `shop.email` (string?) — Email da subconta. Omitido quando nao informado.
- `shop.wallet_balance` (number) — Saldo disponivel (em reais)
- `shop.blocked_balance` (number) — Saldo bloqueado
- `shop.pix_key` (string?) — Chave PIX padrao para saque. Omitido quando nao configurada.
- `shop.pix_key_type` (string?) — cpf | cnpj | email | phone | random. Omitido quando nao configurado.
- `shop.is_active` (boolean) — Se esta ativa
- `shop.created_at` (string) — Data de criacao
- `shop.updated_at` (string) — Ultima atualizacao

**Erros:**
- **401** — API Key invalida
- **404** — Subconta nao encontrada

**Notas importantes:**
- O {id} aceita tanto o UUID interno quanto o external_ref (shop_id)
- A busca e sempre scoped pela sua conta — voce so ve subcontas suas
- Campos opcionais (email, pix_key, pix_key_type) sao omitidos do JSON quando nao informados

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/shops/9c29870c-9f69-...' \
  --header 'x-api-key: nxp_live_a089b1f...'
```

---

### GET /api/shops/{id}/balance — Saldo da Subconta

Retorna o saldo atual e estatisticas agregadas (total recebido, sacado, splits) de uma subconta.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API

**Resposta (200):**
```json
{
  "success": true,
  "wallet_balance": 152.30,
  "blocked_balance": 0.00,
  "external_ref": "usuario_joao",
  "total_received_gross": 500.00,
  "total_received_net": 475.00,
  "total_transactions": 12,
  "total_paid_transactions": 10,
  "total_withdrawn": 322.70,
  "total_withdrawals": 4,
  "completed_withdrawals": 4,
  "splits_received": 0.00,
  "splits_received_count": 0,
  "splits_paid": 0.00,
  "splits_paid_count": 0
}
```

**Campos da resposta:**
- `success` (boolean) — Indica sucesso
- `wallet_balance` (number) — Saldo disponivel para saque (em reais)
- `blocked_balance` (number) — Saldo bloqueado (saques em processamento)
- `external_ref` (string) — Referencia externa da subconta
- `total_received_gross` (number) — Total bruto recebido (antes de taxas)
- `total_received_net` (number) — Total liquido recebido (apos taxas e splits)
- `total_transactions` (integer) — Total de transacoes (todas as status)
- `total_paid_transactions` (integer) — Total de transacoes pagas
- `total_withdrawn` (number) — Total ja sacado (incluindo taxas)
- `total_withdrawals` (integer) — Quantidade total de saques
- `completed_withdrawals` (integer) — Quantidade de saques completados
- `splits_received` (number) — Total recebido via splits de outras subcontas
- `splits_received_count` (integer) — Quantidade de splits recebidos
- `splits_paid` (number) — Total pago em splits para outras subcontas
- `splits_paid_count` (integer) — Quantidade de splits pagos

**Erros:**
- **401** — API Key invalida
- **404** — Subconta nao encontrada

**Notas importantes:**
- wallet_balance e o valor disponivel para saque imediato
- total_received_net leva em conta apenas o que efetivamente entrou nessa subconta (apos splits)
- Use esses valores pra exibir um dashboard financeiro pra cada subconta

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/shops/9c29870c-9f69-.../balance' \
  --header 'x-api-key: nxp_live_a089b1f...'
```

---

### GET /api/shops/{id}/transactions — Transacoes da Subconta

Lista as transacoes de uma subconta — inclui pagamentos PIX recebidos e splits recebidos de outras subcontas, ordenado por data decrescente.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API

**Query params:**
- `page` (integer) — Pagina (padrao: 1)
- `limit` (integer) — Itens por pagina (padrao: 20, maximo: 100)

**Resposta (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
      "type": "pix_in",
      "amount": 50.00,
      "fee": 2.50,
      "net_amount": 47.50,
      "status": "paid",
      "description": "Pedido #123",
      "external_id": "pedido-123",
      "payer_name": "Joao Silva",
      "payer_document": "***.456.789-**",
      "paid_at": "2024-01-15T10:32:00.000Z",
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total": 47,
  "page": 1,
  "limit": 20,
  "stats": {
    "total_received": 475.00,
    "total_transactions": 10,
    "total_splits_received": 0.00,
    "splits_received_count": 0,
    "total_splits_paid": 0.00,
    "splits_paid_count": 0,
    "total_withdrawn": 322.70,
    "total_withdrawals": 4
  }
}
```

**Campos da resposta:**
- `success` (boolean) — Indica sucesso
- `data` (array) — Lista unificada de transacoes (pix_in + splits)
- `data[].id` (string) — ID da transacao ou ledger entry
- `data[].type` (string) — pix_in (pagamento recebido) ou split_received (split de outra subconta)
- `data[].amount` (number) — Valor bruto em reais
- `data[].fee` (number) — Taxa cobrada (sempre 0 para split_received)
- `data[].net_amount` (number) — Valor liquido creditado na subconta
- `data[].status` (string) — Status da transacao
- `data[].description` (string | null) — Descricao
- `data[].external_id` (string | null) — Seu ID externo (apenas para pix_in)
- `data[].payer_name` (string | null) — Nome do pagador (apenas para pix_in)
- `data[].payer_document` (string | null) — CPF/CNPJ mascarado do pagador
- `data[].source_shop` (string) — External_ref da subconta de origem (apenas para split_received)
- `data[].paid_at` (string | null) — Data do pagamento
- `data[].created_at` (string) — Data de criacao
- `total` (integer) — Total de itens (pix_in + splits)
- `page` (integer) — Pagina atual
- `limit` (integer) — Itens por pagina
- `stats` (object) — Estatisticas agregadas da subconta

**Erros:**
- **401** — API Key invalida
- **404** — Subconta nao encontrada

**Notas importantes:**
- A lista combina dois tipos de entrada: pix_in (cobrancas pagas) e split_received (splits de outras subcontas)
- Use o campo type pra distinguir os dois casos
- O campo stats traz totais agregados (uteis pra dashboard)

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/shops/9c29870c-9f69-.../transactions' \
  --header 'x-api-key: nxp_live_a089b1f...'
```

---

### POST /api/shops/{id}/withdraw — Sacar Saldo da Subconta

Realiza um saque PIX direto do saldo de uma subconta. O valor e debitado atomicamente do wallet_balance da subconta. Cooldown de 5 minutos entre saques (scoped por sub_shop_id quando informado).

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API
- `Content-Type` (string) **(required)** — application/json

**Body (JSON):**
- `amount` (number) **(required)** — Valor do saque em reais (ex: 50.00). Minimo configurado pela plataforma (padrao R$ 10,00).
- `pix_key` (string) **(required)** — Chave PIX de destino. Obrigatoria, exceto se a subconta tiver chave PIX padrao configurada.
- `pix_key_type` (string) **(required)** — Tipo da chave: cpf | cnpj | email | phone | random | qrc (PIX copia-e-cola)
- `totp_code` (string) — Codigo 2FA. Ignorado quando autenticado via x-api-key (a chave secreta ja autentica). Use apenas se chamar via JWT do painel com 2FA ativo.
- `webhook_url` (string) — URL para receber notificacao do status do saque
- `correlation_id` (string) — ID idempotente para o saque. Se ja existir um saque com esse correlation_id, retorna o existente sem criar novo. Funciona como protecao contra retries.
- `sub_shop_id` (string) — Identificador opcional do usuario final no seu sistema. Quando informado, o cooldown de 5 min e scoped por (subconta, sub_shop_id), permitindo saques paralelos para usuarios distintos.

**Resposta (200):**
```json
{
  "success": true,
  "withdrawal_id": "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
  "amount": 50.00,
  "fee": 2.00,
  "net_amount": 50.00,
  "status": "completed",
  "new_balance": 100.30
}
```

**Campos da resposta:**
- `success` (boolean) — Indica sucesso
- `withdrawal_id` (string) — UUID do saque criado
- `amount` (number) — Valor sacado (apos eventual ajuste por limite)
- `fee` (number) — Taxa cobrada pelo saque
- `net_amount` (number) — Valor liquido enviado (mesmo que amount)
- `status` (string) — completed | processing — completed e final, processing ainda sera confirmado
- `new_balance` (number) — Novo saldo da subconta apos o debito
- `idempotent` (boolean) — true se o saque ja existia (retornado por correlation_id)

**Erros:**
- **400** — Valor invalido, abaixo do minimo, chave PIX faltando ou codigo 2FA invalido
- **401** — API Key invalida
- **403** — Saques desabilitados pela plataforma ou conta nao verificada
- **404** — Subconta nao encontrada
- **429** — Cooldown de 5 min entre saques (campo cooldown_seconds traz o tempo restante)
- **502** — Falha no gateway PIX

**Notas importantes:**
- Valor minimo: R$ 10,00 (configurado pela plataforma)
- Cooldown: 5 minutos entre saques. Use sub_shop_id pra ter cooldown independente por usuario final.
- Via x-api-key, NAO precisa de totp_code mesmo com 2FA ativo na conta (a chave secreta autentica o saque). 2FA so eh exigido em chamadas via JWT do painel.
- O valor e ajustado automaticamente caso exceda o limite por transacao ou o saldo disponivel.
- Idempotencia: passe correlation_id pra evitar duplicacao em retries (rede instavel, double-fire do client).
- Status processing significa que o saque foi enviado ao gateway mas ainda nao confirmado — use webhook_url ou consulte GET /api/shops/{id}/withdrawals.
- Em caso de timeout no gateway, o saque fica como processing e o saldo nao e estornado (verificacao assincrona).

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/shops/9c29870c-9f69-.../withdraw' \
  --header 'x-api-key: nxp_live_a089b1f...' \
  --header 'Content-Type: application/json' \
  --data '{
  "amount": 50,
  "pix_key": "12345678900",
  "pix_key_type": "cpf",
  "totp_code": "123456",
  "webhook_url": "https://sua-api.com/webhooks/pagamentos",
  "correlation_id": "saque-pedido-123",
  "sub_shop_id": "usuario-final-47"
}'
```

---

### GET /api/shops/{id}/withdrawals — Historico de Saques

Lista paginada dos saques de uma subconta, ordenada por data decrescente.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API

**Query params:**
- `page` (integer) — Pagina (padrao: 1)
- `limit` (integer) — Itens por pagina (padrao: 20, maximo: 100)

**Resposta (200):**
```json
{
  "success": true,
  "withdrawals": [
    {
      "id": "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
      "amount": 50.00,
      "fee": 2.00,
      "net_amount": 50.00,
      "pix_key_type": "cpf",
      "pix_key": "12345678900",
      "status": "completed",
      "gateway_txid": "1919700995",
      "gateway_e2eid": "E18236120202401151032s5G3Q9NaQpQ",
      "failure_reason": null,
      "processed_at": "2024-01-15T10:32:05.000Z",
      "created_at": "2024-01-15T10:32:00.000Z",
      "updated_at": "2024-01-15T10:32:05.000Z"
    }
  ],
  "total": 4,
  "page": 1,
  "limit": 20
}
```

**Campos da resposta:**
- `success` (boolean) — Indica sucesso
- `withdrawals` (array) — Lista de saques
- `withdrawals[].id` (string) — UUID do saque
- `withdrawals[].amount` (number) — Valor sacado em reais
- `withdrawals[].fee` (number) — Taxa cobrada
- `withdrawals[].net_amount` (number) — Valor liquido (calculado pelo banco)
- `withdrawals[].pix_key_type` (string) — cpf | cnpj | email | phone | random
- `withdrawals[].pix_key` (string) — Chave PIX de destino
- `withdrawals[].status` (string) — pending | processing | completed | failed
- `withdrawals[].gateway_txid` (string | null) — ID da transacao no gateway
- `withdrawals[].gateway_e2eid` (string | null) — EndToEnd ID do PIX (rastreabilidade)
- `withdrawals[].failure_reason` (string | null) — Motivo da falha (se status = failed)
- `withdrawals[].processed_at` (string | null) — Data em que o saque foi processado
- `withdrawals[].created_at` (string) — Data de criacao
- `withdrawals[].updated_at` (string) — Ultima atualizacao
- `total` (integer) — Total de saques
- `page` (integer) — Pagina atual
- `limit` (integer) — Itens por pagina

**Erros:**
- **401** — API Key invalida
- **404** — Subconta nao encontrada

**Notas importantes:**
- Use gateway_e2eid pra rastrear o PIX no extrato bancario
- Saques com status processing podem ainda mudar pra completed ou failed

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/shops/9c29870c-9f69-.../withdrawals' \
  --header 'x-api-key: nxp_live_a089b1f...'
```

---

## Saldo

Consulta de saldo da carteira principal. Pra saldo de subconta, veja "Saldo da Subconta" na categoria Subcontas.

### GET /api/wallet — Saldo da Carteira Principal

Retorna o saldo disponivel, bloqueado e pendente da carteira principal (a carteira do dono da API key), alem de estatisticas agregadas do mes corrente.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API

**Resposta (200):**
```json
{
  "success": true,
  "wallet_balance": 1530.75,
  "blocked_balance": 0.00,
  "pending_balance": 285.50,
  "available": 1530.75,
  "this_month": {
    "gross": 5210.00,
    "net": 4949.50,
    "transactions": 87
  },
  "monthly_change": 18.50,
  "monthly_goal": {
    "target": 0,
    "current": 5210.00,
    "percent": 0
  },
  "cash_flow": {
    "inflow": 4949.50,
    "outflow": 750.00,
    "inflow_percent": 86.84,
    "outflow_percent": 13.16
  },
  "week_data": [
    { "day": "Dom", "val": 0.00 },
    { "day": "Seg", "val": 320.00 },
    { "day": "Ter", "val": 480.50 },
    { "day": "Qua", "val": 290.00 },
    { "day": "Qui", "val": 660.00 },
    { "day": "Sex", "val": 1010.50 },
    { "day": "Sab", "val": 540.00 }
  ]
}
```

**Campos da resposta:**
- `success` (boolean) — Indica sucesso
- `wallet_balance` (number) — Saldo disponivel para saque (em reais)
- `blocked_balance` (number) — Saldo bloqueado por saques em processamento
- `pending_balance` (number) — Total em cobrancas PIX ainda nao pagas (status pending)
- `available` (number) — Alias de wallet_balance (compat)
- `this_month.gross` (number) — Total bruto recebido no mes corrente (antes de taxas)
- `this_month.net` (number) — Total liquido recebido no mes corrente
- `this_month.transactions` (integer) — Quantidade de pix_in pagas no mes corrente
- `monthly_change` (number) — Variacao percentual do bruto vs mes anterior (positivo = cresceu)
- `cash_flow.inflow` (number) — Total liquido recebido no mes corrente
- `cash_flow.outflow` (number) — Total debitado em saques processando ou concluidos no mes corrente, incluindo taxas
- `cash_flow.inflow_percent` (number) — Percentual das entradas sobre o fluxo financeiro do mes
- `cash_flow.outflow_percent` (number) — Percentual das saidas sobre o fluxo financeiro do mes
- `week_data` (array) — Faturamento bruto por dia dos ultimos 7 dias (uso em grafico de barras)

**Erros:**
- **401** — API Key invalida ou nao fornecida

**Notas importantes:**
- Reflete o saldo da CARTEIRA PRINCIPAL (do dono da API key). Pra saldo de uma subconta especifica use GET /api/shops/{id}/balance.
- pending_balance soma as cobrancas com status pending (ainda nao foram pagas). NAO entra em wallet_balance.
- blocked_balance representa o valor de saques que ja foram debitados do disponivel mas ainda nao confirmados pelo gateway.
- monthly_change e calculado como (este_mes - mes_passado) / mes_passado * 100. Retorna 0 se mes_passado for 0.
- week_data sempre traz 7 entradas mesmo quando dias nao tiveram movimento (val = 0).

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/wallet' \
  --header 'x-api-key: nxp_live_a089b1f...'
```

---

## Saques

Saques PIX da carteira principal. Pra saques de uma subconta veja "Sacar Saldo da Subconta" e "Historico de Saques" na categoria Subcontas.

### POST /api/withdrawals — Criar Saque

Realiza um saque PIX da carteira principal. O valor e debitado atomicamente do wallet_balance. Cooldown de 5 minutos entre saques pessoais (separado dos saques de subconta).

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API
- `Content-Type` (string) **(required)** — application/json

**Body (JSON):**
- `amount` (number) **(required)** — Valor do saque em reais. Acima de zero e ate o saldo disponivel.
- `pix_key` (string) **(required)** — Chave PIX de destino. Pra qrc (copia-e-cola), passe o codigo completo aqui.
- `pix_key_type` (string) **(required)** — Tipo da chave: cpf | cnpj | email | phone | random | qrc
- `totp_code` (string) — Codigo 2FA. Ignorado quando autenticado via x-api-key (a chave secreta ja autentica). Use apenas se chamar via JWT do painel com 2FA ativo.

**Resposta (200):**
```json
{
  "success": true,
  "withdrawal_id": "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
  "amount": 50.00,
  "fee": 1.50,
  "net_amount": 50.00,
  "status": "completed",
  "new_balance": 1480.75
}
```

**Campos da resposta:**
- `success` (boolean) — Indica sucesso
- `withdrawal_id` (string) — UUID do saque criado
- `amount` (number) — Valor sacado em reais (pode ter sido ajustado por limite/saldo)
- `fee` (number) — Taxa cobrada pelo saque
- `net_amount` (number) — Valor liquido enviado ao destinatario PIX (= amount)
- `status` (string) — completed (final) | processing (gateway timeout, sera verificado async)
- `new_balance` (number) — Saldo da carteira principal apos o debito

**Erros:**
- **400** — Valor invalido, chave PIX faltando, pix_key_type invalido, ou codigo 2FA invalido.
- **401** — API Key invalida
- **403** — Saques desabilitados pela plataforma (campo requires_kyc=true se conta nao verificada).
- **429** — Cooldown de 5 min entre saques pessoais ativo. Campo cooldown_seconds traz o tempo restante.
- **500** — Erro interno (gateway indisponivel, debito falhou).
- **502** — Falha no gateway PIX.

**Notas importantes:**
- Cooldown de 5 minutos entre saques DA CARTEIRA PRINCIPAL. Saques de subconta tem cooldown proprio (scoped por shop).
- Via x-api-key, NAO precisa de totp_code mesmo com 2FA ativo na conta (a chave secreta autentica o saque). 2FA so eh exigido em chamadas via JWT do painel.
- Conta nao verificada (KYC pendente) nao pode sacar — retorna 403 com requires_kyc=true.
- Status processing significa timeout no gateway: o saque foi enviado mas a confirmacao ficou pendente. NAO retentar (saldo ja foi debitado) — consulte GET /api/withdrawals depois.
- O backend nao ESTORNA saldo automaticamente em timeout (processo de reconciliacao assincrona valida e estorna se necessario).
- Valide a chave PIX do lado do integrador antes de enviar (formato, digitos, etc) — saque com chave invalida falha no gateway.

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/withdrawals' \
  --header 'x-api-key: nxp_live_a089b1f...' \
  --header 'Content-Type: application/json' \
  --data '{
  "amount": 50,
  "pix_key": "12345678900",
  "pix_key_type": "cpf",
  "totp_code": "123456"
}'
```

---

### GET /api/withdrawals — Listar Saques

Lista paginada dos saques da carteira principal, ordenada por data de criacao decrescente.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API

**Query params:**
- `page` (integer) — Pagina (padrao: 1)
- `limit` (integer) — Itens por pagina (padrao: 20, maximo: 100)

**Resposta (200):**
```json
{
  "success": true,
  "withdrawals": [
    {
      "id": "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
      "user_id": "693b4248-1290-4873-8d16-438e7ae9568b",
      "amount": 50.00,
      "fee": 1.50,
      "net_amount": 50.00,
      "pix_key_type": "cpf",
      "pix_key": "12345678900",
      "status": "completed",
      "gateway_txid": "1919700995",
      "gateway_e2eid": "E18236120202401151032s5G3Q9NaQpQ",
      "failure_reason": null,
      "processed_at": "2024-01-15T10:32:05.000Z",
      "created_at": "2024-01-15T10:32:00.000Z",
      "updated_at": "2024-01-15T10:32:05.000Z"
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

**Campos da resposta:**
- `success` (boolean) — Indica sucesso
- `withdrawals` (array) — Lista de saques
- `withdrawals[].id` (string) — UUID do saque
- `withdrawals[].user_id` (string) — UUID do dono do saque (= dono da API key)
- `withdrawals[].amount` (number) — Valor sacado em reais
- `withdrawals[].fee` (number) — Taxa cobrada
- `withdrawals[].net_amount` (number) — Valor liquido enviado
- `withdrawals[].pix_key_type` (string) — cpf | cnpj | email | phone | random | qrc
- `withdrawals[].pix_key` (string) — Chave PIX de destino
- `withdrawals[].status` (string) — pending | processing | completed | failed
- `withdrawals[].gateway_txid` (string | null) — ID da transacao no gateway PIX
- `withdrawals[].gateway_e2eid` (string | null) — EndToEnd ID do PIX (rastreio bancario)
- `withdrawals[].failure_reason` (string | null) — Motivo da falha (se status = failed)
- `withdrawals[].processed_at` (string | null) — Data do processamento no gateway
- `withdrawals[].created_at` (string) — Data de criacao
- `withdrawals[].updated_at` (string) — Ultima atualizacao
- `total` (integer) — Total de saques (sem paginacao)
- `page` (integer) — Pagina atual
- `limit` (integer) — Itens por pagina

**Erros:**
- **401** — API Key invalida ou nao fornecida

**Notas importantes:**
- Lista APENAS saques da carteira principal (shop_id IS NULL no banco). Saques de subconta sao em GET /api/shops/{id}/withdrawals.
- Use gateway_e2eid pra rastrear o PIX no extrato bancario do destinatario.
- Saques com status processing podem ainda mudar pra completed ou failed via webhook ou reconciliacao.
- Pra detalhes de um saque especifico, voce pode filtrar pelo id na lista — atualmente nao ha endpoint GET /api/withdrawals/{id} (use a listagem).

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/withdrawals' \
  --header 'x-api-key: nxp_live_a089b1f...'
```

---

## Webhooks

Notificacoes automaticas de eventos

### POST Sua URL configurada — Notificacao de Pagamento

Webhook enviado automaticamente para sua URL quando um pagamento PIX e confirmado. Configure a URL no campo webhook_url ao criar a cobranca, ou registre URLs globais em Dashboard / Integracoes / Webhooks. Os splits ja foram processados quando o webhook e enviado.

**Headers:**
- `Content-Type` (string) **(required)** — application/json (sempre enviado)
- `X-Webhook-Event` (string) **(required)** — Nome do evento: payment.confirmed (sempre enviado)
- `X-Webhook-Signature` (string) — Assinatura HMAC no formato t=<unix>,v1=<hmac_hex>. Enviado apenas quando voce tiver webhook_secret configurado.

**Resposta (200):**
```json
{
  "event": "payment.confirmed",
  "transaction_id": "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
  "txid": "1919700995",
  "external_id": "pedido-123",
  "status": "paid",
  "amount": 50.00,
  "fee": 2.50,
  "net_amount": 47.50,
  "payer_name": "Joao Silva",
  "payer_document_masked": "***.456.789-**",
  "paid_at": "2024-01-15T10:32:00Z",
  "shop_id": "abc12345-6789-...",
  "shop_external_ref": "usuario_joao"
}
```

**Campos da resposta:**
- `event` (string) — Tipo do evento: payment.confirmed
- `transaction_id` (string) — ID interno da transacao
- `txid` (string) — ID da transacao no gateway
- `external_id` (string?) — Seu ID externo (se informado na criacao da cobranca)
- `status` (string) — Status do pagamento: paid
- `amount` (number) — Valor bruto em reais
- `fee` (number) — Taxa cobrada em reais
- `net_amount` (number) — Valor liquido total (apos taxas, antes dos splits)
- `payer_name` (string) — Nome do pagador
- `payer_document_masked` (string) — CPF/CNPJ mascarado do pagador
- `paid_at` (string) — Data/hora do pagamento (ISO 8601)
- `shop_id` (string?) — UUID da subconta. Aparece apenas quando o pagamento veio de uma subconta (shop_id informado na criacao).
- `shop_external_ref` (string?) — Sua referencia externa da subconta (shop_id que voce passou). Aparece quando a subconta tem external_ref.

**Notas importantes:**
- O webhook e enviado via POST para a URL configurada no campo webhook_url da cobranca, e tambem para URLs globais em Dashboard / Integracoes / Webhooks
- Responda com qualquer status 2xx para confirmar recebimento
- Retry: ate 8 tentativas com backoff exponencial (imediato, +1min, +5min, +30min, +2h, +12h, +24h, +72h). Total ~7 dias de janela. Erros 4xx encerram as tentativas (consideramos erro do cliente). Erros 5xx, timeout e falhas de rede continuam retentando ate esgotar.
- Quando o webhook e disparado, os splits ja foram processados e creditados nas subcontas
- Use GET /api/pix/{id} para consultar detalhes dos splits apos receber o webhook
- Recomendamos usar external_id + polling como backup do webhook em caso de falha de rede
- Verificacao da assinatura HMAC: o header X-Webhook-Signature traz t=<unix>,v1=<hmac_hex>. Para validar: calcule HMAC-SHA256 de "<unix>.<body_cru>" usando seu webhook_secret e compare em tempo constante com o valor v1.
- O webhook_secret e configurado em Dashboard / Integracoes / Webhooks. Sem ele, o header X-Webhook-Signature nao e enviado (compatibilidade com integradores antigos).
- Os campos shop_id e shop_external_ref so aparecem em pagamentos de subcontas (quando voce informou shop_id ao criar o PIX).

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.comSua URL configurada' \
  --header 'x-api-key: nxp_live_a089b1f...' \
  --header 'Content-Type: application/json'
```

---

## Verificacao KYC

API publica de verificacao de identidade (Know Your Customer). Gera uma cobranca PIX de R$ 2,00 travada pelo CPF/CNPJ declarado — a Efi rejeita pagamento de outro documento pre-liquidacao, garantindo que so o titular consegue concluir. Notificacao via webhook outbound (event kyc.verified ou kyc.rejected).

### POST /api/kyc/verify — Criar Verificacao KYC

Cria uma nova solicitacao de verificacao KYC pra um CPF/CNPJ. Retorna o QR Code PIX de R$ 2,00. Quando o cliente final pagar, voce recebe webhook outbound com status approved.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API (prefixo_live_...)
- `Content-Type` (string) **(required)** — application/json

**Body (JSON):**
- `document` (string) **(required)** — CPF (11 digitos) ou CNPJ (14 digitos), apenas numeros
- `document_type` (string) **(required)** — CPF ou CNPJ
- `external_id` (string) — ID externo idempotente. Reenviar mesma external_id retorna a verificacao existente (200) sem cobrar de novo
- `webhook_url` (string) — URL pra receber notificacao quando o status mudar (alem dos webhooks globais cadastrados em Integracoes / Webhooks)

**Resposta (200):**
```json
{
  "success": true,
  "verification": {
    "id": "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
    "external_id": "kyc-cliente-123",
    "status": "pending",
    "document_type": "CPF",
    "document_number": "********909",
    "amount": 2.00,
    "qr_code": "00020126...",
    "qr_code_image": "data:image/png;base64,iVBORw0KGgo...",
    "expires_at": "2026-06-20T21:30:00Z",
    "paid_at": null,
    "verified_at": null,
    "rejection_reason": null,
    "payer_name": null,
    "created_at": "2026-06-20T21:15:00Z"
  }
}
```

**Campos da resposta:**
- `success` (boolean) — Indica que a verificacao foi criada ou retornada por idempotencia
- `verification.id` (string) — UUID interno da verificacao
- `verification.external_id` (string | null) — Seu ID externo, se informado
- `verification.status` (string) — pending | approved | rejected | expired
- `verification.document_type` (string) — CPF | CNPJ
- `verification.document_number` (string) — CPF/CNPJ mascarado (so 3 ultimos digitos visiveis)
- `verification.amount` (number) — Valor do PIX (fixo R$ 2,00)
- `verification.qr_code` (string) — Codigo PIX copia-e-cola (BR Code EMV)
- `verification.qr_code_image` (string) — Imagem do QR Code em data URI base64 (PNG)
- `verification.expires_at` (string) — Quando o QR Code expira (ISO 8601). Padrao: 15 minutos
- `verification.paid_at` (string | null) — Quando foi pago — null enquanto pending
- `verification.verified_at` (string | null) — Quando foi aprovado pela plataforma — null enquanto pending
- `verification.rejection_reason` (string | null) — Motivo da rejeicao (payer_document_mismatch | blacklisted_document)
- `verification.payer_name` (string | null) — Nome do titular que pagou (preenchido apos confirmacao)

**Erros:**
- **400** — Body invalido, document/document_type ausente, CPF/CNPJ invalido (DV nao bate)
- **401** — x-api-key invalida ou ausente
- **429** — Rate limit por integrador atingido (5 verificacoes por minuto). Veja retry_after
- **500** — Erro ao gerar cobranca de verificacao no gateway

**Notas importantes:**
- O cliente final paga R$ 2,00 — o valor cobre o custo da verificacao.
- A cobranca eh travada por CPF/CNPJ via Efi (documentoPagadorIgualDevedor). Se outro CPF tentar pagar, o pagamento eh REJEITADO pre-liquidacao — dinheiro volta automaticamente pro pagador.
- Idempotencia: reenviar mesma external_id retorna a verificacao existente (200) sem criar nova nem cobrar duas vezes.
- Pra receber notificacao automatica do resultado, configure um webhook global em Dashboard / Integracoes / Webhooks com event kyc.verified e kyc.rejected (ou * pra todos).
- O QR Code expira em 15 minutos. Apos expirar, status passa pra expired e voce precisa criar nova verificacao.
- Defesa em profundidade: se o pagador vier com CPF diferente do declarado (raro com a flag Efi ativa), a plataforma rejeita a verificacao com rejection_reason="payer_document_mismatch".

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/kyc/verify' \
  --header 'x-api-key: nxp_live_a089b1f...' \
  --header 'Content-Type: application/json' \
  --data '{
  "document": "exemplo",
  "document_type": "exemplo",
  "external_id": "pedido-123",
  "webhook_url": "https://sua-api.com/webhooks/pagamentos"
}'
```

---

### GET /api/kyc/verify/{id} — Consultar Verificacao KYC

Retorna o status atual e detalhes de uma verificacao. O {id} aceita o UUID interno OU o external_id que voce informou no POST.

**Headers:**
- `x-api-key` (string) **(required)** — Sua chave de API

**Resposta (200):**
```json
{
  "success": true,
  "verification": {
    "id": "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
    "external_id": "kyc-cliente-123",
    "status": "approved",
    "document_type": "CPF",
    "document_number": "********909",
    "amount": 2.00,
    "qr_code": "00020126...",
    "qr_code_image": "data:image/png;base64,iVBORw0KGgo...",
    "expires_at": "2026-06-20T21:30:00Z",
    "paid_at": "2026-06-20T21:18:42Z",
    "verified_at": "2026-06-20T21:18:43Z",
    "rejection_reason": null,
    "payer_name": "Joao da Silva",
    "created_at": "2026-06-20T21:15:00Z"
  }
}
```

**Campos da resposta:**
- `success` (boolean) — Indica sucesso da requisicao
- `verification.status` (string) — pending | approved | rejected | expired
- `verification.payer_name` (string | null) — Nome do titular (apos aprovacao)
- `verification.rejection_reason` (string | null) — Motivo da rejeicao quando status = rejected

**Erros:**
- **401** — x-api-key invalida
- **404** — Verificacao nao encontrada ou nao pertence a sua API key

**Notas importantes:**
- O {id} pode ser o UUID interno OU o external_id informado no POST.
- Recomendado usar webhook global em vez de polling — mais barato e em tempo real.
- Verificacoes ficam acessiveis indefinidamente (sem expiracao do registro), so o QR Code expira em 15 minutos.

**Exemplo cURL:**
```bash
curl --location 'https://nexuspag.com/api/kyc/verify/9c29870c-9f69-...' \
  --header 'x-api-key: nxp_live_a089b1f...'
```

---
