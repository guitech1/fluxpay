# Implementação — PIX QR Code, Copia e Cola e Comprovante FluxPay

**Branch:** `feat/pix-qr-copia-cola-comprovante`  
**Base:** `main` @ `6dd5efc`  
**Status:** implementação concluída na branch · **sem merge · sem deploy**

---

## 1. O que foi implementado

### Frontend
- **Modos unificados** na área Pix (`PixTransferForm`):
  - Chave Pix (preservado integralmente)
  - QR Code (câmera via `getUserMedia` + `BarcodeDetector` quando disponível)
  - Pix copia e cola (textarea + validação EMV)
- **Parser EMV** (`frontend/src/lib/pix-emv.ts`): extrai valor (tag 54), nome/cidade do QR (tags 59/60 — informativos), txid quando presente. Não trata dados do QR como consulta DICT.
- **Confirmação unificada** com PIN, valor, taxa, tipo e aviso de que o status final depende do provedor.
- **Comprovante visual FluxPay** (`PixReceipt`): layout com identidade, status real, valor, taxa, pagador (da carteira), recebedor (somente se o provedor retornar), IDs, E2E quando disponível, botões Baixar e Compartilhar.
- **Área de comprovantes** redesenhada com lista clicável que abre o comprovante.

### Backend
- Tipo `qrc` já existia em `withdrawals.ts` e no schema Zod da rota — preservado e usado para EMV completo.
- `createNexusPagWithdrawal` normaliza tipo `qrc` e captura campos extras da resposta (E2E, nome do recebedor se a API enviar, fee).
- Fluxo de reserva atômica, idempotência por `correlation_id`, PIN, aprovação e webhook **inalterados**.

### Segurança e integridade
- Nenhum débito duplo: continua usando RPC de reserva + correlation_id único.
- Status `completed` só após resposta/webhook do provedor (comportamento existente mantido).
- Credenciais NexusPag permanecem somente no backend.
- Nome no QR é exibido como “informativo” — nunca como validação DICT.

---

## 2. Arquivos alterados / criados

| Arquivo | Ação |
|---------|------|
| `frontend/src/lib/pix-emv.ts` | Criado — parser EMV |
| `frontend/src/lib/pix-emv.test.ts` | Criado — testes unitários do parser |
| `frontend/src/components/dashboard/PixTransferForm.tsx` | Reescrito — modos chave / QR / copia-e-cola |
| `frontend/src/components/carteira/PixReceipt.tsx` | Criado — comprovante visual |
| `frontend/src/components/carteira/ComprovantesList.tsx` | Criado — lista + abertura do comprovante |
| `frontend/src/app/(dashboard)/dashboard/carteira/comprovantes/page.tsx` | Atualizado |
| `frontend/src/app/(dashboard)/dashboard/carteira/pix/page.tsx` | Descrição atualizada |
| `backend/src/providers/nexuspag.ts` | Mapeamento qrc + campos extras na resposta de saque |
| `docs/PIX_QR_COPIA_COLA_IMPLEMENTATION.md` | Este relatório |

---

## 3. Migrações necessárias

**Nenhuma.**  
O tipo `pix_key_type = 'qrc'` já era aceito no backend e na constraint/uso de `withdrawal_requests`. Não há alteração de schema Supabase.

---

## 4. Testes

### Automatizados
- `frontend/src/lib/pix-emv.test.ts`: valida payload curto inválido, extração de valor, nome/cidade do QR e máscara.  
  Executar localmente: `cd frontend && npx tsx --test src/lib/pix-emv.test.ts` (requer Node com `tsx` ou runner equivalente).

### Cenários manuais (checklist de QA antes do deploy)

| Cenário | Esperado |
|---------|----------|
| Pix por chave (fluxo antigo) | Continua funcionando sem regressão |
| Copia e cola com valor no EMV | Valor preenchido; confirmação; envio com `pix_key_type=qrc` |
| Copia e cola sem valor | Usuário informa valor; validação mínimo R$ 10 |
| QR via câmera (Chrome/Android com BarcodeDetector) | Detecta código e preenche |
| QR em navegador sem BarcodeDetector | Mensagem clara + orientação para copia e cola |
| Saldo insuficiente | Erro antes da confirmação |
| PIN incorreto | Erro 401 do endpoint de verify; sem débito |
| correlation_id duplicado | 409 conflict |
| Carteira não aprovada | Bloqueio na página Pix |
| Ambiente de teste | Bloqueio de transferências |
| Status pending/processing | Comprovante **não** mostra “Pix realizado” |
| Status completed | Comprovante com status “Pix realizado” + download/share |

**Nota:** testes de integração ponta a ponta com a API real da NexusPag dependem de chave de produção/sandbox e não foram executados neste ambiente (sem credenciais nem deploy).

---

## 5. Limitações reais

1. **Consulta DICT / beneficiário prévia:** a documentação pública da NexusPag **não** expõe endpoint de consulta de beneficiário antes do pagamento. O comprovante só mostra nome do recebedor se a **resposta do saque** trouxer o campo. Não há simulação.
2. **BarcodeDetector:** disponível principalmente em Chromium mobile. Safari/Firefox podem cair no fallback “use copia e cola”.
3. **Download de imagem do comprovante:** usa `html2canvas` se estiver no bundle; senão fallback para impressão/clipboard. Opcional adicionar `html2canvas` como dependência se quiser PNG sempre.
4. **E2E ID:** preenchido apenas quando a NexusPag devolver o campo na resposta do withdrawal.

---

## 6. Pendências indispensáveis antes do deploy único

1. Rodar a suíte de testes unitários do parser + typecheck/lint do frontend e backend.
2. QA manual dos cenários da tabela acima em staging/preview (Netlify preview da branch).
3. Confirmar com a documentação privada/contrato da NexusPag se o valor de `pix_key_type` para EMV deve ser exatamente `qrc` ou outro literal (ex.: `emv`, `copia_e_cola`). Ajustar `mapWithdrawalKeyType` se necessário.
4. Validar webhooks de saque ainda marcam `completed` corretamente para `qrc`.
5. **Somente após QA:** merge em `main` e o único deploy de produção.

---

## 7. Instruções para revisão final

```bash
git fetch origin
git checkout feat/pix-qr-copia-cola-comprovante
cd frontend && npm run typecheck && npm run lint
cd ../backend && npm run typecheck   # se existir script
# Preview Netlify da branch ou ambiente de staging
```

Revisar principalmente:
- `PixTransferForm.tsx` (fluxos e estados)
- `pix-emv.ts` (parser)
- `PixReceipt.tsx` + `ComprovantesList.tsx`
- Diff de `nexuspag.ts` (mapeamento qrc)

**Não fazer merge nem deploy até autorização explícita.**
