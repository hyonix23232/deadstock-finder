export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { scanStore } = await import("../services/scanner.server");
  const { detectDeadStock } = await import("../services/detection.server");

  try {
    const authResult = await authenticate.admin(request);
    if (authResult instanceof Response) {
      return new Response(JSON.stringify({ ok: false, error: "auth_redirect" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const { session, admin } = authResult;
    const { threshold } = await request.json();

    await prisma.store.upsert({
      where: { shop: session.shop },
      update: { threshold, onboardingDone: true, scanStatus: "scanning", scanProgress: 0 },
      create: { shop: session.shop, threshold: Number(threshold), onboardingDone: true, scanStatus: "scanning", scanProgress: 0 },
    });

    (async () => {
      try {
        await scanStore(admin, session.shop);
        await detectDeadStock(session.shop);
        await prisma.store.update({
          where: { shop: session.shop },
          data: { scanStatus: "completed", scanProgress: 100 },
        });
      } catch (e) {
        console.error("Background scan error:", e);
      }
    })();

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Scan error:", e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export default function Scan() {
  return null;
}
