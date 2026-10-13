-- 026: Registar ProfanusPay na tabela de custo/prioridade (disabled por omissao)
INSERT INTO acquirer_cost_config (acquirer_id, cost_percent, cost_fixed_cents, enabled, priority)
VALUES ('profanuspay', 5.0, 0, false, 15)
ON CONFLICT (acquirer_id) DO NOTHING;
