import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Card, Text, BlockStack, InlineStack, Button, ButtonGroup, Banner, DataTable, Badge } from "@shopify/polaris";
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
              onClick={() => window.location.href = "/app/settings"}
            >
              Upgrade Now
            </Button>
          </BlockStack>
        </Banner>
      </Page>
    );
  }

  const { scanHistory, deadStockHistory, stats } = data;

  const statCards = [
    { label: "Total Scans", value: stats.totalScans },
    { label: "Dead Stock Found", value: stats.totalDeadStockDetected },
    { label: "Resolved", value: stats.totalResolved },
  ];

  const historyRows = deadStockHistory.map((entry) => [
    entry.product?.title || "Unknown",
    new Date(entry.flaggedAt).toLocaleDateString(),
    `${entry.daysSinceSale}d`,
    <Badge tone={entry.resolved ? "success" : "critical"}>
      {entry.resolved ? "Resolved" : "Active"}
    </Badge>,
  ]);

  return (
    <Page title="Reports">
      <BlockStack gap="400">
        <InlineStack gap="300" wrap={false}>
          {statCards.map((s) => (
            <Card key={s.label} padding="300" style={{ flex: 1 }}>
              <BlockStack gap="100">
                <Text variant="bodySm" tone="subdued" as="span">{s.label}</Text>
                <Text variant="headingXl" as="p">{s.value}</Text>
              </BlockStack>
            </Card>
          ))}
        </InlineStack>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Recent Dead Stock History</Text>
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

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Export</Text>
            <ButtonGroup>
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
            </ButtonGroup>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
