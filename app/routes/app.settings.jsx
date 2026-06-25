import { useLoaderData, useFetcher } from "react-router";
import { useEffect, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Card, Text, BlockStack, InlineStack, Button, ChoiceList, Badge, Box } from "@shopify/polaris";
import { authenticate, sessionStorage } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { hasFeature } from "../services/billing.server";
import { detectDeadStock } from "../services/detection.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);

  const url = new URL(request.url);
  const planHandle = url.searchParams.get("plan_handle");
  const chargeId = url.searchParams.get("charge_id");
  const subscribed = planHandle || chargeId;

  const previousPlan = store.plan;

  let billingPlans, plan = "free";
  try {
    if (process.env.AUTO_UNLOCK_PRO === "true") {
      console.log("AUTO_UNLOCK_PRO=true detected, forcing plan to pro");
      plan = "pro";
    } else {
      console.log("AUTO_UNLOCK_PRO not true, value:", JSON.stringify(process.env.AUTO_UNLOCK_PRO));
      billingPlans = await billing.check({ plans: ["Starter Plan", "Pro Plan"] });
      if (billingPlans?.appSubscriptions?.some(s => s.name === "Pro Plan")) plan = "pro";
      else if (billingPlans?.appSubscriptions?.some(s => s.name === "Starter Plan")) plan = "starter";
    }
  } catch (e) {
    console.warn("Billing check failed, defaulting to free:", e.message);
  }

  if (plan !== store.plan) {
    await prisma.store.update({
      where: { shop: session.shop },
      data: { plan },
    });
    store.plan = plan;
  }

  const excludedProducts = await prisma.excludedProduct.findMany({
    where: { shop: session.shop },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  return {
    store,
    excludedProducts,
    canBulk: hasFeature(plan, "bulk"),
    currentPlan: plan,
    billingPlans,
    subscribed: !!subscribed && plan !== previousPlan,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "reset-session") {
    await sessionStorage.deleteSession(session.id);
    return { ok: true, intent: "reset-session", shop: session.shop };
  }

  if (intent === "update-threshold") {
    const threshold = parseInt(formData.get("threshold") || "60", 10);
    await prisma.store.update({
      where: { shop: session.shop },
      data: { threshold },
    });
    return { ok: true, intent: "update-threshold", message: "Threshold updated" };
  }

  if (intent === "remove-exclusion") {
    const id = formData.get("exclusionId");
    await prisma.excludedProduct.delete({ where: { id } });
    await detectDeadStock(session.shop);
    return { ok: true, intent: "remove-exclusion", message: "Product restored to detection" };
  }

  return { ok: false };
};

const PLAN_META = {
  free: { label: "Free", price: "$0", color: "var(--p-color-border)", badge: "info" },
  starter: { label: "Starter", price: "$15/mo", color: "var(--p-color-border-info)", badge: "success" },
  pro: { label: "Pro", price: "$29/mo", color: "var(--p-color-border-success)", badge: "success" },
};

const ALL_PLAN_FEATURES = [
  { key: "products", free: "50 products scanned", starter: "500 products scanned", pro: "Unlimited products" },
  { key: "bulk", free: "Bulk actions", starter: "Bulk actions", pro: "Bulk actions" },
  { key: "reports", free: "Reports & export", starter: "Reports & export", pro: "Reports & export" },
  { key: "trial", free: "7-day free trial", starter: "7-day free trial", pro: "7-day free trial" },
];

export default function Settings() {
  const { store, excludedProducts, canBulk, currentPlan, subscribed } = useLoaderData();
  const fetcher = useFetcher();
  const [threshold, setThreshold] = useState(String(store.threshold));

  useEffect(() => {
    if (subscribed) {
      window.shopify?.toast?.show?.("Subscription updated successfully");
    }
  }, [subscribed]);

  useEffect(() => {
    if (!fetcher.data?.ok) return;
    if (fetcher.data?.intent === "update-threshold") {
      window.shopify?.toast?.show?.("Threshold updated");
    } else if (fetcher.data?.intent === "remove-exclusion") {
      window.shopify?.toast?.show?.("Product restored");
    } else if (fetcher.data?.intent === "reset-session") {
      window.shopify?.toast?.show?.("Session reset complete. Redirecting...");
      setTimeout(() => { window.top.location.href = `/auth?shop=${fetcher.data.shop}`; }, 1500);
    } else if (!fetcher.data?.intent) {
      window.shopify?.toast?.show?.("Scan triggered — view progress on Dashboard");
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (fetcher.state === "submitting") {
      const intent = fetcher.formData?.get?.("intent");
      if (intent === "reset-session") {
        window.shopify?.toast?.show?.("Resetting session...");
      } else if (!intent && fetcher.formData?.has?.("threshold")) {
        window.shopify?.toast?.show?.("Scan started...");
      }
    }
  }, [fetcher.state, fetcher.formData]);

  return (
    <Page title="Settings">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Detection Threshold</Text>
            <Text variant="bodySm" as="p" tone="subdued">
              Products without a sale in this many days are flagged as dead stock.
            </Text>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="update-threshold" />
              <BlockStack gap="300">
                <ChoiceList
                  title="Threshold"
                  titleHidden
                  name="threshold"
                  choices={[
                    { label: "1 day — For testing", value: "1" },
                    { label: "30 days — Aggressive detection", value: "30" },
                    { label: "60 days — Recommended", value: "60" },
                    { label: "90 days — Lenient detection", value: "90" },
                  ]}
                  selected={[threshold]}
                  onChange={([val]) => setThreshold(val)}
                />
                <Box>
                  <Button variant="primary" submit>Save threshold</Button>
                </Box>
              </BlockStack>
            </fetcher.Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Compare Plans</Text>
            <Text variant="bodySm" as="p" tone="subdued">
              Manage your subscription directly from your Shopify admin.
            </Text>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {["free", "starter", "pro"].map((planKey) => {
                const meta = PLAN_META[planKey];
                const isCurrent = planKey === currentPlan;
                const planOrder = ["free", "starter", "pro"];
                const features = ["products", "bulk", "trial", "reports"];
                const included = {
                  free: [true, false, false, false],
                  starter: [true, true, true, false],
                  pro: [true, true, true, true],
                };
                return (
                  <div key={planKey} style={{
                    flex: 1,
                    minWidth: 200,
                    border: `2px solid ${isCurrent ? "var(--p-color-border-success)" : "var(--p-color-border)"}`,
                    borderRadius: 12,
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    position: "relative",
                    background: isCurrent ? "var(--p-color-bg-success-subdued)" : undefined,
                  }}>
                    {isCurrent && (
                      <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)" }}>
                        <Badge tone="success">Current Plan</Badge>
                      </div>
                    )}
                    <div style={{ textAlign: "center", paddingTop: isCurrent ? 4 : 0 }}>
                      <Text variant="headingLg" as="h3" alignment="center">{meta.label}</Text>
                      <Text variant="headingXl" as="p" alignment="center" tone={planKey === "free" ? "subdued" : "success"}>
                        {meta.price}
                      </Text>
                    </div>
                    <div style={{ borderTop: "1px solid var(--p-color-border)", paddingTop: 12 }}>
                      {features.map((feat, i) => {
                        const label = ALL_PLAN_FEATURES.find(f => f.key === feat)[planKey];
                        const incl = included[planKey][i];
                        return (
                          <div key={feat} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                            <Text variant="bodyMd" as="span" tone={incl ? "success" : "critical"}>
                              {incl ? "✓" : "✕"}
                            </Text>
                            <Text variant="bodyMd" as="span" tone={incl ? undefined : "subdued"}>
                              {label}
                            </Text>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: "auto" }}>
                      {!isCurrent && planKey !== "free" && (
                        <a
                          href={`https://admin.shopify.com/store/${store.shop.replace(".myshopify.com", "")}/charges/geniestock/pricing_plans`}
                          target="_top"
                          style={{ textDecoration: "none" }}
                        >
                          <Button variant="primary" fullWidth>
                            Upgrade to {meta.label}
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </BlockStack>
        </Card>

        <InlineStack gap="300" wrap={false} align="start">
          <div style={{ flex: 2, minWidth: 300 }}>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Excluded Products</Text>
                {excludedProducts.length === 0 ? (
                  <Box padding="200">
                    <Text variant="bodyMd" as="p" tone="subdued">
                      No excluded products. Use the "Ignore" button on the dashboard to exclude products from detection.
                    </Text>
                  </Box>
                ) : (
                  <BlockStack gap="200">
                    {excludedProducts.map((ep) => (
                      <div key={ep.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--p-color-border-subdued)" }}>
                        {ep.product?.imageUrl ? (
                          <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "var(--p-color-bg-surface)" }}>
                            <img src={ep.product.imageUrl} alt="" style={{ width: 44, height: 44, objectFit: "cover" }} />
                          </div>
                        ) : (
                          <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--p-color-bg-fill-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Text variant="bodyXs" as="span" tone="subdued">—</Text>
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="bodyMd" fontWeight="bold" as="p">{ep.product?.title || "Unknown"}</Text>
                          <Text variant="bodySm" tone="subdued" as="p">{ep.reason || "Manual exclusion"}</Text>
                        </div>
                        <fetcher.Form method="post" key={ep.id}>
                          <input type="hidden" name="intent" value="remove-exclusion" />
                          <input type="hidden" name="exclusionId" value={ep.id} />
                          <Button variant="tertiary" size="slim" submit>Restore</Button>
                        </fetcher.Form>
                      </div>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </div>

          <div style={{ flex: 1, minWidth: 250 }}>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Manual Rescan</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Trigger a full rescan of your inventory and order history.
                </Text>
                <fetcher.Form method="post" action="/app/scan">
                  <input type="hidden" name="threshold" value={threshold} />
                  <Button variant="secondary" fullWidth submit>Rescan Now</Button>
                </fetcher.Form>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="reset-session" />
                  <InlineStack gap="200">
                    <Button variant="tertiary" submit>Reset Session</Button>
                  </InlineStack>
                </fetcher.Form>
                {store.lastScanAt && (
                  <Text variant="bodySm" tone="subdued" as="p">
                    Last scan: {new Date(store.lastScanAt).toLocaleDateString()}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </div>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
