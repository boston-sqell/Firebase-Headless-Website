/**
 * scripts/seed-firestore.mjs
 *
 * One-time migration script: pulls historical data from the old Wix CMS
 * and writes it into Firestore. Not used by the running application —
 * only needed once when first setting up a new Firestore project, or to
 * re-import a backup. Ongoing content changes should go through the
 * admin panel (/admin) instead.
 *
 * Usage (from the repo root):
 *   node scripts/seed-firestore.mjs
 *
 * Prerequisites:
 *   1. Copy .env.local.example to .env.local and fill in your credentials
 *   2. npm install (installs firebase-admin)
 *   3. Have your WIX_CLIENT_SECRET available (from the Wix site's .env.local)
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local manually (no dotenv dependency) ──────────────────────────
function loadEnv() {
  const envPath = join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) {
    console.error("❌  .env.local not found. Copy .env.local.example and fill it in.");
    process.exit(1);
  }
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnv();

// ── Firebase init ─────────────────────────────────────────────────────────────
const projectId   = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌  Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY in .env.local");
  process.exit(1);
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

// ── Wix API helpers ───────────────────────────────────────────────────────────
const WIX_CLIENT_ID     = process.env.WIX_CLIENT_ID     || "6b9c7399-c871-4eec-9007-49ccfbf59b01";
const WIX_CLIENT_SECRET = process.env.WIX_CLIENT_SECRET;
const WIX_SITE_ID       = "ce3c6696-e20c-4ed7-934e-04017b645c53";

if (!WIX_CLIENT_SECRET) {
  console.error("❌  WIX_CLIENT_SECRET not set in .env.local. Add it from the Wix project's .env.local.");
  process.exit(1);
}

async function getWixToken() {
  const r = await fetch("https://www.wixapis.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantType: "client_credentials",
      clientId: WIX_CLIENT_ID,
      clientSecret: WIX_CLIENT_SECRET,
    }),
  });
  if (!r.ok) throw new Error(`Wix auth failed: ${await r.text()}`);
  const { access_token } = await r.json();
  return access_token;
}

async function wixQuery(token, collectionId, filter, limit = 1000, sort) {
  const body = {
    dataCollectionId: collectionId,
    query: { paging: { limit } },
  };
  if (filter) body.query.filter = filter;
  if (sort)   body.query.sort   = sort;

  const r = await fetch("https://www.wixapis.com/wix-data/v2/items/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "wix-site-id": WIX_SITE_ID,
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Wix query (${collectionId}) failed: ${await r.text()}`);
  const d = await r.json();
  return (d.dataItems || []).map(i => i.data || i);
}

// ── Firestore batch writer ────────────────────────────────────────────────────
async function batchWrite(collectionId, docs, idField = "_id") {
  const CHUNK = 400;
  let written = 0;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + CHUNK);
    for (const doc of chunk) {
      const docId = doc[idField] || doc.id || doc.slug || String(i + written);
      const ref = db.collection(collectionId).doc(String(docId).replace(/\//g, "_"));
      // Strip Wix internal fields
      const { _id, _owner, _createdDate, _updatedDate, ...clean } = doc;
      batch.set(ref, {
        ...clean,
        _seededAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    written += chunk.length;
    console.log(`  ✓ ${collectionId}: wrote ${written}/${docs.length}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔑  Authenticating with Wix...");
  const token = await getWixToken();
  console.log("✓  Wix token obtained\n");

  // Products
  console.log("📦  Fetching Products from Wix...");
  const products = await wixQuery(token, "Products", undefined, 1000, [{ fieldName: "name", order: "ASC" }]);
  console.log(`    ${products.length} products found`);
  await batchWrite("Products", products);

  // Brands
  console.log("\n🏷️   Fetching Brands from Wix...");
  const brands = await wixQuery(token, "Brands", undefined, 100, [{ fieldName: "name", order: "ASC" }]);
  console.log(`    ${brands.length} brands found`);
  await batchWrite("Brands", brands, "slug");

  // SiteContent
  console.log("\n🌐  Fetching SiteContent from Wix...");
  const siteArr = await wixQuery(token, "SiteContent", undefined, 1);
  if (siteArr.length > 0) {
    const ref = db.collection("SiteContent").doc("main");
    const { _id, _owner, _createdDate, _updatedDate, ...clean } = siteArr[0];
    await ref.set({ ...clean, _seededAt: FieldValue.serverTimestamp() });
    console.log("  ✓ SiteContent: wrote 1/1");
  }

  // Categories
  console.log("\n📂  Fetching Categories from Wix...");
  const cats = await wixQuery(token, "Categories", undefined, 50, [{ fieldName: "order", order: "ASC" }]);
  console.log(`    ${cats.length} categories found`);
  await batchWrite("Categories", cats, "name");

  console.log("\n✅  Firestore seeded successfully!");
  console.log(`    Products: ${products.length}`);
  console.log(`    Brands:   ${brands.length}`);
  console.log(`    Categories: ${cats.length}`);
  console.log("\n⚠️   Note: Images still point to Wix CDN (static.wixstatic.com).");
  console.log("    The site will display them correctly during the parallel run.");
  console.log("    To migrate images to Firebase Storage, run: node migrate-images.mjs (future step)\n");
}

main().catch(err => {
  console.error("\n❌  Seeder failed:", err.message);
  process.exit(1);
});
