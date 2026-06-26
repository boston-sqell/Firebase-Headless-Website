export const CLIENT_ID = import.meta.env.WIX_CLIENT_ID as string;
export const SITE_ID   = import.meta.env.WIX_CLIENT_INSTANCE_ID as string;

export async function getToken(): Promise<string> {
  const r = await fetch('https://www.wixapis.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: CLIENT_ID, grantType: 'anonymous' })
  });
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
    img: p.image
  }));

  return { products: mappedProducts, brands, site: siteArr[0] || {} };
}
