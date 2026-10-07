# Platform Evolution — rodada final de pendencias

Branch: feature/platform-evolution
DEPLOY NAO REALIZADO. main nao alterado.

## Corrigido nesta rodada

### 1. ADM Ranking
- Pagina /admin/ranking com RankingAdminPanel integrado
- Link no AdminShell (Trophy)
- adminFetch real: listar, board, criar, ativar/desativar, remover
- Loading, empty, erros

### 2. Payment Link
- Formulario: cor (#RRGGBB + color picker), tema, mensagem
- POST envia color, theme, message
- Checkout publico GET /v1/checkout/sessions/:id devolve appearance
- Checkout UI aplica tema (default/dark/light/brand), cor no botao/sombra, mensagem
- Fallback sem appearance = visual padrao FluxPay
- Mensagem sanitizada (sem < >)

### 3. API Explorer
- Integrado em /dashboard/api
- Endpoints reais only
- Bloqueio sk_live_ por padrao

### 4. Documentacao
- lib/api-docs-content.ts com doc completa baseada no codigo real
- Download HTML profissional (capa, indice, tipografia, pre/code, rodape)
- Imprimir > Salvar como PDF no navegador (sem lib pesada)

### 5. Migration 021
- Revisao estatica: FKs, RLS, grants service_role, RPC SECURITY DEFINER com search_path
- NAO aplicada em producao
- UNIQUE parcial ranking org+season OK
- fluxpay_vault_allocate nao altera ledger (correto)

## Testes
Ambiente de auditoria sem clone autenticado + npm install do monorepo privado.
- typecheck / lint / build: NAO EXECUTADO — sem node_modules do projeto
- score.test.ts: escrito; NAO EXECUTADO
- Validacao sintatica dos arquivos TypeScript/SQL via revisao manual: feita

## Como testar manualmente
1. Aplicar migration 021 no Supabase (staging)
2. Abrir /admin/ranking
3. Criar payment link com cor/tema/mensagem e abrir /checkout/{id}
4. /dashboard/api — Explorer + download HTML
5. Transferencia FluxPay Card — recibo permanece ate Fechar

PLATFORM EVOLUTION FINALIZADA — DEPLOY NAO REALIZADO.
