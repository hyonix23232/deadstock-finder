import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  return { scanStatus: store?.scanStatus || "pending", scanProgress: store?.scanProgress || 0 };
};
