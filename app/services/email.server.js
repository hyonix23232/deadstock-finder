import prisma from "../db.server";

export async function sendWeeklyEmail(shop) {
  const store = await prisma.store.findUnique({ where: { shop } });
  if (!store || !store.emailEnabled) return;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const newDeadStock = await prisma.deadStockEntry.findMany({
    where: { shop, flaggedAt: { gte: sevenDaysAgo }, resolved: false },
    include: { product: true },
  });

  const resolvedDeadStock = await prisma.deadStockEntry.findMany({
    where: { shop, resolvedAt: { gte: sevenDaysAgo }, resolved: true },
    include: { product: true },
  });

  const activeDeadStock = await prisma.deadStockEntry.findMany({
    where: { shop, resolved: false },
    include: { product: true },
  });

  const totalValue = activeDeadStock.reduce(
    (sum, e) => sum + e.product.price * e.product.inventoryCount, 0
  );

  const transporter = getTransporter();
  if (!transporter) return;

  const emailContent = {
    from: process.env.FROM_EMAIL || "noreply@deadstockfinder.com",
    to: shop,
    subject: `Dead Stock Finder — Weekly Report (${new Date().toLocaleDateString()})`,
    html: buildEmailHtml(newDeadStock, resolvedDeadStock, totalValue, store.threshold),
  };

  try {
    await transporter.sendMail(emailContent);
    console.log(`Weekly email sent to ${shop}`);
  } catch (err) {
    console.error(`Failed to send email to ${shop}:`, err.message);
  }
}

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  const nodemailer = await import("nodemailer");
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
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
