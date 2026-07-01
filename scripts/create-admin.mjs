#!/usr/bin/env node
/**
 * Creates (or promotes) a staff admin account for the /admin panel.
 *
 * There is no public sign-up anywhere in this app -- this script is the
 * only way admin accounts get created, which is intentional: the admin
 * panel controls the live public website, so its user pool should be
 * small and deliberately provisioned.
 *
 * Usage:
 *   node scripts/create-admin.mjs "someone@sosunfihaara.com" "a-strong-password"
 *
 * Requires the same credentials as everything else server-side:
 * FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in
 * .env.local, or GOOGLE_APPLICATION_CREDENTIALS pointing at a service
 * account JSON with Firebase Auth Admin permissions.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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

// ---------- Password strength policy ----------
//
// Staff admin accounts control the live public website (products, brands,
// site copy, contact submissions), so this is intentionally stricter than
// a typical consumer sign-up: length alone (the old >=8 check) is not a
// meaningful bar against modern cracking, and admin accounts are a much
// higher-value target than a normal user account.
//
// Policy: at least 12 characters, drawn from at least 3 of the 4
// character classes (lowercase, uppercase, digit, symbol), and not one of
// a short list of common/weak passwords that length+complexity checks
// alone wouldn't catch.

const MIN_LENGTH = 12;
const MIN_CHARACTER_CLASSES = 3;

// A small denylist of passwords that are common enough to guess first
// regardless of length/complexity (e.g. "Password1234!" passes the rules
// above but is one of the first things a real attacker would try).
const COMMON_WEAK_PASSWORDS = new Set([
  "password", "password1", "password123", "password1234",
  "administrator", "admin1234", "adminadmin", "letmein12345",
  "qwertyuiop12", "123456789012", "welcome12345", "changeme1234",
]);

function validatePasswordStrength(password) {
  const problems = [];

  if (password.length < MIN_LENGTH) {
    problems.push(`must be at least ${MIN_LENGTH} characters (got ${password.length})`);
  }

  const classes = [
    /[a-z]/.test(password), // lowercase
    /[A-Z]/.test(password), // uppercase
    /[0-9]/.test(password), // digit
    /[^a-zA-Z0-9]/.test(password), // symbol
  ];
  const classCount = classes.filter(Boolean).length;
  if (classCount < MIN_CHARACTER_CLASSES) {
    problems.push(
      `must contain at least ${MIN_CHARACTER_CLASSES} of: lowercase, uppercase, digit, symbol (got ${classCount})`
    );
  }

  const normalized = password.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (COMMON_WEAK_PASSWORDS.has(normalized) || COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    problems.push("is too common/guessable -- choose something less predictable");
  }

  return problems;
}

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error("Usage: node scripts/create-admin.mjs <email> <password>");
  process.exit(1);
}

const passwordProblems = validatePasswordStrength(password);
if (passwordProblems.length > 0) {
  console.error("Password does not meet the admin password policy:");
  for (const problem of passwordProblems) console.error(`  - ${problem}`);
  console.error("\nTip: a passphrase of 4+ unrelated words with a digit and symbol mixed in easily clears this bar.");
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

if (projectId && clientEmail && privateKey) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
} else {
  initializeApp();
}

const auth = getAuth();

async function main() {
  let user;
  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password });
    console.log(`Existing user found -- password updated for ${email}`);
  } catch {
    user = await auth.createUser({ email, password, emailVerified: true });
    console.log(`Created new user ${email}`);
  }

  await auth.setCustomUserClaims(user.uid, { admin: true });
  console.log(`Granted admin claim to ${email} (uid: ${user.uid})`);
  console.log("\nThey can now sign in at /admin/login with this email and password.");
}

main().catch(err => {
  console.error("Failed:", err.message);
  process.exit(1);
});
