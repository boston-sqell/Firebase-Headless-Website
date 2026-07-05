import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnv();

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

if (projectId && clientEmail && privateKey) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
} else {
  initializeApp();
}

const db = getFirestore();

const categories = [
  "Beverages",
  "Confectionery",
  "Cooking Ingredients",
  "Dairy",
  "Mosquito Repellent",
  "Recipe's & Spices",
  "Sauces & Dressings",
  "Snacks",
  "Spreads & Mayo",
  "Staple Foods"
];

async function main() {
  console.log("Seeding categories...");
  const batch = db.batch();
  
  for (let i = 0; i < categories.length; i++) {
    const name = categories[i];
    const docRef = db.collection("Categories").doc();
    batch.set(docRef, {
      name,
      order: i + 1
    });
  }
  
  await batch.commit();
  console.log("Categories seeded successfully!");
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
