# Webhooks PIX — estado restaurado

O ficheiro `backend/src/routes/webhooks.ts` foi restaurado (commit `d93753c`).

- Rotas `/nexuspag` e `/provider` com implementação completa
- Validação de assinatura, idempotência via `provider_events`, confirmação no ledger
- `notifyAfterPixConfirmed` após `markPixPaymentSucceeded` (falha de push não invalida a confirmação)
- `markPixPaymentSucceeded` em `payments-queries.ts` também dispara push de forma segura (reconcile + webhooks)

## Validação

```bash
npm run typecheck --workspace=backend
npm test --workspace=backend
npm run build --workspace=frontend
```

Não fazer merge nem deploy de produção até revisão humana final.
