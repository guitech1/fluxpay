# Restaurar admin.ts

O arquivo `backend/src/routes/admin.ts` foi corrompido acidentalmente.

Rode no clone local:

```bash
git fetch origin
git checkout e8667850a2ffdae556f71805236f365bdbabd04c -- backend/src/routes/admin.ts
```

Depois adicione nos dois `.select(...)` de organizations as colunas KYC:

- Lista (`GET /organizations`):
  `kyc_required, kyc_status, kyc_verified_at, kyc_document_masked, kyc_rejection_reason`

- Detalhe (`GET /organizations/:id`):
  `kyc_required, kyc_status, kyc_verified_at, kyc_document_type, kyc_document_masked, kyc_rejection_reason`

Commit e push. Sem isso o painel ADM quebra (users, payments, settings, etc.).
