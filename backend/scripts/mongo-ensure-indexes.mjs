/**
 * Garante índices MongoDB Atlas (ranking, score cache, perfil público).
 *
 * Uso (secrets no ambiente — NUNCA commitar URI real):
 *   export MONGODB_URI='mongodb+srv://...'
 *   export MONGODB_DB=fluxpay
 *   node backend/scripts/mongo-ensure-indexes.mjs
 *
 * Collections:
 *   ranking_participants — metadados do ranking
 *   org_scores — cache auxiliar do Score (não fonte financeira)
 *   public_profiles — perfil público
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

  const ranking = db.collection("ranking_participants");
  const rankingResult = await ranking.createIndexes([
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
  console.log("ranking_participants indexes:", rankingResult);

  const scores = db.collection("org_scores");
  const scoresResult = await scores.createIndexes([
    {
      key: { organization_id: 1, environment: 1 },
      name: "uq_org_env",
      unique: true,
    },
    { key: { calculated_at: 1 }, name: "calculated_at" },
  ]);
  console.log("org_scores indexes:", scoresResult);

  const profiles = db.collection("public_profiles");
  const profilesResult = await profiles.createIndexes([
    { key: { organization_id: 1 }, name: "uq_organization_id", unique: true },
    { key: { slug: 1 }, name: "uq_slug", unique: true },
    { key: { enabled: 1, slug: 1 }, name: "enabled_slug" },
  ]);
  console.log("public_profiles indexes:", profilesResult);

  for (const name of ["ranking_participants", "org_scores", "public_profiles"]) {
    const indexes = await db.collection(name).indexes();
    console.log(`\n=== ${name} ===`);
    console.log(JSON.stringify(indexes, null, 2));
  }
} catch (err) {
  console.error("Failed:", err.message);
  process.exit(1);
} finally {
  await client.close();
}
