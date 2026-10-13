# CRÍTICO — Restaurar `backend/src/routes/webhooks.ts`

Durante a validação contínua, o ficheiro `backend/src/routes/webhooks.ts` foi corrompido por um push incompleto e substituído por um **stub temporário** que responde 503 em `/nexuspag` e `/provider`.

## Como restaurar (obrigatório antes de merge)

1. Recuperar o conteúdo de `main` (blob `5a722326487f4bc906e665558478bddb763973ee`):

```bash
git show main:backend/src/routes/webhooks.ts > backend/src/routes/webhooks.ts
```

2. Adicionar o import e as chamadas de push após confirmação PIX:

```ts
import { notifyAfterPixConfirmed } from "../services/payments-queries-notify.js";
```

Após cada `await markPixPaymentSucceeded(payment)` (ou `payment!`):

```ts
notifyAfterPixConfirmed(payment);
```

O helper `payments-queries-notify.ts` já está na branch e é idempotente.

3. Confirmar:

```bash
npm run typecheck --workspace=backend
npm test --workspace=backend
```

4. Commit e push na branch `feature/ultima-atualizacao-completa`.

**Não fazer merge nem deploy de produção com o stub.**
