const CLIENT_ID = "6b9c7399-c871-4eec-9007-49ccfbf59b01";
const SITE_ID   = "ce3c6696-e20c-4ed7-934e-04017b645c53";

async function run() {
  const r = await fetch('https://www.wixapis.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      grantType: 'client_credentials', 
      clientId: CLIENT_ID,
      clientSecret: "ec4fc311-378b-4350-9d5e-f6988e011d1d"
    })
  });
  const { access_token } = await r.json();

  const r2 = await fetch('https://www.wixapis.com/wix-data/v2/items/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'wix-site-id': SITE_ID,
      'Authorization': `Bearer ${access_token}`
    },
    body: JSON.stringify({ dataCollectionId: 'Products', query: { filter: { brandName: { $eq: "Pascual" } }, paging: { limit: 1 } } })
  });
  const data = await r2.json();
  console.log("PASCUAL PRODUCT:");
  console.log(JSON.stringify(data.dataItems.map(i => i.data), null, 2));
}
run();
