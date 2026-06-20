import prisma from "../db.server";
import { scanStore } from "../services/scanner.server";
import { detectDeadStock } from "../services/detection.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const url = new URL(request.url);
  const { session, redirect } = await authenticate.admin(request);
  const shop = url.searchParams.get("shop") || session.shop;
  const formData = await request.formData();
  const threshold = parseInt(formData.get("threshold") || "60", 10);

  await prisma.store.upsert({
    where: { shop },
    update: { threshold, onboardingDone: true, scanStatus: "scanning", scanProgress: 0, scanCurrentProduct: 0, scanTotalProducts: 0 },
    create: { shop, threshold: Number(threshold), onboardingDone: true, scanStatus: "scanning", scanProgress: 0, scanCurrentProduct: 0, scanTotalProducts: 0 },
  });

  const sessions = await prisma.session.findMany({ where: { shop } });
  for (const s of sessions) {
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

  const host = url.searchParams.get("host");
  const locale = url.searchParams.get("locale") || "en-US";
  const params = new URLSearchParams({ shop, host, embedded: "1", locale });
  return redirect(`/app?${params.toString()}`);
};

export const loader = async ({ request }) => {
  const { redirect } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const locale = url.searchParams.get("locale") || "en-US";
  const params = new URLSearchParams({ shop, host, embedded: "1", locale });
  return redirect(`/app?${params.toString()}`);
};

export default function Start() {
  return null;
}
