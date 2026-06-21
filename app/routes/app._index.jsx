import { useLoaderData, useFetcher, useNavigate, Navigate } from "react-router";
import { useEffect, useState, useCallback, useMemo } from "react";

import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Card, Text, BlockStack, InlineStack, Button, ButtonGroup, Banner, Badge, ProgressBar, DataTable, ChoiceList, Select, EmptyState, Box, Checkbox } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { getDashboardStats, refreshDeadStock } from "../services/detection.server";
import { hasFeature } from "../services/billing.server";
import { generateCsv } from "../services/reports.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);

  const url = new URL(request.url);
  if (!store.onboardingDone) {
    const shop = url.searchParams.get("shop") || session.shop;
    const storeName = shop.replace(".myshopify.com", "");
    const host = url.searchParams.get("host") || Buffer.from(`admin.shopify.com/store/${storeName}`).toString("base64").replace(/=+$/, "");
    const locale = url.searchParams.get("locale") || "en-US";
    return { redirectTo: `/app/onboarding?${new URLSearchParams({ shop, host, embedded: "1", locale }).toString()}`, stats: null, deadStock: [], plan: "free", canBulk: false, needsScan: false };
  }

  if (store.scanStatus === "scanning") {
    const staleMs = Date.now() - new Date(store.updatedAt).getTime();
    if (staleMs > 60000) {
      await prisma.store.update({
        where: { shop: session.shop },
        data: { scanStatus: "pending", scanProgress: 0 },
      });
      store.scanStatus = "pending";
    }
  }

  const needsScan = !store.lastScanAt ||
    (Date.now() - new Date(store.lastScanAt).getTime()) > 24 * 60 * 60 * 1000;

  await refreshDeadStock(session.shop);
  const stats = await getDashboardStats(session.shop);

  const deadStock = await prisma.deadStockEntry.findMany({
    where: { shop: session.shop, resolved: false },
    include: { product: true },
    orderBy: { daysSinceSale: "desc" },
  });

  const plan = store.plan;
  return { redirectTo: "", stats, deadStock, plan, canBulk: hasFeature(plan, "bulk"), needsScan, scanStatus: store.scanStatus };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "exclude") {
    const productId = formData.get("productId");
    await prisma.excludedProduct.create({
      data: { productId, shop: session.shop, reason: formData.get("reason") || null },
    });
    await prisma.deadStockEntry.updateMany({
      where: { productId, shop: session.shop },
      data: { resolved: true, resolvedAt: new Date() },
    });
  }

  if (action === "bulk-discount") {
    const ids = JSON.parse(formData.get("ids") || "[]");
    for (const id of ids) {
      await prisma.deadStockEntry.updateMany({
        where: { productId: id, shop: session.shop },
        data: { resolved: true, resolvedAt: new Date() },
      });
    }
  }

  if (action === "bulk-archive") {
    const ids = JSON.parse(formData.get("ids") || "[]");
    for (const id of ids) {
      await prisma.deadStockEntry.updateMany({
        where: { productId: id, shop: session.shop },
        data: { resolved: true, resolvedAt: new Date() },
      });
    }
  }

  if (action === "bulk-export") {
    const ids = JSON.parse(formData.get("ids") || "[]");
    const entries = await prisma.deadStockEntry.findMany({
      where: { productId: { in: ids }, shop: session.shop, resolved: false },
      include: { product: true },
    });
    const csv = generateCsv(entries);
    return new Response(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=deadstock-export.csv" },
    });
  }

  return null;
};

function BadgeForAction({ action, data }) {
  const map = {
    discount: { tone: "attention", label: `${data?.percentage || 20}% off` },
    bundle: { tone: "info", label: "Bundle" },
    archive: { tone: "critical", label: "Archive" },
  };
  const m = map[action] || { tone: "info", label: action };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export default function Dashboard() {
  const { redirectTo, stats, deadStock, plan, canBulk, needsScan, scanStatus } = useLoaderData();
  const fetcher = useFetcher();

  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }
  const navigate = useNavigate();
  const [selected, setSelected] = useState(new Set());
  const [sortBy, setSortBy] = useState("days");
  const [order, setOrder] = useState("desc");
  const [filter, setFilter] = useState("all");
  const [scanProgress, setScanProgress] = useState(0);
  const [scanCurrent, setScanCurrent] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);

  const processedDeadStock = useMemo(() => {
    let items = [...deadStock];
    if (filter === "discount") items = items.filter(e => e.suggestedAction === "discount");
    else if (filter === "bundle") items = items.filter(e => e.suggestedAction === "bundle");
    else if (filter === "archive") items = items.filter(e => e.suggestedAction === "archive");
    items.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "price") cmp = a.product.price - b.product.price;
      else if (sortBy === "days") cmp = a.daysSinceSale - b.daysSinceSale;
      return order === "asc" ? cmp : -cmp;
    });
    return items;
  }, [deadStock, filter, sortBy, order]);

  const scanning = scanStatus === "scanning";
  const [polling, setPolling] = useState(scanning);

  useEffect(() => {
    if (!redirectTo && stats && typeof window !== "undefined" && window.shopify?.navigation) {
      const count = stats.totalDeadStock;
      window.shopify.navigation.update({ badge: { value: count } });
    }
  }, [redirectTo, stats]);

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === processedDeadStock.length && processedDeadStock.length > 0) setSelected(new Set());
    else setSelected(new Set(processedDeadStock.map((e) => e.product.id)));
  };

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      if (typeof window !== "undefined" && window.shopify?.toast) {
        window.shopify.toast.show("Action completed");
      }
    }
  }, [fetcher.data, fetcher.state]);

  useEffect(() => {
    if (!polling) return;
    const loc = new URL(window.location.href);
    const shop = loc.searchParams.get("shop");
    const interval = setInterval(async () => {
      try {
        const url = shop ? `/app/scan-status?shop=${encodeURIComponent(shop)}&t=${Date.now()}` : "/app/scan-status";
        const res = await fetch(url);
        const data = await res.json();
        setScanProgress(data.scanProgress || 0);
        setScanCurrent(data.scanCurrentProduct || 0);
        setScanTotal(data.scanTotalProducts || 0);
        if (data.scanStatus === "completed") {
          clearInterval(interval);
          setPolling(false);
          window.location.reload();
        }
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, [polling]);

  const handleBulkDiscount = useCallback(() => {
    const pct = prompt("Discount percentage:", "20");
    if (pct) fetcher.submit(
      { action: "bulk-discount", ids: JSON.stringify([...selected]), percentage: pct },
      { method: "post" }
    );
  }, [selected, fetcher]);

  const handleBulkArchive = useCallback(() => {
    if (confirm("Archive selected products?")) fetcher.submit(
      { action: "bulk-archive", ids: JSON.stringify([...selected]) },
      { method: "post" }
    );
  }, [selected, fetcher]);

  const handleBulkExport = useCallback(() => {
    fetcher.submit(
      { action: "bulk-export", ids: JSON.stringify([...selected]) },
      { method: "post" }
    );
  }, [selected, fetcher]);

  if (scanning || polling) {
    return (
      <Page title="Dead Stock Dashboard">
        <Card>
          <Box padding="800">
            <BlockStack gap="400" align="center">
              <Text variant="headingLg" as="h2" alignment="center">
                Analyzing your inventory
              </Text>
              <ProgressBar progress={scanProgress} size="large" color="success" />
              <Text variant="bodyMd" as="p" tone="subdued" alignment="center">
                {scanTotal > 0
                  ? `Scanning ${scanCurrent} of ${scanTotal} products... ${scanProgress}% complete`
                  : `Scanning products and order history... ${scanProgress}%`}
              </Text>
            </BlockStack>
          </Box>
        </Card>
      </Page>
    );
  }

  const statColor = {
    "Flagged Products": "var(--p-color-border-critical)",
    "Stuck Inventory Value": "var(--p-color-border-warning)",
    "Weekly Trend": "var(--p-color-border-info)",
    "Plan": "var(--p-color-border-success)",
  };

  const statCards = [
    { label: "Flagged Products", value: stats.totalDeadStock, tone: stats.totalDeadStock > 0 ? "critical" : "success" },
    { label: "Stuck Inventory Value", value: `$${stats.totalValue.toLocaleString()}`, tone: stats.totalValue > 0 ? "critical" : "success" },
    { label: "Weekly Trend", value: `${stats.trend > 0 ? "+" : ""}${stats.trend}%`, tone: stats.trend > 0 ? "critical" : "success" },
    { label: "Plan", value: plan.charAt(0).toUpperCase() + plan.slice(1), tone: undefined },
  ];

  const rows = processedDeadStock.map((entry) => {
    let suggestedData = {};
    try { suggestedData = entry.suggestedData ? JSON.parse(entry.suggestedData) : {}; } catch {}
    return [
      ...(canBulk ? [
        <Checkbox
          label=""
          labelHidden
          checked={selected.has(entry.product.id)}
          onChange={() => toggleSelect(entry.product.id)}
        />
      ] : []),
      entry.product.title,
      `$${entry.product.price.toFixed(2)}`,
      String(entry.product.inventoryCount),
      `${entry.daysSinceSale}d`,
      entry.reason,
      <BadgeForAction action={entry.suggestedAction} data={suggestedData} />,
      <ButtonGroup>
        <Button
          variant="tertiary"
          size="slim"
          onClick={() => window.shopify?.toast?.show?.(`Apply ${suggestedData.percentage || 20}% discount to ${entry.product.title}`)}
        >
          Apply
        </Button>
        <fetcher.Form method="post" style={{ display: "inline" }}>
          <input type="hidden" name="action" value="exclude" />
          <input type="hidden" name="productId" value={entry.product.id} />
          <Button variant="tertiary" size="slim" submit>
            Ignore
          </Button>
        </fetcher.Form>
      </ButtonGroup>,
    ];
  });

  const checkboxHeader = canBulk ? (
    <Checkbox
      label=""
      labelHidden
      checked={processedDeadStock.length > 0 && selected.size === processedDeadStock.length}
      onChange={selectAll}
    />
  ) : null;

  const dataTableColumns = [
    ...(canBulk ? [{ content: checkboxHeader }] : []),
    { content: "Product" },
    { content: "Price" },
    { content: "Inventory" },
    { content: "Days" },
    { content: "Why" },
    { content: "Suggested Action" },
    { content: "Actions" },
  ];

  return (
    <Page title="Dead Stock Dashboard">
      <BlockStack gap="400">
        {needsScan && (
          <Banner tone="warning" action={{ content: "Run Scan", onAction: () => navigate("/app/settings") }}>
            Your inventory hasn't been scanned yet or the data is outdated. Run a scan to see dead stock results.
          </Banner>
        )}
        <InlineStack gap="300" wrap={false}>
          {statCards.map((s) => (
            <div key={s.label} style={{ flex: 1, borderLeft: `4px solid ${statColor[s.label] || "transparent"}`, paddingLeft: 0 }}>
              <Card padding="400">
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="span">{s.label}</Text>
                  <Text variant="headingXl" as="p" tone={s.tone}>
                    {s.value}
                  </Text>
                </BlockStack>
              </Card>
            </div>
          ))}
        </InlineStack>

        {stats.lastScanAt && (
          <Text variant="bodySm" tone="subdued" as="p">
            Last scanned: {new Date(stats.lastScanAt).toLocaleDateString()} at {new Date(stats.lastScanAt).toLocaleTimeString()}
          </Text>
        )}

        {canBulk && selected.size > 0 && (
          <Box padding="300" borderWidth="025" borderColor="border" borderRadius="200">
            <InlineStack gap="300" align="space-between" blockAlign="center">
              <Text variant="bodyMd" fontWeight="bold" as="span">{selected.size} selected</Text>
              <ButtonGroup>
                <Button variant="secondary" size="slim" onClick={handleBulkDiscount}>Bulk Discount</Button>
                <Button variant="secondary" size="slim" onClick={handleBulkArchive}>Bulk Archive</Button>
                <Button variant="secondary" size="slim" onClick={handleBulkExport}>Export CSV</Button>
              </ButtonGroup>
            </InlineStack>
          </Box>
        )}

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h2">
                {filter === "all" ? "Flagged Products" : `${filter.charAt(0).toUpperCase() + filter.slice(1)}`}
              </Text>
              <InlineStack gap="100">
                {["all", "discount", "bundle", "archive"].map((f) => (
                  <Button
                    key={f}
                    size="slim"
                    variant={filter === f ? "primary" : "tertiary"}
                    onClick={() => setFilter(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Button>
                ))}
                <Select
                  label="Sort"
                  labelHidden
                  options={[
                    { label: "Days (newest)", value: "days-desc" },
                    { label: "Days (oldest)", value: "days-asc" },
                    { label: "Price (high)", value: "price-desc" },
                    { label: "Price (low)", value: "price-asc" },
                  ]}
                  value={`${sortBy}-${order}`}
                  onChange={(v) => { const [s, o] = v.split("-"); setSortBy(s); setOrder(o); }}
                />
              </InlineStack>
            </InlineStack>

            {processedDeadStock.length === 0 ? (
              <EmptyState
                heading="No dead stock found"
                image={null}
                action={{ content: "Adjust threshold", onAction: () => navigate("/app/settings") }}
              >
                <Text variant="bodyMd" as="p" tone="subdued">
                  Your inventory looks healthy! All products have sold within your detection threshold. You can adjust the threshold in settings if needed.
                </Text>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "numeric", "numeric", "numeric", "text", "text"]}
                headings={dataTableColumns.map(c => c.content)}
                rows={rows}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
