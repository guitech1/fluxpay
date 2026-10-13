-- Register ProfanusPay but keep it disabled until credentials and sandbox tests are complete.
INSERT INTO acquirer_cost_config (acquirer_id, cost_percent, cost_fixed_cents, enabled, priority)
VALUES ('profanuspay', 5.0, 0, false, 15)
ON CONFLICT (acquirer_id) DO NOTHING;
