import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    await db.deadStockEntry.deleteMany({ where: { shop } });
    await db.excludedProduct.deleteMany({ where: { shop } });
    await db.product.deleteMany({ where: { shop } });
    await db.scanHistory.deleteMany({ where: { shop } });
    await db.store.deleteMany({ where: { shop } });
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
