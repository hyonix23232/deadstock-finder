import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    const store = await prisma.store.findUnique({ where: { shop } });
    return new Response(JSON.stringify({
      scanStatus: store?.scanStatus || "pending",
      scanProgress: store?.scanProgress || 0,
      scanCurrentProduct: store?.scanCurrentProduct || 0,
      scanTotalProducts: store?.scanTotalProducts || 0,
    }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const { session } = await authenticate.admin(request);
  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  return new Response(JSON.stringify({
    scanStatus: store?.scanStatus || "pending",
    scanProgress: store?.scanProgress || 0,
    scanCurrentProduct: store?.scanCurrentProduct || 0,
    scanTotalProducts: store?.scanTotalProducts || 0,
  }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};
