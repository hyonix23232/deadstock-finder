import prisma from "../db.server";
import { scanStore } from "../services/scanner.server";
import { detectDeadStock } from "../services/detection.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  let shop, store;

  try {
    const { session, redirect } = await authenticate.admin(request);
    shop = session.shop;
    const threshold = parseInt(new URL(request.url).searchParams.get("threshold") || "60", 10);

    await prisma.store.upsert({
      where: { shop },
      update: { threshold, onboardingDone: true, scanStatus: "scanning", scanProgress: 0, scanCurrentProduct: 0, scanTotalProducts: 0 },
      create: { shop, threshold: Number(threshold), onboardingDone: true, scanStatus: "scanning", scanProgress: 0, scanCurrentProduct: 0, scanTotalProducts: 0 },
    });

    const dbSessions = await prisma.session.findMany({ where: { shop } });
    for (const s of dbSessions) {
      try {
        const testUrl = `https://${s.shop}/admin/api/2026-04/graphql.json`;
        const testResp = await fetch(testUrl, {
          method: "POST",
          headers: { "X-Shopify-Access-Token": s.accessToken, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "query { shop { name } }" }),
        });
        if (testResp.ok) {
          (async () => {
            try {
              await scanStore(s, shop);
              await detectDeadStock(shop);
              await prisma.store.update({ where: { shop }, data: { scanStatus: "completed", scanProgress: 100 } });
            } catch (e) {
              const msg = e?.message || String(e);
              console.error("Background scan error:", msg, e?.stack || "");
              await prisma.store.update({ where: { shop }, data: { scanStatus: `error: ${msg.substring(0, 300)}` } });
            }
          })();
          break;
        }
      } catch {}
    }

    return redirect("/app");
  } catch (e) {
    if (e instanceof Response) return e;
    const url = new URL(request.url);
    shop = url.searchParams.get("shop");
    if (shop) {
      const threshold = parseInt(url.searchParams.get("threshold") || "60", 10);
      await prisma.store.upsert({
        where: { shop },
        update: { threshold, onboardingDone: true },
        create: { shop, threshold: Number(threshold), onboardingDone: true },
      });
    }
    const host = url.searchParams.get("host") || "";
    const locale = url.searchParams.get("locale") || "en-US";
    const params = new URLSearchParams({ shop: shop || "", host, embedded: "1", locale });
    return new Response(null, { status: 302, headers: { Location: `/app?${params}` } });
  }
};

export default function Start() {
  return null;
}
