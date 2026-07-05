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

export interface NewsItem {
  id?: string;
  title: string;
  eyebrow?: string;
  description: string;
  emoji?: string;
  image?: string;
  backgroundColor?: string;
  publishedAt: string;
  active: boolean;
}

export interface Recipe {
  id?: string;
  title: string;
  meta?: string;
  pill?: string;
  description: string;
  image?: string;
  prepTime?: string;
  cookTime?: string;
  featured: boolean;
  active: boolean;
}

export interface Promotion {
  id?: string;
  title: string;
  subtitle: string;
  label: string;
  background: string;
  order: number;
  active: boolean;
}

export interface FAQ {
  id?: string;
  question: string;
  answer: string;
  order: number;
  active: boolean;
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
let _localCacheVersion = 0;

async function checkCacheVersion(): Promise<void> {
  const db = getDb();
  const doc = await db.collection("metadata").doc("cache_version").get();
  const remoteVersion = doc.exists ? doc.data()?.timestamp?.toMillis() || 0 : 0;
  if (remoteVersion > _localCacheVersion) {
    _cache.clear();
    _localCacheVersion = remoteVersion;
  }
}

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
  await checkCacheVersion();
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
  await checkCacheVersion();
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

export async function getNews(): Promise<NewsItem[]> {
  const raw = await queryCollection<NewsItem>(
    "News",
    [{ field: "active", op: "==", value: true }],
    { field: "publishedAt", direction: "desc" },
    50
  );
  return raw.map(n => ({
    ...n,
    image: n.image ? resolveImage(n.image) : undefined,
  }));
}

export async function getRecipes(): Promise<Recipe[]> {
  const raw = await queryCollection<Recipe>(
    "Recipes",
    [{ field: "active", op: "==", value: true }],
    { field: "title", direction: "asc" },
    50
  );
  return raw.map(r => ({
    ...r,
    image: r.image ? resolveImage(r.image) : undefined,
  }));
}

export async function getPromotions(): Promise<Promotion[]> {
  return queryCollection<Promotion>(
    "Promotions",
    [{ field: "active", op: "==", value: true }],
    { field: "order", direction: "asc" },
    10
  );
}

export async function getFaqs(): Promise<FAQ[]> {
  return queryCollection<FAQ>(
    "FAQs",
    [{ field: "active", op: "==", value: true }],
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

