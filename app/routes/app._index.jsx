import { useLoaderData, useFetcher } from "react-router";
import { useEffect, useState, useCallback } from "react";

import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Card, Text, BlockStack, InlineStack, Button, ButtonGroup, Banner, Badge, ProgressBar, DataTable, ChoiceList, Select, EmptyState } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { getDashboardStats, refreshDeadStock } from "../services/detection.server";
import { scanStore } from "../services/scanner.server";
import { hasFeature } from "../services/billing.server";
import { generateCsv } from "../services/reports.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);

  const needsScan = !store.lastScanAt ||
    (Date.now() - new Date(store.lastScanAt).getTime()) > 24 * 60 * 60 * 1000;

  if (needsScan) {
    const { session: sess, admin } = await authenticate.admin(request);
    await scanStore(admin, sess.shop).catch(() => {});
  }

  await refreshDeadStock(session.shop);
  const stats = await getDashboardStats(session.shop);

  const deadStock = await prisma.deadStockEntry.findMany({
    where: { shop: session.shop, resolved: false },
    include: { product: true },
    orderBy: { daysSinceSale: "desc" },
  });

  const plan = store.plan;
  const sort = request.url.includes("sort=")
    ? Object.fromEntries(new URL(request.url).searchParams.entries())
    : {};

  let filtered = [...deadStock];
  if (sort.filter === "discount") filtered = filtered.filter(e => e.suggestedAction === "discount");
  else if (sort.filter === "bundle") filtered = filtered.filter(e => e.suggestedAction === "bundle");
  else if (sort.filter === "archive") filtered = filtered.filter(e => e.suggestedAction === "archive");

  if (sort.sortBy === "price") {
    filtered.sort((a, b) => sort.order === "asc"
      ? a.product.price - b.product.price
      : b.product.price - a.product.price);
  } else if (sort.sortBy === "days") {
    filtered.sort((a, b) => sort.order === "asc"
      ? a.daysSinceSale - b.daysSinceSale
      : b.daysSinceSale - a.daysSinceSale);
  }

  return { stats, deadStock: filtered, plan, canBulk: hasFeature(plan, "bulk"), needsScan };
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
  const { stats, deadStock, plan, canBulk, needsScan } = useLoaderData();
  const fetcher = useFetcher();
  const [selected, setSelected] = useState(new Set());
  const [sortBy, setSortBy] = useState("days");
  const [order, setOrder] = useState("desc");
  const [filter, setFilter] = useState("all");
  const [initialScanning, setInitialScanning] = useState(needsScan && stats && !stats.lastScanAt);

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === deadStock.length) setSelected(new Set());
    else setSelected(new Set(deadStock.map((e) => e.product.id)));
  };

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      if (typeof window !== "undefined" && window.shopify?.toast) {
        window.shopify.toast.show("Action completed");
      }
    }
  }, [fetcher.data, fetcher.state]);

  useEffect(() => {
    if (!initialScanning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/app/scan-status");
        const data = await res.json();
        if (data.scanStatus === "completed") {
          clearInterval(interval);
          window.location.reload();
        }
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, [initialScanning]);

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

  if (initialScanning) {
    return (
      <Page title="Dead Stock Dashboard">
        <Card>
          <BlockStack gap="400" align="center">
            <Text variant="headingMd" as="h2">Performing initial scan...</Text>
            <ProgressBar progress={0} size="large" color="success" />
            <Text variant="bodySm" as="p" tone="subdued">
              Analyzing your products and order history
            </Text>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const statCards = [
    { label: "Flagged Products", value: stats.totalDeadStock, tone: stats.totalDeadStock > 0 ? "critical" : "success" },
    { label: "Stuck Inventory Value", value: `$${stats.totalValue.toLocaleString()}`, tone: stats.totalValue > 0 ? "critical" : "success" },
    { label: "Weekly Trend", value: `${stats.trend > 0 ? "+" : ""}${stats.trend}%`, tone: stats.trend > 0 ? "critical" : "success" },
    { label: "Plan", value: plan.charAt(0).toUpperCase() + plan.slice(1), tone: undefined },
  ];

  const filterChoices = [
    { label: "All", value: "all" },
    { label: "Discount", value: "discount" },
    { label: "Bundle", value: "bundle" },
    { label: "Archive", value: "archive" },
  ];

  const sortOptions = [
    { label: "Days (newest first)", value: "days-desc" },
    { label: "Days (oldest first)", value: "days-asc" },
    { label: "Price (high to low)", value: "price-desc" },
    { label: "Price (low to high)", value: "price-asc" },
  ];

  const rows = deadStock.map((entry) => {
    const suggestedData = entry.suggestedData ? JSON.parse(entry.suggestedData) : {};
    return [
      canBulk ? (
        <input
          type="checkbox"
          checked={selected.has(entry.product.id)}
          onChange={() => toggleSelect(entry.product.id)}
        />
      ) : null,
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
  }).filter(Boolean);

  const dataTableColumns = [
    ...(canBulk ? [{ content: "" }] : []),
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
        <InlineStack gap="300" wrap={false}>
          {statCards.map((s) => (
            <Card key={s.label} padding="300" style={{ flex: 1 }}>
              <BlockStack gap="100">
                <Text variant="bodySm" tone="subdued" as="span">{s.label}</Text>
                <Text variant="headingXl" as="p" tone={s.tone}>
                  {s.value}
                </Text>
              </BlockStack>
            </Card>
          ))}
        </InlineStack>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Filters</Text>
            <InlineStack gap="300" align="start" blockAlign="center">
              <ChoiceList
                title="Type"
                titleHidden
                choices={filterChoices}
                selected={[filter]}
                onChange={([v]) => setFilter(v)}
              />
              <Select
                label="Sort"
                labelHidden
                options={sortOptions}
                value={`${sortBy}-${order}`}
                onChange={(v) => { const [s, o] = v.split("-"); setSortBy(s); setOrder(o); }}
              />
              {canBulk && selected.size > 0 && (
                <Text variant="bodySm" tone="subdued" as="span">{selected.size} selected</Text>
              )}
            </InlineStack>
          </BlockStack>
        </Card>

        {canBulk && selected.size > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Bulk Actions</Text>
              <ButtonGroup>
                <Button variant="secondary" onClick={handleBulkDiscount}>Bulk Discount</Button>
                <Button variant="secondary" onClick={handleBulkArchive}>Bulk Archive</Button>
                <Button variant="secondary" onClick={handleBulkExport}>Export as CSV</Button>
              </ButtonGroup>
            </BlockStack>
          </Card>
        )}

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              {filter === "all" ? "All Flagged Products" : `${filter.charAt(0).toUpperCase() + filter.slice(1)} Suggestions`}
            </Text>
            {deadStock.length === 0 ? (
              <EmptyState
                heading="No dead stock found"
                image={null}
              >
                <Text variant="bodyMd" as="p" tone="subdued">
                  Your inventory looks healthy! All products have sold within your threshold period.
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
