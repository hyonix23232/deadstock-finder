import { useLoaderData, useFetcher } from "react-router";
import { useEffect, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Card, Text, BlockStack, InlineStack, Button, Banner, ChoiceList, DataTable, Badge, Box, Checkbox } from "@shopify/polaris";
import { authenticate, sessionStorage } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { hasFeature } from "../services/billing.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);

  let billingPlans, plan = "free";
  try {
    billingPlans = await billing.check({ plans: ["Starter", "Pro"] });
    if (billingPlans?.Pro?.active) plan = "pro";
    else if (billingPlans?.Starter?.active) plan = "starter";
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
    canEmail: hasFeature(plan, "email"),
    canBulk: hasFeature(plan, "bulk"),
    currentPlan: plan,
    billingPlans,
  };
};

export const action = async ({ request }) => {
  const { session, billing, redirect } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "reset-session") {
    await sessionStorage.deleteSession(session.id);
    return redirect(`/app/settings?shop=${session.shop}`, { target: "_self" });
  }

  if (intent === "update-threshold") {
    const threshold = parseInt(formData.get("threshold") || "60", 10);
    await prisma.store.update({
      where: { shop: session.shop },
      data: { threshold },
    });
    return { ok: true, message: "Threshold updated" };
  }

  if (intent === "toggle-email") {
    const enabled = formData.get("email") === "on";
    await prisma.store.update({
      where: { shop: session.shop },
      data: { emailEnabled: enabled },
    });
    return { ok: true, message: "Email preference updated" };
  }

  if (intent === "remove-exclusion") {
    const id = formData.get("exclusionId");
    await prisma.excludedProduct.delete({ where: { id } });
    return { ok: true, message: "Product restored to detection" };
  }

  if (intent === "subscribe") {
    const plan = formData.get("plan");
    try {
      const result = await billing.request({ plan, isTest: true, returnUrl: `${process.env.SHOPIFY_APP_URL || ""}/app/settings` });
      return { ok: true, confirmationUrl: result.confirmationUrl, message: "Redirecting to billing..." };
    } catch (e) {
      return { ok: false, error: e.message || "Billing request failed. The app is not published on the App Store yet." };
    }
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
  { key: "email", free: "Email alerts", starter: "Email alerts", pro: "Email alerts" },
  { key: "bulk", free: "Bulk actions", starter: "Bulk actions", pro: "Bulk actions" },
  { key: "reports", free: "Reports & export", starter: "Reports & export", pro: "Reports & export" },
  { key: "trial", free: "7-day free trial", starter: "7-day free trial", pro: "7-day free trial" },
];

export default function Settings() {
  const { store, excludedProducts, canEmail, canBulk, currentPlan, billingPlans } = useLoaderData();
  const fetcher = useFetcher();
  const subscribeFetcher = useFetcher();
  const [threshold, setThreshold] = useState(String(store.threshold));

  useEffect(() => {
    if (subscribeFetcher.data?.ok) {
      window.shopify?.toast?.show?.(subscribeFetcher.data.message);
    }
    if (subscribeFetcher.data?.confirmationUrl) {
      window.top.location.href = subscribeFetcher.data.confirmationUrl;
    }
  }, [subscribeFetcher.data]);

  useEffect(() => {
    if (fetcher.state === "submitting") {
      window.shopify?.toast?.show?.("Scan started...");
    }
  }, [fetcher.state]);

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
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {["free", "starter", "pro"].map((planKey) => {
                const meta = PLAN_META[planKey];
                const isCurrent = planKey === currentPlan;
                const planOrder = ["free", "starter", "pro"];
                const isUpgrade = planOrder.indexOf(planKey) > planOrder.indexOf(currentPlan);
                const features = ["products", "email", "bulk", "trial", "reports"];
                const included = {
                  free: [true, false, false, false, false],
                  starter: [true, true, true, true, false],
                  pro: [true, true, true, true, true],
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
                      {!isCurrent && isUpgrade && (
                        <subscribeFetcher.Form method="post">
                          <input type="hidden" name="intent" value="subscribe" />
                          <input type="hidden" name="plan" value={meta.label} />
                          <Button variant="primary" submit fullWidth loading={subscribeFetcher.state !== "idle"}>
                            Upgrade to {meta.label}
                          </Button>
                        </subscribeFetcher.Form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Email Alerts</Text>
            {canEmail ? (
              <BlockStack gap="200">
                <Checkbox
                  label="Receive weekly Monday morning email summaries with dead stock updates"
                  checked={store.emailEnabled}
                  onChange={(checked) => {
                    const formData = new FormData();
                    formData.append("intent", "toggle-email");
                    formData.append("email", checked ? "on" : "off");
                    fetcher.submit(formData, { method: "post" });
                  }}
                />
              </BlockStack>
            ) : (
              <Banner tone="warning">
                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p">
                    Email alerts are available on Starter and Pro plans.
                    {currentPlan === "free" ? " Upgrade to enable weekly dead stock summaries." : ""}
                  </Text>
                </BlockStack>
              </Banner>
            )}
          </BlockStack>
        </Card>

        <InlineStack gap="300" wrap={false}>
          <div style={{ flex: 2, minWidth: 300 }}>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Excluded Products</Text>
                {excludedProducts.length === 0 ? (
                  <Text variant="bodyMd" as="p" tone="subdued">
                    No excluded products. Use the "Ignore" button on the dashboard to exclude products from detection.
                  </Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text"]}
                    headings={["Product", "Reason", "Action"]}
                    rows={excludedProducts.map((ep) => [
                      ep.product?.title || "Unknown",
                      ep.reason || "Manual exclusion",
                      <fetcher.Form method="post" key={ep.id}>
                        <input type="hidden" name="intent" value="remove-exclusion" />
                        <input type="hidden" name="exclusionId" value={ep.id} />
                        <Button variant="tertiary" size="slim" submit>Restore</Button>
                      </fetcher.Form>,
                    ])}
                  />
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
