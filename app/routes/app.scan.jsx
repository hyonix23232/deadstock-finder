import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { scanStore } from "../services/scanner.server";
import { detectDeadStock } from "../services/detection.server";

export const action = async ({ request }) => {
  let shop, session;

  try {
    const authResult = await authenticate.admin(request);
    if (!(authResult instanceof Response)) {
      session = authResult.session;
      shop = session.shop;
    }
  } catch {}

  if (!shop) {
    const url = new URL(request.url);
    shop = url.searchParams.get("shop");
  }

  if (!shop) {
    return new Response(JSON.stringify({ ok: false, error: "Missing shop parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!session) {
    const sessions = await prisma.session.findMany({ where: { shop } });
    for (const s of sessions) {
      try {
        const testUrl = `https://${s.shop}/admin/api/2026-04/graphql.json`;
        const testResp = await fetch(testUrl, {
          method: "POST",
          headers: { "X-Shopify-Access-Token": s.accessToken, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "query { shop { name } }" }),
        });
        if (testResp.ok) { session = s; break; }
      } catch {}
    }
  }

  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: "Session not found" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

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
    where: { shop },
    update: { threshold, onboardingDone: true, scanStatus: "scanning", scanProgress: 0, scanCurrentProduct: 0, scanTotalProducts: 0 },
    create: { shop, threshold: Number(threshold), onboardingDone: true, scanStatus: "scanning", scanProgress: 0, scanCurrentProduct: 0, scanTotalProducts: 0 },
  });

  (async () => {
    try {
      await scanStore(session, shop);
      await detectDeadStock(shop);
      await prisma.store.update({
        where: { shop },
        data: { scanStatus: "completed", scanProgress: 100 },
      });
    } catch (e) {
      const msg = e?.message || String(e);
      console.error("Background scan error:", msg, e?.stack || "");
      await prisma.store.update({
        where: { shop },
        data: { scanStatus: `error: ${msg.substring(0, 300)}` },
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
