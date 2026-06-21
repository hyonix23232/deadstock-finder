import prisma from "../db.server";

const BREVO_API = "https://api.brevo.com/v3/smtp/email";

export async function sendWeeklyEmail(shop) {
  const store = await prisma.store.findUnique({ where: { shop } });
  if (!store || !store.emailEnabled) return { sent: false, reason: "email disabled" };

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { sent: false, reason: "BREVO_API_KEY not configured" };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [newDeadStock, resolvedDeadStock, activeDeadStock] = await Promise.all([
    prisma.deadStockEntry.findMany({ where: { shop, flaggedAt: { gte: sevenDaysAgo }, resolved: false }, include: { product: true } }),
    prisma.deadStockEntry.findMany({ where: { shop, resolvedAt: { gte: sevenDaysAgo }, resolved: true }, include: { product: true } }),
    prisma.deadStockEntry.findMany({ where: { shop, resolved: false }, include: { product: true } }),
  ]);

  const totalValue = activeDeadStock.reduce((sum, e) => sum + e.product.price * Math.max(0, e.product.inventoryCount), 0);

  const sessions = await prisma.session.findMany({ where: { shop }, orderBy: { id: "desc" } });
  let toEmail = null;

  for (const s of sessions) {
    if (s.email) { toEmail = s.email; break; }
    if (s.accessToken) {
      try {
        const resp = await fetch(`https://${shop}/admin/api/2026-04/shop.json`, { headers: { "X-Shopify-Access-Token": s.accessToken } });
        if (resp.ok) { toEmail = (await resp.json()).shop.email; break; }
      } catch {}
    }
  }

  if (!toEmail) toEmail = process.env.TO_EMAIL;
  if (!toEmail) return { sent: false, reason: "no email found" };

  const html = buildEmailHtml(newDeadStock, resolvedDeadStock, totalValue, store.threshold);

  try {
    const resp = await fetch(BREVO_API, {
      method: "POST",
      headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { email: process.env.FROM_EMAIL || "noreply@deadstockfinder.com" },
        to: [{ email: toEmail }],
        subject: `Dead Stock Finder — Weekly Report (${new Date().toLocaleDateString()})`,
        htmlContent: html,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Brevo API error for ${shop}: ${resp.status} ${text.substring(0, 200)}`);
      return { sent: false, reason: `Brevo API ${resp.status}` };
    }
    console.log(`Weekly email sent to ${shop} (${toEmail})`);
    return { sent: true };
  } catch (err) {
    console.error(`Failed to send email to ${shop}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

function buildEmailHtml(newItems, resolvedItems, totalValue, threshold) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #202223;">Dead Stock Finder Weekly Report</h1>
  <p style="color: #6d7175;">Your inventory summary for the past 7 days</p>

  <div style="background: #f6f6f7; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="margin: 0; font-size: 14px; color: #6d7175;">Stuck Inventory Value</p>
    <p style="margin: 4px 0 0; font-size: 24px; font-weight: 600; color: #d82c0d;">$${totalValue.toFixed(2)}</p>
  </div>

  ${newItems.length > 0 ? `
  <h2 style="color: #202223;">New Dead Stock (${newItems.length})</h2>
  <ul style="padding-left: 20px;">
    ${newItems.map(item => `<li style="margin-bottom: 8px; color: #202223;">${item.product.title} — ${item.reason}</li>`).join("")}
  </ul>` : ""}

  ${resolvedItems.length > 0 ? `
  <h2 style="color: #202223;">Recovered Products (${resolvedItems.length})</h2>
  <ul style="padding-left: 20px;">
    ${resolvedItems.map(item => `<li style="margin-bottom: 8px; color: #202223;">${item.product.title}</li>`).join("")}
  </ul>` : ""}

  <hr style="border: none; border-top: 1px solid #d2d5d9; margin: 24px 0;">
  <p style="color: #6d7175; font-size: 12px;">
    Detection threshold: ${threshold} days<br>
    <a href="${process.env.SHOPIFY_APP_URL || "#"}">Open Dead Stock Finder dashboard</a>
  </p>
</body>
</html>`;
}
