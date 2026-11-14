# Implementação — PIX QR Code, Copia e Cola e Comprovante FluxPay

**Branch:** `feat/pix-qr-copia-cola-comprovante`  
**Status:** implementação alinhada à documentação oficial NexusPag · **sem merge · sem deploy**

---

## Confirmação oficial NexusPag (docs coladas)

`POST /api/withdrawals`:

- `pix_key_type`: `cpf | cnpj | email | phone | random | **qrc**`
- Para **qrc**: passar o **código EMV completo** em `pix_key`
- Resposta: `withdrawal_id`, `status` (`completed` | `processing`), `fee`, `net_amount`
- Listagem: `gateway_e2eid` (End-to-End ID)

Não existe endpoint de consulta DICT / beneficiário prévia na documentação.

---

## O que foi implementado

### Frontend
- Modos: **Chave Pix** | **QR Code (câmera)** | **Copia e cola**
- Parser EMV (`pix-emv.ts`): valor, nome/cidade do QR (informativo)
- Confirmação unificada + PIN
- Comprovante visual FluxPay (status real, IDs, E2E quando disponível, baixar/compartilhar)
- Área de comprovantes com abertura do comprovante

### Backend
- `qrc` mapeado conforme docs oficiais
- Captura de `gateway_e2eid` / E2E quando a resposta trouxer
- Armazenamento composto opcional em `provider_reference` (`id|e2e`) sem migration
- `publicWithdrawalView` expõe `provider_reference` limpo + `e2e_id`
- Fluxo de chave, idempotência, reserva atômica e webhooks **preservados**

---

## Arquivos principais

- `frontend/src/lib/pix-emv.ts` + teste
- `frontend/src/components/dashboard/PixTransferForm.tsx`
- `frontend/src/components/carteira/PixReceipt.tsx`
- `frontend/src/components/carteira/ComprovantesList.tsx`
- `frontend/src/app/(dashboard)/dashboard/carteira/comprovantes/page.tsx`
- `backend/src/providers/nexuspag.ts`
- `backend/src/services/withdrawals.ts`

---

## Migrações

**Nenhuma obrigatória.**  
E2E é persistido de forma compatível em `provider_reference` quando retornado.

Opcional futuro: coluna `e2e_id text` em `withdrawal_requests`.

---

## Limitações

1. Sem DICT prévia — nome de recebedor só se a API devolver.
2. BarcodeDetector depende do navegador.
3. E2E no create pode não vir; a listagem NexusPag traz `gateway_e2eid` — reconciliação futura pode enriquecer.

---

## Antes do deploy único

1. `typecheck` / lint
2. QA manual (chave, qrc, saldo, PIN, duplicidade, status)
3. Preview da branch
4. Autorização explícita para merge + deploy

**Não fazer merge nem deploy até autorização.**
