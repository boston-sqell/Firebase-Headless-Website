export const CLIENT_ID = import.meta.env.WIX_CLIENT_ID || "6b9c7399-c871-4eec-9007-49ccfbf59b01";
export const SITE_ID   = "ce3c6696-e20c-4ed7-934e-04017b645c53"; // From wix.config.json

export function resolveWixImage(url?: string): string {
  if (!url) return '/logo.png';
  if (!url.startsWith('wix:image://v1/')) return url;
  const parts = url.split('/');
  if (parts.length > 3) {
    return `https://static.wixstatic.com/media/${parts[3]}`;
  }
  return '/logo.png';
}

export async function getToken(): Promise<string> {
  const clientSecret = import.meta.env.WIX_CLIENT_SECRET || "ec4fc311-378b-4350-9d5e-f6988e011d1d";
  
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
  }
  
  const d = await r.json() as { access_token: string };
  return d.access_token;
}

export async function query(
  token: string,
  collectionId: string,
  filter?: object,
  limit = 1000,
  sort?: object[]
): Promise<any[]> {
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
  return (d.dataItems || []).map(i => i.data || i);
}

export async function getCmsData() {
  const token = await getToken();
  const [products, brands, siteArr] = await Promise.all([
    query(token, 'Products', { active: { $eq: true } }, 1000, [{ fieldName: 'name', order: 'ASC' }]),
    query(token, 'Brands',   { active: { $eq: true } }, 100,  [{ fieldName: 'name', order: 'ASC' }]),
    query(token, 'SiteContent', undefined, 1)
  ]);

  const mappedProducts = products.map((p: any) => ({
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

  return { products: mappedProducts, brands, site: siteArr[0] || {} };
}
