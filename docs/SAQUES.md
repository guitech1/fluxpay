# Saque — estado real da funcionalidade (19/09/2026)

> **Resumo em uma linha: não existe solicitação de saque no FluxPay.**
> Este documento existe para que ninguém — pessoa ou modelo — conclua, a
> partir do rótulo "Saque" que aparece na tela, que o fluxo está pronto.

## O que EXISTE hoje

Uma busca por `saque`, `payout` e `withdraw` em todo o repositório devolve
exatamente isto:

| Onde | O que é |
|---|---|
| `supabase/migrations/..._001_initial_schema.sql` | `balance_transactions.type` é um TEXT livre; o comentário cita `payout` entre os valores previstos |
| `supabase/migrations/..._003_integrity_indexes_and_constraints.sql` | `CHECK (type IN ('charge','refund','fee','payout','adjustment','chargeback'))` — `payout` é um valor **aceito** pela constraint |
| `frontend/src/app/(dashboard)/dashboard/wallet/page.tsx` | `TX_LABELS.payout = "Saque"` — o rótulo em português exibido no extrato |
| `backend/src/providers/nexuspag.ts` | Comentários mencionando a categoria "Saques" da API da NexusPag |

É só isso. **O rótulo "Saque" nunca aparece na prática**, porque nenhum
código em nenhum lugar do projeto grava uma linha com `type = 'payout'`.

## O que NÃO existe

- Nenhuma rota (`/v1/*`, `/dashboard-api/*`, `/admin-api/*`) de saque.
- Nenhum service, nenhuma função, nenhum adapter de saque.
- Nenhuma tabela de solicitações, nenhum estado (`pendente`/`aprovado`/`pago`).
- Nenhuma tela, botão ou formulário para pedir saque.
- Nenhuma permissão, papel ou policy chamada "Saque" — os papéis existentes são
  `owner | admin | developer | viewer` (organização) e
  `superadmin | admin | support` (plataforma).
- Nenhuma aprovação de saque no painel administrativo.

## Por que a tela dá a entender que existe

`wallet/page.tsx` mostra o cartão **"Disponível"** com a legenda
_"Já liberado para saque"_. A frase é verdadeira sobre o **ledger** (aquele
valor já passou do prazo `available_on`, ou seja, está liberado), mas é lida
pelo lojista como "posso sacar agora" — e não pode, porque não há por onde
pedir. Por isso a tela ganhou um aviso explícito (ver "O que foi feito"
abaixo). **O rótulo `payout: "Saque"` foi mantido intacto**, assim como a
constraint do banco.

## O que a NexusPag oferece (e por que não é plug-and-play)

`docs/nexuspag-api.md` documenta:

- `POST /api/withdrawals` — cria um saque PIX **da carteira principal**
- `GET /api/withdrawals` — histórico de saques da carteira principal
- `POST /api/shops/{id}/withdraw` — saque **da subconta**
- `GET /api/shops/{id}/withdrawals` — histórico da subconta

O detalhe que impede um atalho: a **carteira principal é a da conta dona da
`NEXUSPAG_API_KEY`** — ou seja, a carteira da FluxPay, não a de cada lojista.
Chamar `POST /api/withdrawals` com o valor que um lojista pediu tiraria
dinheiro do caixa da plataforma e mandaria para uma chave PIX informada pelo
próprio lojista, sem nenhuma conferência.

Para um saque de lojista existir de verdade seria preciso, no mínimo:

1. Uma tabela de solicitações (`withdrawal_requests`) com valor, chave PIX,
   tipo de chave, status e trilha de quem aprovou.
2. Validação de saldo **disponível** (`available_on <= now`) no momento do
   pedido, e bloqueio do valor para não ser pedido duas vezes.
3. Uma linha `balance_transactions` com `type = 'payout'` e valor negativo —
   escrita só pelo backend (`service_role`), como manda a migration 010.
4. Aprovação no painel administrativo, com motivo e `admin_audit_log`
   (o mesmo padrão de `POST /admin-api/organizations/:id/status`).
5. Só então a chamada à NexusPag, tratando os casos que a doc descreve:
   cooldown de 5 min (429), KYC pendente (403, `requires_kyc=true`) e
   `status: "processing"` — que a doc manda **não** retentar, porque o saldo
   já foi debitado.
6. Reconciliação: `POST /api/withdrawals` pode responder `processing` por
   timeout do gateway, e a NexusPag **não estorna sozinha**.

Nada disso foi escrito. Um fluxo pela metade aqui é pior do que nenhum:
saque é a única operação do sistema que tira dinheiro, e um erro não tem
como ser desfeito por um webhook.

## O que foi feito nesta rodada

- **Nada de fluxo novo.** Nenhuma rota, tela ou tabela de saque foi criada.
- O rótulo `payout: "Saque"` e a constraint do banco foram **preservados**.
- A tela da Carteira passou a dizer, de forma explícita, que a solicitação de
  saque ainda não está disponível e que o dinheiro liberado ainda não pode ser
  retirado pelo painel — em vez de deixar a legenda "já liberado para saque"
  sozinha, sugerindo o contrário.
- Este documento foi criado como fonte da verdade sobre o assunto.

## Próximo passo, quando for a hora

Implementar na ordem dos 6 pontos acima, começando pela migration da tabela de
solicitações. **Não** comece pelo adapter da NexusPag: o difícil aqui é o
ledger e a aprovação, não a chamada HTTP.
