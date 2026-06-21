import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Card, Text, BlockStack, InlineStack, Button, Banner, DataTable, Badge, Box } from "@shopify/polaris";
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
  const navigate = useNavigate();

  if (data.proOnly) {
    return (
      <Page title="Reports">
        <Banner tone="warning">
          <BlockStack gap="200">
            <Text variant="headingMd" as="h3">Upgrade to Pro</Text>
            <Text variant="bodyMd" as="p">
              Downloadable reports are available on the Pro plan. Upgrade to access full dead stock history,
              CSV and PDF exports, and detailed inventory insights.
            </Text>
            <Button
              variant="primary"
              onClick={() => navigate("/app/settings")}
            >
              Upgrade Now
            </Button>
          </BlockStack>
        </Banner>
      </Page>
    );
  }

  const { scanHistory, deadStockHistory, stats } = data;

  const statColor = {
    "Total Scans": "var(--p-color-border-info)",
    "Dead Stock Found": "var(--p-color-border-critical)",
    "Resolved": "var(--p-color-border-success)",
  };

  const statCards = [
    { label: "Total Scans", value: stats.totalScans, tone: undefined },
    { label: "Dead Stock Found", value: stats.totalDeadStockDetected, tone: stats.totalDeadStockDetected > 0 ? "critical" : "success" },
    { label: "Resolved", value: stats.totalResolved, tone: stats.totalResolved > 0 ? "success" : "subdued" },
  ];

  const historyRows = deadStockHistory.map((entry) => [
    entry.product?.title || "Unknown",
    new Date(entry.flaggedAt).toLocaleDateString(),
    `${entry.daysSinceSale}d`,
    <Badge tone={entry.resolved ? "success" : "critical"}>
      {entry.resolved ? "Resolved" : "Active"}
    </Badge>,
  ]);

  const scanRows = scanHistory.map((scan) => [
    new Date(scan.startedAt).toLocaleDateString(),
    new Date(scan.startedAt).toLocaleTimeString(),
    scan.productsScanned || "-",
    scan.status === "completed"
      ? <Badge tone="success">Completed</Badge>
      : scan.status === "failed"
      ? <Badge tone="critical">Failed</Badge>
      : <Badge tone="attention">In progress</Badge>,
  ]);

  return (
    <Page title="Reports">
      <BlockStack gap="400">
        <InlineStack gap="300" wrap={false}>
          {statCards.map((s) => (
            <div key={s.label} style={{ flex: 1, borderLeft: `4px solid ${statColor[s.label] || "transparent"}`, paddingLeft: 0 }}>
              <Card padding="400">
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="span">{s.label}</Text>
                  <Text variant="headingXl" as="p" tone={s.tone}>{s.value}</Text>
                </BlockStack>
              </Card>
            </div>
          ))}
        </InlineStack>

        <InlineStack gap="300" wrap={false}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Scan History</Text>
                {scanHistory.length === 0 ? (
                  <Text variant="bodyMd" as="p" tone="subdued">No scans recorded yet.</Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "numeric", "text"]}
                    headings={["Date", "Time", "Products", "Status"]}
                    rows={scanRows}
                  />
                )}
              </BlockStack>
            </Card>
          </div>

          <div style={{ flex: 2, minWidth: 400 }}>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Dead Stock History</Text>
                {deadStockHistory.length === 0 ? (
                  <Text variant="bodyMd" as="p" tone="subdued">No dead stock history yet.</Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "numeric", "text"]}
                    headings={["Product", "Flagged", "Days", "Status"]}
                    rows={historyRows}
                  />
                )}
              </BlockStack>
            </Card>
          </div>
        </InlineStack>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Export Reports</Text>
            <Text variant="bodySm" as="p" tone="subdued">
              Download your dead stock data for external analysis or record keeping.
            </Text>
            <InlineStack gap="200">
              <Button
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
              </Button>
              <Button
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
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
