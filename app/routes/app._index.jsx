import { useLoaderData, useFetcher } from "react-router";
import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
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

  return { stats, deadStock: filtered, plan, canBulk: hasFeature(plan, "bulk") };
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
    const pct = parseInt(formData.get("percentage") || "20", 10);
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

export default function Dashboard() {
  const { stats, deadStock, plan, canBulk } = useLoaderData();
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const [selected, setSelected] = useState(new Set());
  const [sortBy, setSortBy] = useState("days");
  const [order, setOrder] = useState("desc");
  const [filter, setFilter] = useState("all");

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
      shopify.toast.show("Action completed");
    }
  }, [fetcher.data, fetcher.state, shopify]);

  return (
    <s-page heading="Dead Stock Dashboard">
      <s-section>
        <s-flex gap="base" wrap="wrap">
          <s-card padding="base" style={{ flex: 1, minWidth: 180 }}>
            <s-text size="small" color="subdued">Flagged Products</s-text>
            <s-text size="xlarge" variant="strong" style={{ color: "#d82c0d" }}>
              {stats.totalDeadStock}
            </s-text>
          </s-card>
          <s-card padding="base" style={{ flex: 1, minWidth: 180 }}>
            <s-text size="small" color="subdued">Stuck Inventory Value</s-text>
            <s-text size="xlarge" variant="strong" style={{ color: "#d82c0d" }}>
              ${stats.totalValue.toLocaleString()}
            </s-text>
          </s-card>
          <s-card padding="base" style={{ flex: 1, minWidth: 180 }}>
            <s-text size="small" color="subdued">Weekly Trend</s-text>
            <s-text size="xlarge" variant="strong" style={{ color: stats.trend > 0 ? "#d82c0d" : "#008060" }}>
              {stats.trend > 0 ? "+" : ""}{stats.trend}%
            </s-text>
          </s-card>
          <s-card padding="base" style={{ flex: 1, minWidth: 180 }}>
            <s-text size="small" color="subdued">Plan</s-text>
            <s-text size="xlarge" variant="strong">{plan.charAt(0).toUpperCase() + plan.slice(1)}</s-text>
          </s-card>
        </s-flex>
      </s-section>

      <s-section heading="Filters">
        <s-flex gap="base" wrap="wrap" align="center">
          <s-choice-list name="filter" value={filter} onChange={(v) => setFilter(v)}>
            <s-choice-list-item value="all">All</s-choice-list-item>
            <s-choice-list-item value="discount">Discount</s-choice-list-item>
            <s-choice-list-item value="bundle">Bundle</s-choice-list-item>
            <s-choice-list-item value="archive">Archive</s-choice-list-item>
          </s-choice-list>
          <s-select name="sort" value={`${sortBy}-${order}`} onChange={(v) => { const [s, o] = v.split("-"); setSortBy(s); setOrder(o); }}>
            <option value="days-desc">Days (newest first)</option>
            <option value="days-asc">Days (oldest first)</option>
            <option value="price-desc">Price (high to low)</option>
            <option value="price-asc">Price (low to high)</option>
          </s-select>
          {canBulk && selected.size > 0 && (
            <s-text size="small" color="subdued">{selected.size} selected</s-text>
          )}
        </s-flex>
      </s-section>

      {canBulk && selected.size > 0 && (
        <s-section heading="Bulk Actions">
          <s-flex gap="base" wrap="wrap">
            <s-button
              variant="secondary"
              onClick={() => {
                const pct = prompt("Discount percentage:", "20");
                if (pct) fetcher.submit(
                  { action: "bulk-discount", ids: JSON.stringify([...selected]), percentage: pct },
                  { method: "post" }
                );
              }}
            >
              Bulk Discount
            </s-button>
            <s-button
              variant="secondary"
              onClick={() => {
                if (confirm("Archive selected products?")) fetcher.submit(
                  { action: "bulk-archive", ids: JSON.stringify([...selected]) },
                  { method: "post" }
                );
              }}
            >
              Bulk Archive
            </s-button>
            <s-button
              variant="secondary"
              onClick={() => fetcher.submit(
                { action: "bulk-export", ids: JSON.stringify([...selected]) },
                { method: "post" }
              )}
            >
              Export Selected as CSV
            </s-button>
          </s-flex>
        </s-section>
      )}

      <s-section heading={filter === "all" ? "All Flagged Products" : `${filter.charAt(0).toUpperCase() + filter.slice(1)} Suggestions`}>
        {deadStock.length === 0 ? (
          <s-paragraph>No dead stock found. Your inventory looks healthy!</s-paragraph>
        ) : (
          <s-table>
            <s-table-header>
              <s-table-header-cell>
                {canBulk && (
                  <input type="checkbox" checked={selected.size === deadStock.length} onChange={selectAll} />
                )}
              </s-table-header-cell>
              <s-table-header-cell>Product</s-table-header-cell>
              <s-table-header-cell>Price</s-table-header-cell>
              <s-table-header-cell>Inventory</s-table-header-cell>
              <s-table-header-cell>Days</s-table-header-cell>
              <s-table-header-cell>Why</s-table-header-cell>
              <s-table-header-cell>Suggested Action</s-table-header-cell>
              <s-table-header-cell>Actions</s-table-header-cell>
            </s-table-header>
            <s-table-body>
              {deadStock.map((entry) => {
                const suggestedData = entry.suggestedData ? JSON.parse(entry.suggestedData) : {};
                return (
                  <s-table-row key={entry.product.id}>
                    <s-table-cell>
                      {canBulk && (
                        <input
                          type="checkbox"
                          checked={selected.has(entry.product.id)}
                          onChange={() => toggleSelect(entry.product.id)}
                        />
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      <s-link href={`https://admin.shopify.com/product/${entry.product.id}`} target="_blank">
                        {entry.product.title}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>${entry.product.price.toFixed(2)}</s-table-cell>
                    <s-table-cell>{entry.product.inventoryCount}</s-table-cell>
                    <s-table-cell>{entry.daysSinceSale}d</s-table-cell>
                    <s-table-cell>{entry.reason}</s-table-cell>
                    <s-table-cell>
                      <s-badge variant={entry.suggestedAction === "discount" ? "attention" : entry.suggestedAction === "bundle" ? "info" : "critical"}>
                        {entry.suggestedAction === "discount" ? `${suggestedData.percentage || 20}% off` : entry.suggestedAction === "bundle" ? "Bundle" : "Archive"}
                      </s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      <s-flex gap="base">
                        <s-button
                          variant="tertiary"
                          size="small"
                          onClick={() => shopify.toast.show(`Apply ${suggestedData.percentage || 20}% discount to ${entry.product.title}`)}
                        >
                          Apply
                        </s-button>
                        <fetcher.Form method="post" style={{ display: "inline" }}>
                          <input type="hidden" name="action" value="exclude" />
                          <input type="hidden" name="productId" value={entry.product.id} />
                          <s-button variant="tertiary" size="small" type="submit">
                            Ignore
                          </s-button>
                        </fetcher.Form>
                      </s-flex>
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
