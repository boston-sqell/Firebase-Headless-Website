// Mock import.meta.env
globalThis.import = { meta: { env: {} } };

import { getCmsData } from './src/lib/cms.ts';

async function run() {
  try {
    const data = await getCmsData();
    console.log("Site Data:", JSON.stringify(data.site, null, 2));
    const pascual = data.brands.find(b => b.name === 'Pascual');
    console.log("Pascual Brand:", JSON.stringify(pascual, null, 2));
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
