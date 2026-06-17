import { authenticate } from "../shopify.server";
import { hasFeature } from "../services/billing.server";
import { generateCsv, generateHtmlReport } from "../services/reports.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await prisma.store.findUnique({ where: { shop: session.shop } });

  if (!store || !hasFeature(store.plan, "reports")) {
    return new Response("Upgrade to Pro to access reports", { status: 403 });
  }

  const format = new URL(request.url).searchParams.get("format") || "csv";

  const entries = await prisma.deadStockEntry.findMany({
    where: { shop: session.shop },
    include: { product: true },
    orderBy: { flaggedAt: "desc" },
  });

  if (format === "csv") {
    const csv = generateCsv(entries);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="deadstock-report.csv"',
      },
    });
  }

  if (format === "pdf") {
    const html = generateHtmlReport(entries, session.shop);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": 'attachment; filename="deadstock-report.html"',
      },
    });
  }

  return new Response("Invalid format", { status: 400 });
};
