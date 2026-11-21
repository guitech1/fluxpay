-- Força ProfanusPay ligada no admin.
-- O seed 20261013211153 colocou enabled=false; a 035 tentou virar mas
-- em alguns ambientes a migration não rodou ou o estado ficou stale.
-- Com a chave PROFANUSPAY_API_KEY presente, o backend também self-heals
-- no resolveActiveIds (auto_enable).

INSERT INTO acquirer_cost_config (acquirer_id, cost_percent, cost_fixed_cents, enabled, priority)
VALUES ('profanuspay', 5.0, 0, true, 15)
ON CONFLICT (acquirer_id) DO UPDATE
SET
  enabled = true,
  priority = COALESCE(acquirer_cost_config.priority, 15),
  updated_at = NOW();
