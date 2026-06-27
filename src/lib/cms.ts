export const CLIENT_ID = import.meta.env.WIX_CLIENT_ID || "6b9c7399-c871-4eec-9007-49ccfbf59b01";
export const SITE_ID   = "ce3c6696-e20c-4ed7-934e-04017b645c53"; // From wix.config.json

export interface Product {
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
}

export interface Brand {
  name: string;
  slug: string;
  logo?: string;
  active: boolean;
}

export interface Category {
  name: string;
  description?: string;
  tag?: string;
  order: number;
  image?: string;
}

export function resolveWixImage(url?: string): string {
  if (!url) return '/logo.png';
  if (!url.startsWith('wix:image://v1/')) return url;
  const parts = url.split('/');
  if (parts.length > 3) {
    return `https://static.wixstatic.com/media/${parts[3]}`;
  }
  return '/logo.png';
}

const _cache = new Map<string, { value: any; expiry: number }>();
const CACHE_TTL_MS = 60 * 5 * 1000; // 5 minutes

export async function getToken(): Promise<string> {
  const cacheKey = 'wix_token';
  const cached = _cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.value;
  }

  // WIX_CLIENT_SECRET removed for security
  const clientSecret = import.meta.env.WIX_CLIENT_SECRET;
  if (!clientSecret) {
    console.error('WIX_CLIENT_SECRET is missing. API calls will fail.');
  }

  const r = await fetch('https://www.wixapis.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      grantType: 'client_credentials', 
      clientId: CLIENT_ID,
      clientSecret: clientSecret
    })
  });
  
  if (!r.ok) {
    console.error('Failed to get Wix token:', await r.text());
    return "";
  }
  
  const d = await r.json() as { access_token: string };
  _cache.set(cacheKey, { value: d.access_token, expiry: Date.now() + CACHE_TTL_MS });
  return d.access_token;
}

export async function query(
  token: string,
  collectionId: string,
  filter?: object,
  limit = 1000,
  sort?: object[]
): Promise<any[]> {
  if (!token) return [];

  const cacheKey = `query_${collectionId}_${JSON.stringify(filter)}_${limit}_${JSON.stringify(sort)}`;
  const cached = _cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.value;
  }

  const body: Record<string, unknown> = {
    dataCollectionId: collectionId,
    query: { paging: { limit } }
  };
  if (filter) (body.query as Record<string, unknown>).filter = filter;
  if (sort)   (body.query as Record<string, unknown>).sort   = sort;

  const r = await fetch('https://www.wixapis.com/wix-data/v2/items/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'wix-site-id': SITE_ID,
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  
  if (!r.ok) {
    console.error(`Wix API Error (Collection: ${collectionId}):`, await r.text());
    return [];
  }
  
  const d = await r.json() as { dataItems?: { data?: any }[] };
  const res = (d.dataItems || []).map(i => i.data || i);
  _cache.set(cacheKey, { value: res, expiry: Date.now() + CACHE_TTL_MS });
  return res;
}

export async function getProducts() {
  const token = await getToken();
  const products = await query(token, 'Products', { active: { $eq: true } }, 1000, [{ fieldName: 'name', order: 'ASC' }]);
  return products.map((p: Product) => ({
    n: p.name,
    b: p.brandName,
    cat: p.category,
    c: p.code,
    sub: p.subcategory,
    pr: p.price,
    p: p.packSize,
    bs: p.brandSlug,
    kw: p.keywords,
    img: resolveWixImage(p.image)
  }));
}

export async function getBrands() {
  const token = await getToken();
  return query(token, 'Brands', { active: { $eq: true } }, 100, [{ fieldName: 'name', order: 'ASC' }]);
}

export async function getSiteContent() {
  const token = await getToken();
  const siteArr = await query(token, 'SiteContent', undefined, 1);
  return siteArr[0] || {};
}

export async function getCategories() {
  const token = await getToken();
  const categories = await query(token, 'Categories', undefined, 50, [{ fieldName: 'order', order: 'ASC' }]);
  return categories.map((c: Category) => ({
    name: c.name,
    description: c.description,
    tag: c.tag,
    order: c.order,
    image: resolveWixImage(c.image)
  }));
}

export async function getCmsData() {
  const [products, brands, site] = await Promise.all([
    getProducts(),
    getBrands(),
    getSiteContent()
  ]);
  return { products, brands, site };
}
