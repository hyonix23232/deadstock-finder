import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { scanStore } from "../services/scanner.server";
import { detectDeadStock } from "../services/detection.server";

export const action = async ({ request }) => {
  try {
    const authResult = await authenticate.admin(request);
    if (authResult instanceof Response) {
      return new Response(JSON.stringify({ ok: false, error: "auth_redirect" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const { session } = authResult;
    const { threshold } = await request.json();

    await prisma.store.upsert({
      where: { shop: session.shop },
      update: { threshold, onboardingDone: true, scanStatus: "scanning", scanProgress: 0 },
      create: { shop: session.shop, threshold: Number(threshold), onboardingDone: true, scanStatus: "scanning", scanProgress: 0 },
    });

    (async () => {
      try {
        await scanStore(session, session.shop);
        await detectDeadStock(session.shop, {
          onProgress: (current, total) => {
            const pct = Math.min(99, Math.round((current / total) * 100));
            prisma.store.update({ where: { shop: session.shop }, data: { scanProgress: pct, scanCurrentProduct: current, scanTotalProducts: total } }).catch(() => {});
          },
        });
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
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export default function Scan() {
  return null;
}
