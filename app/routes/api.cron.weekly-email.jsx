import prisma from "../db.server";
import { sendWeeklyEmail } from "../services/email.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const enabledStores = await prisma.store.findMany({
    where: { emailEnabled: true },
    select: { shop: true },
  });

  const results = [];

  for (const store of enabledStores) {
    try {
      const result = await sendWeeklyEmail(store.shop);
      if (result?.sent) {
        results.push({ shop: store.shop, status: "sent" });
      } else {
        results.push({ shop: store.shop, status: "skipped", reason: result?.reason || "unknown" });
      }
    } catch (e) {
      results.push({ shop: store.shop, status: "error", error: e.message });
    }
  }

  return new Response(JSON.stringify({
    sent: results.filter(r => r.status === "sent").length,
    errors: results.filter(r => r.status === "error").length,
    details: results,
  }), {
    headers: { "Content-Type": "application/json" },
  });
};
