/**
 * Garante índices do ranking no MongoDB Atlas de forma reproduzível.
 *
 * Uso (local, com secrets no ambiente — NUNCA commitar URI real):
 *   export MONGODB_URI='mongodb+srv://fluxpay_app:***@cluster.mongodb.net/?retryWrites=true&w=majority'
 *   export MONGODB_DB=fluxpay
 *   node backend/scripts/mongo-ensure-indexes.mjs
 *
 * Índices criados em ranking_participants:
 *   - uq_id (unique em id)
 *   - org_active (organization_id + is_active)
 *   - active_created (is_active + created_at)
 *   - uq_org_active (unique parcial: 1 org ativa por organization_id string;
 *     múltiplos organization_id=null são permitidos)
 */

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI?.trim();
const dbName = (process.env.MONGODB_DB || "fluxpay").trim();

if (!uri) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

try {
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection("ranking_participants");

  const result = await col.createIndexes([
    { key: { id: 1 }, name: "uq_id", unique: true },
    { key: { organization_id: 1, is_active: 1 }, name: "org_active" },
    { key: { is_active: 1, created_at: 1 }, name: "active_created" },
    {
      key: { organization_id: 1 },
      name: "uq_org_active",
      unique: true,
      partialFilterExpression: {
        organization_id: { $type: "string" },
        is_active: true,
      },
    },
  ]);

  console.log("Indexes ensured:", result);
  const indexes = await col.indexes();
  console.log(JSON.stringify(indexes, null, 2));
} catch (err) {
  console.error("Failed:", err.message);
  process.exit(1);
} finally {
  await client.close();
}
