# FluxPay Card — correcao do recibo

## Causa real

Em `handleTransfer`:

```
setReceipt(data.transaction);
setView("receipt");
await load(); // load() faz setView("main")
```

`load()` sempre forçava `setView("main")`, apagando o recibo.

## Correcao

1. `load` passa a aceitar opcao `{ preserveView?: boolean }`.
2. Apos transferencia bem-sucedida: `setView("receipt")` e `await load({ preserveView: true })`.
3. Recibo so some quando o usuario clica em Fechar.
4. Ultimo recibo pode ser reaberto via estado `lastReceipt`.
