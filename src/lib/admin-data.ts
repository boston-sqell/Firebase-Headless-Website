/**
 * Admin write layer -- everything that mutates Firestore.
 *
 * Kept separate from cms.ts (the public read layer) so it's obvious which
 * functions are safe to call from public pages/API routes (cms.ts, always
 * read-only) versus which must only ever be reached from code already
 * gated behind requireAdminSession() (everything in this file).
 *
 * Every write here calls invalidateCmsCache() so the public site reflects
 * edits immediately instead of waiting out cms.ts's cache TTL.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./firebase-admin";
import { invalidateCmsCache } from "./cms";
import type { Product, Brand, Category } from "./cms";

export async function bumpCacheVersion(): Promise<void> {
  await getDb().collection("metadata").doc("cache_version").set({
    timestamp: FieldValue.serverTimestamp()
  }, { merge: true });
}

// ---------- Products ----------

export async function adminListProducts(): Promise<Product[]> {
  const snap = await getDb().collection("Products").orderBy("name", "asc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
}

export async function adminGetProduct(id: string): Promise<Product | null> {
  const doc = await getDb().collection("Products").doc(id).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() } as Product) : null;
}

export async function adminCreateProduct(data: Omit<Product, "id">): Promise<string> {
  const ref = await getDb().collection("Products").add({
    ...data,
    active: data.active ?? true,
    _updatedAt: FieldValue.serverTimestamp(),
  });
  invalidateCmsCache();
  await bumpCacheVersion();
  return ref.id;
}

export async function adminUpdateProduct(id: string, data: Partial<Product>): Promise<void> {
  await getDb().collection("Products").doc(id).set(
    { ...data, _updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  invalidateCmsCache();
  await bumpCacheVersion();
}

export async function adminDeleteProduct(id: string): Promise<void> {
  await getDb().collection("Products").doc(id).delete();
  invalidateCmsCache();
  await bumpCacheVersion();
}

// ---------- Brands ----------

export async function adminListBrands(): Promise<Brand[]> {
  const snap = await getDb().collection("Brands").orderBy("name", "asc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Brand));
}

export async function adminGetBrand(id: string): Promise<Brand | null> {
  const doc = await getDb().collection("Brands").doc(id).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() } as Brand) : null;
}

export async function adminCreateBrand(data: Omit<Brand, "id">): Promise<string> {
  const ref = await getDb().collection("Brands").add({
    ...data,
    active: data.active ?? true,
    _updatedAt: FieldValue.serverTimestamp(),
  });
  invalidateCmsCache();
  return ref.id;
}

export async function adminUpdateBrand(id: string, data: Partial<Brand>): Promise<void> {
  await getDb().collection("Brands").doc(id).set(
    { ...data, _updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  invalidateCmsCache();
  await bumpCacheVersion();
}

export async function adminDeleteBrand(id: string): Promise<void> {
  await getDb().collection("Brands").doc(id).delete();
  invalidateCmsCache();
  await bumpCacheVersion();
}

// ---------- Categories ----------

export async function adminListCategories(): Promise<Category[]> {
  const snap = await getDb().collection("Categories").orderBy("order", "asc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Category));
}

export async function adminGetCategory(id: string): Promise<Category | null> {
  const doc = await getDb().collection("Categories").doc(id).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() } as Category) : null;
}

export async function adminCreateCategory(data: Omit<Category, "id">): Promise<string> {
  const ref = await getDb().collection("Categories").add({
    ...data,
    _updatedAt: FieldValue.serverTimestamp(),
  });
  invalidateCmsCache();
  return ref.id;
}

export async function adminUpdateCategory(id: string, data: Partial<Category>): Promise<void> {
  await getDb().collection("Categories").doc(id).set(
    { ...data, _updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  invalidateCmsCache();
  await bumpCacheVersion();
}

export async function adminDeleteCategory(id: string): Promise<void> {
  await getDb().collection("Categories").doc(id).delete();
  invalidateCmsCache();
  await bumpCacheVersion();
}

// ---------- Milestones ----------

export async function adminListMilestones(): Promise<any[]> {
  const snap = await getDb().collection("Milestones").orderBy("order", "asc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function adminGetMilestone(id: string): Promise<any | null> {
  const doc = await getDb().collection("Milestones").doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

export { getDb };

export async function adminCreateMilestone(data: any): Promise<string> {
  const ref = await getDb().collection("Milestones").add({
    ...data,
    _updatedAt: FieldValue.serverTimestamp(),
  });
  invalidateCmsCache();
  return ref.id;
}

export async function adminUpdateMilestone(id: string, data: any): Promise<void> {
  await getDb().collection("Milestones").doc(id).set(
    { ...data, _updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  invalidateCmsCache();
  await bumpCacheVersion();
}

export async function adminDeleteMilestone(id: string): Promise<void> {
  await getDb().collection("Milestones").doc(id).delete();
  invalidateCmsCache();
  await bumpCacheVersion();
}

// ---------- News ----------

export async function adminListNews(): Promise<any[]> {
  const snap = await getDb().collection("News").orderBy("publishedAt", "desc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function adminGetNewsItem(id: string): Promise<any | null> {
  const doc = await getDb().collection("News").doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

export async function adminCreateNewsItem(data: any): Promise<string> {
  const ref = await getDb().collection("News").add({
    ...data,
    _updatedAt: FieldValue.serverTimestamp(),
  });
  invalidateCmsCache();
  await bumpCacheVersion();
  return ref.id;
}

export async function adminUpdateNewsItem(id: string, data: any): Promise<void> {
  await getDb().collection("News").doc(id).set(
    { ...data, _updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  invalidateCmsCache();
  await bumpCacheVersion();
}

export async function adminDeleteNewsItem(id: string): Promise<void> {
  await getDb().collection("News").doc(id).delete();
  invalidateCmsCache();
  await bumpCacheVersion();
}

// ---------- Recipes ----------

export async function adminListRecipes(): Promise<any[]> {
  const snap = await getDb().collection("Recipes").orderBy("title", "asc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function adminGetRecipe(id: string): Promise<any | null> {
  const doc = await getDb().collection("Recipes").doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

export async function adminCreateRecipe(data: any): Promise<string> {
  const ref = await getDb().collection("Recipes").add({
    ...data,
    _updatedAt: FieldValue.serverTimestamp(),
  });
  invalidateCmsCache();
  await bumpCacheVersion();
  return ref.id;
}

export async function adminUpdateRecipe(id: string, data: any): Promise<void> {
  await getDb().collection("Recipes").doc(id).set(
    { ...data, _updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  invalidateCmsCache();
  await bumpCacheVersion();
}

export async function adminDeleteRecipe(id: string): Promise<void> {
  await getDb().collection("Recipes").doc(id).delete();
  invalidateCmsCache();
  await bumpCacheVersion();
}

// ---------- Promotions ----------
export async function adminListPromotions(): Promise<any[]> {
  const snap = await getDb().collection("Promotions").orderBy("order", "asc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function adminGetPromotion(id: string): Promise<any | null> {
  const doc = await getDb().collection("Promotions").doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}
export async function adminCreatePromotion(data: any): Promise<string> {
  const ref = await getDb().collection("Promotions").add({ ...data, _updatedAt: FieldValue.serverTimestamp() });
  invalidateCmsCache();
  await bumpCacheVersion();
  return ref.id;
}
export async function adminUpdatePromotion(id: string, data: any): Promise<void> {
  await getDb().collection("Promotions").doc(id).set({ ...data, _updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  invalidateCmsCache();
  await bumpCacheVersion();
}
export async function adminDeletePromotion(id: string): Promise<void> {
  await getDb().collection("Promotions").doc(id).delete();
  invalidateCmsCache();
  await bumpCacheVersion();
}

// ---------- FAQs ----------
export async function adminListFAQs(): Promise<any[]> {
  const snap = await getDb().collection("FAQs").orderBy("order", "asc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function adminGetFAQ(id: string): Promise<any | null> {
  const doc = await getDb().collection("FAQs").doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}
export async function adminCreateFAQ(data: any): Promise<string> {
  const ref = await getDb().collection("FAQs").add({ ...data, _updatedAt: FieldValue.serverTimestamp() });
  invalidateCmsCache();
  await bumpCacheVersion();
  return ref.id;
}
export async function adminUpdateFAQ(id: string, data: any): Promise<void> {
  await getDb().collection("FAQs").doc(id).set({ ...data, _updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  invalidateCmsCache();
  await bumpCacheVersion();
}
export async function adminDeleteFAQ(id: string): Promise<void> {
  await getDb().collection("FAQs").doc(id).delete();
  invalidateCmsCache();
  await bumpCacheVersion();
}

// ---------- Site content (headings, hero images, per-page copy) ----------

export async function adminGetSiteContent(): Promise<Record<string, string>> {
  const doc = await getDb().collection("SiteContent").doc("main").get();
  return doc.exists ? (doc.data() as Record<string, string>) : {};
}

export async function adminUpdateSiteContent(patch: Record<string, string>): Promise<void> {
  await getDb().collection("SiteContent").doc("main").set(
    { ...patch, _updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  invalidateCmsCache();
  await bumpCacheVersion();
}

// ---------- Contact submissions ----------

export interface ContactSubmission {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message: string;
  read: boolean;
  submittedAt?: FirebaseFirestore.Timestamp;
}

export async function createContactSubmission(data: {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message: string;
}): Promise<string> {
  const ref = await getDb().collection("ContactSubmissions").add({
    ...data,
    read: false,
    submittedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function adminListContactSubmissions(): Promise<ContactSubmission[]> {
  const snap = await getDb()
    .collection("ContactSubmissions")
    .orderBy("submittedAt", "desc")
    .limit(200)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ContactSubmission));
}

export async function adminMarkContactSubmissionRead(id: string, read = true): Promise<void> {
  await getDb().collection("ContactSubmissions").doc(id).set({ read }, { merge: true });
}

export async function adminDeleteContactSubmission(id: string): Promise<void> {
  await getDb().collection("ContactSubmissions").doc(id).delete();
}
