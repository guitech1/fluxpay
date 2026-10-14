import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseActivePool, DEFAULT_PRIORITY, filterActiveAcquirers } from "../src/providers/routing.js";

describe("ProfanusPay no pool de adquirentes", () => {
  it("pool default inclui profanuspay", () => {
    const pool = parseActivePool(undefined);
    assert.ok(pool.includes("profanuspay"));
  });

  it("prioridade de profanuspay definida", () => {
    assert.equal(DEFAULT_PRIORITY.profanuspay, 15);
  });

  it("filterActive inclui profanuspay quando configurado e enabled", () => {
    const { ordered, excluded } = filterActiveAcquirers({
      pool: ["nexuspag", "profanuspay", "gothampay"],
      rows: [
        { acquirer_id: "nexuspag", enabled: true, priority: 10 },
        { acquirer_id: "profanuspay", enabled: true, priority: 15 },
        { acquirer_id: "gothampay", enabled: false, priority: 20 },
      ],
      isConfigured: (id) => id === "nexuspag" || id === "profanuspay",
    });
    assert.deepEqual(ordered, ["nexuspag", "profanuspay"]);
    assert.ok(excluded.some((e) => e.id === "gothampay"));
  });
});
