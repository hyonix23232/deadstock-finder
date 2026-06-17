import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { scanStore } from "../services/scanner.server";
import { detectDeadStock } from "../services/detection.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
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
