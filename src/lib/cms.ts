/**
 * CMS data layer — public, read-only side.
 *
 * Firestore collections:
 *   Products, Brands, SiteContent, Categories
 *
 * All reads go through the shared Firebase Admin singleton in
 * firebase-admin.ts. Writes (used by the admin panel) live in
 * admin-data.ts, which also calls invalidateCmsCache() after every
 * mutation so editors see their changes immediately instead of waiting
 * out the cache TTL.
 */

import { getDb } from "./firebase-admin";

// ---------- Types ----------

export interface Product {
  id?: string;
  name: string;
  brandName: string;
  category: string;
  code: string;
  subcategory?: string;
  price?: string;
  packSize?: string;
  brandSlug: string;
  keywords?: string;
  image?: string;
  active?: boolean;
}

export interface Brand {
  id?: string;
  name: string;
  slug: string;
  logo?: string;
  heroImage?: string;
  description?: string;
  active: boolean;
}

export interface Category {
  id?: string;
  name: string;
  description?: string;
  tag?: string;
  order: number;
  image?: string;
}

export interface Milestone {
  id?: string;
  year: string;
  chapter: string;
  title: string;
  body: string;
  order: number;
}

export type SiteContent = Record<string, string>;

// ---------- Image URL helper ----------
// All images live on Firebase Storage (or in public/). Falls back to the
// logo when a field is empty. (The legacy Wix-URI branch was removed on
// 2026-07-02 after scripts/migrate-wix-images.mjs re-hosted the last
// wix:image:// references and a full Firestore scan confirmed zero remain.)

export function resolveImage(url?: string): string {
  return url || "/logo.png";
}

// ---------- In-memory cache (per-instance, short TTL) ----------
//
// NOTE: on Cloud Run this cache is per-instance, not shared across
// concurrent instances or survivable across scale-to-zero. It exists purely
// to absorb bursts of requests hitting the same instance; it is NOT a
// substitute for query-level efficiency or a CDN layer. See README's
// "Known limitations" section. invalidateCmsCache() is called by
// admin-data.ts after every write so editors always see fresh content
// immediately regardless of TTL.

const _cache = new Map<string, { value: unknown; expiry: number }>();
const CACHE_TTL_MS = 2 * 60 * 1000;

function fromCache<T>(key: string): T | undefined {
  const hit = _cache.get(key);
  if (hit && hit.expiry > Date.now()) return hit.value as T;
  return undefined;
}

function toCache(key: string, value: unknown): void {
  _cache.set(key, { value, expiry: Date.now() + CACHE_TTL_MS });
}

/** Clears the whole in-process CMS cache. Called by admin-data.ts after writes. */
export function invalidateCmsCache(): void {
  _cache.clear();
}

// ---------- Generic Firestore query ----------

async function queryCollection<T>(
  collectionId: string,
  filters?: Array<{ field: string; op: FirebaseFirestore.WhereFilterOp; value: unknown }>,
  orderBy?: { field: string; direction: "asc" | "desc" },
  limit = 1000
): Promise<T[]> {
  const cacheKey = `${collectionId}_${JSON.stringify(filters)}_${JSON.stringify(orderBy)}_${limit}`;
  const cached = fromCache<T[]>(cacheKey);
  if (cached) return cached;

  const db = getDb();
  let q: FirebaseFirestore.Query = db.collection(collectionId);
  if (filters) {
    for (const f of filters) q = q.where(f.field, f.op, f.value);
  }
  if (orderBy) q = q.orderBy(orderBy.field, orderBy.direction);
  q = q.limit(limit);

  const snap = await q.get();
  const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as T[];
  toCache(cacheKey, results);
  return results;
}

// ---------- Public API ----------

export async function getProducts(): Promise<Product[]> {
  const raw = await queryCollection<Product & { active?: boolean }>(
    "Products",
    [{ field: "active", op: "==", value: true }],
    { field: "name", direction: "asc" },
    1000
  );
  return raw.map(p => ({
    id:          p.id,
    name:        p.name,
    brandName:   p.brandName,
    category:    p.category,
    code:        p.code,
    subcategory: p.subcategory,
    price:       p.price,
    packSize:    p.packSize,
    brandSlug:   p.brandSlug,
    keywords:    p.keywords,
    image:       resolveImage(p.image),
    active:      p.active,
  }));
}

export async function getBrands(): Promise<Brand[]> {
  const raw = await queryCollection<Brand>(
    "Brands",
    [{ field: "active", op: "==", value: true }],
    { field: "name", direction: "asc" },
    100
  );
  return raw.map(b => ({
    ...b,
    logo:      resolveImage(b.logo),
    heroImage: resolveImage(b.heroImage),
  }));
}

export async function getSiteContent(): Promise<SiteContent> {
  const cacheKey = "SiteContent_main";
  const cached = fromCache<SiteContent>(cacheKey);
  if (cached) return cached;

  const db = getDb();
  const doc = await db.collection("SiteContent").doc("main").get();
  if (!doc.exists) return {};

  const resolved = doc.data() as SiteContent;
  toCache(cacheKey, resolved);
  return resolved;
}

export async function getCategories(): Promise<Category[]> {
  return queryCollection<Category>(
    "Categories",
    undefined,
    { field: "order", direction: "asc" },
    50
  );
}

export async function getMilestones(): Promise<Milestone[]> {
  return queryCollection<Milestone>(
    "Milestones",
    undefined,
    { field: "order", direction: "asc" },
    50
  );
}

/** Convenience: fetch products + brands + site content in parallel */
export async function getCmsData() {
  const [products, brands, site] = await Promise.all([
    getProducts(),
    getBrands(),
    getSiteContent(),
  ]);
  return { products, brands, site };
}

