export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { getOrCreateStore } = await import("../services/store.server");
  const { scanStore } = await import("../services/scanner.server");
  const { detectDeadStock } = await import("../services/detection.server");

  try {
    const { session, admin } = await authenticate.admin(request);
    const { threshold } = await request.json();

    await prisma.store.update({
      where: { shop: session.shop },
      data: { threshold, onboardingDone: true, scanStatus: "scanning", scanProgress: 0 },
    });

    await scanStore(admin, session.shop);
    await detectDeadStock(session.shop);

    await prisma.store.update({
      where: { shop: session.shop },
      data: { scanStatus: "completed", scanProgress: 100 },
    });

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
