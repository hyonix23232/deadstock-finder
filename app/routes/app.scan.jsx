export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { scanStore } = await import("../services/scanner.server");
  const { detectDeadStock } = await import("../services/detection.server");

  const authResult = await authenticate.admin(request);
  if (authResult instanceof Response) return authResult;
  const { session, admin } = authResult;

  const contentType = request.headers.get("content-type") || "";
  let threshold = 60;
  if (contentType.includes("json")) {
    const body = await request.json();
    threshold = body.threshold ?? 60;
  } else {
    const formData = await request.formData();
    threshold = parseInt(formData.get("threshold") || "60", 10);
  }

  await prisma.store.upsert({
    where: { shop: session.shop },
    update: { threshold, scanStatus: "scanning", scanProgress: 0, scanCurrentProduct: 0, scanTotalProducts: 0 },
    create: { shop: session.shop, threshold: Number(threshold), scanStatus: "scanning", scanProgress: 0, scanCurrentProduct: 0, scanTotalProducts: 0 },
  });

  (async () => {
    try {
      await scanStore(session, session.shop);
      await detectDeadStock(session.shop);
      await prisma.store.update({
        where: { shop: session.shop },
        data: { scanStatus: "completed", scanProgress: 100 },
      });
    } catch (e) {
      console.error("Background scan error:", e?.message || e, e?.stack || "");
      await prisma.store.update({
        where: { shop: session.shop },
        data: { scanStatus: "pending" },
      });
    }
  })();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export default function Scan() {
  return null;
}
