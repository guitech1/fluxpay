# Estado da restauração de `backend/src/routes/webhooks.ts`

A implementação completa dos webhooks foi restaurada na branch `feature/ultima-atualizacao-completa` a partir de `main` (blob original `5a722326487f4bc906e665558478bddb763973ee`).

Também foi adicionado o helper `notifyAfterPixConfirmed` após a confirmação de pagamento nos handlers `/nexuspag` e `/provider`.

## Validação obrigatória antes de merge

Executar e confirmar no commit atual:

```bash
npm run typecheck --workspace=backend
npm test --workspace=backend
npm run build --workspace=frontend
```

A CI ainda precisa ser verificada no commit atual. A restauração do ficheiro não é, por si só, autorização para merge ou deploy.

**Manter o PR em draft. Não fazer merge nem deploy de produção até todos os checks e a revisão de segurança estarem concluídos.**
