import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { hasFeature } from "../services/billing.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);

  if (!hasFeature(store.plan, "reports")) {
    return { proOnly: true, plan: store.plan };
  }

  const scanHistory = await prisma.scanHistory.findMany({
    where: { shop: session.shop },
    orderBy: { startedAt: "desc" },
    take: 12,
  });

  const deadStockHistory = await prisma.deadStockEntry.findMany({
    where: { shop: session.shop },
    include: { product: true },
    orderBy: { flaggedAt: "desc" },
    take: 50,
  });

  const totalScans = await prisma.scanHistory.count({ where: { shop: session.shop } });
  const totalDeadStockDetected = await prisma.deadStockEntry.count({ where: { shop: session.shop } });
  const totalResolved = await prisma.deadStockEntry.count({ where: { shop: session.shop, resolved: true } });

  return {
    proOnly: false,
    plan: store.plan,
    scanHistory,
    deadStockHistory,
    stats: { totalScans, totalDeadStockDetected, totalResolved },
  };
};

export default function Reports() {
  const data = useLoaderData();

  if (data.proOnly) {
    return (
      <s-page heading="Reports">
        <s-section>
          <s-banner status="warning">
            <s-heading>Upgrade to Pro</s-heading>
            <s-paragraph>
              Downloadable reports are available on the Pro plan. Upgrade to access full dead stock history,
              CSV and PDF exports, and detailed inventory insights.
            </s-paragraph>
            <s-button
              variant="primary"
              onClick={() => window.location.href = "/app/settings"}
            >
              Upgrade Now
            </s-button>
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  const { scanHistory, deadStockHistory, stats } = data;

  return (
    <s-page heading="Reports">
      <s-section>
        <s-flex gap="base" wrap="wrap">
          <s-card padding="base" style={{ flex: 1, minWidth: 150 }}>
            <s-text size="small" color="subdued">Total Scans</s-text>
            <s-text size="xlarge" variant="strong">{stats.totalScans}</s-text>
          </s-card>
          <s-card padding="base" style={{ flex: 1, minWidth: 150 }}>
            <s-text size="small" color="subdued">Dead Stock Found</s-text>
            <s-text size="xlarge" variant="strong">{stats.totalDeadStockDetected}</s-text>
          </s-card>
          <s-card padding="base" style={{ flex: 1, minWidth: 150 }}>
            <s-text size="small" color="subdued">Resolved</s-text>
            <s-text size="xlarge" variant="strong">{stats.totalResolved}</s-text>
          </s-card>
        </s-flex>
      </s-section>

      <s-section heading="Recent Dead Stock History">
        {deadStockHistory.length === 0 ? (
          <s-paragraph>No dead stock history yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header>
              <s-table-header-cell>Product</s-table-header-cell>
              <s-table-header-cell>Flagged</s-table-header-cell>
              <s-table-header-cell>Days</s-table-header-cell>
              <s-table-header-cell>Status</s-table-header-cell>
            </s-table-header>
            <s-table-body>
              {deadStockHistory.map((entry) => (
                <s-table-row key={entry.id}>
                  <s-table-cell>{entry.product?.title || "Unknown"}</s-table-cell>
                  <s-table-cell>{new Date(entry.flaggedAt).toLocaleDateString()}</s-table-cell>
                  <s-table-cell>{entry.daysSinceSale}d</s-table-cell>
                  <s-table-cell>
                    <s-badge variant={entry.resolved ? "success" : "critical"}>
                      {entry.resolved ? "Resolved" : "Active"}
                    </s-badge>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Export">
        <s-flex gap="base" wrap="wrap">
          <s-button
            variant="secondary"
            onClick={async () => {
              const res = await fetch("/app/reports/export?format=csv");
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "deadstock-report.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export as CSV
          </s-button>
          <s-button
            variant="secondary"
            onClick={async () => {
              const res = await fetch("/app/reports/export?format=pdf");
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "deadstock-report.pdf";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export as PDF
          </s-button>
        </s-flex>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
