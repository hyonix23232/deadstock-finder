import { useLoaderData, useFetcher } from "react-router";
import { useEffect, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Card, Text, BlockStack, InlineStack, Button, Banner, ChoiceList, DataTable, Badge, Box, Checkbox } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { scanStore } from "../services/scanner.server";
import { hasFeature } from "../services/billing.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);

  const excludedProducts = await prisma.excludedProduct.findMany({
    where: { shop: session.shop },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  const billingPlans = await billing.check({ plans: ["Starter", "Pro"] });

  return {
    store,
    excludedProducts,
    canEmail: hasFeature(store.plan, "email"),
    canBulk: hasFeature(store.plan, "bulk"),
    currentPlan: store.plan,
    billingPlans,
  };
};

export const action = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

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
    const result = await billing.request({ plan, returnUrl: `${process.env.SHOPIFY_APP_URL || ""}/app/settings` });
    return { ok: true, confirmationUrl: result.confirmationUrl, message: "Redirecting to billing..." };
  }

  if (intent === "rescan") {
    const { session: sess, admin } = await authenticate.admin(request);
    await scanStore(admin, sess.shop);
    return { ok: true, message: "Scan completed" };
  }

  return { ok: false };
};

const planFeatures = {
  free: [
    { label: "50 products", included: true },
    { label: "Email alerts", included: false },
    { label: "Bulk actions", included: false },
    { label: "Reports & export", included: false },
    { label: "7-day free trial", included: false },
  ],
  starter: [
    { label: "500 products", included: true },
    { label: "Email alerts", included: true },
    { label: "Bulk actions", included: true },
    { label: "Reports & export", included: false },
    { label: "7-day free trial", included: false },
  ],
  pro: [
    { label: "Unlimited products", included: true },
    { label: "Email alerts", included: true },
    { label: "Bulk actions", included: true },
    { label: "Reports & export", included: true },
    { label: "7-day free trial", included: true },
  ],
};

export default function Settings() {
  const { store, excludedProducts, canEmail, canBulk, currentPlan, billingPlans } = useLoaderData();
  const fetcher = useFetcher();
  const [threshold, setThreshold] = useState(String(store.threshold));

  useEffect(() => {
    if (fetcher.data?.ok) {
      window.shopify?.toast?.show?.(fetcher.data.message);
    }
    if (fetcher.data?.confirmationUrl) {
      window.open(fetcher.data.confirmationUrl, "_top");
    }
  }, [fetcher.data]);

  const planBadgeTone = {
    free: "info", starter: "success", pro: "success",
  }[currentPlan] || "info";

  const features = planFeatures[currentPlan] || planFeatures.free;

  const planDisplayName = currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);

  return (
    <Page title="Settings">
      <BlockStack gap="400">
        <InlineStack gap="300" wrap={false}>
          <div style={{ flex: 2, minWidth: 300 }}>
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
          </div>

          <div style={{ flex: 1, minWidth: 250 }}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">Plan</Text>
                  <Badge tone={planBadgeTone}>{planDisplayName}</Badge>
                </InlineStack>

                <BlockStack gap="200">
                  {features.map((f) => (
                    <InlineStack key={f.label} gap="200" blockAlign="center">
                      <Text variant="bodyMd" as="span" tone={f.included ? undefined : "critical"}>
                        {f.included ? "✓" : "✕"} {f.label}
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>

                <Box borderWidth="025" borderColor="border" padding="300" borderRadius="200">
                  <BlockStack gap="200">
                    {currentPlan === "free" && (
                      <>
                        <fetcher.Form method="post">
                          <input type="hidden" name="intent" value="subscribe" />
                          <input type="hidden" name="plan" value="Starter" />
                          <Button variant="primary" submit fullWidth>Upgrade to Starter — $15/mo</Button>
                        </fetcher.Form>
                        <fetcher.Form method="post">
                          <input type="hidden" name="intent" value="subscribe" />
                          <input type="hidden" name="plan" value="Pro" />
                          <Button variant="secondary" submit fullWidth>Upgrade to Pro — $29/mo (7-day trial)</Button>
                        </fetcher.Form>
                      </>
                    )}
                    {currentPlan === "starter" && (
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="subscribe" />
                        <input type="hidden" name="plan" value="Pro" />
                        <Button variant="primary" submit fullWidth>Upgrade to Pro — $29/mo (7-day trial)</Button>
                      </fetcher.Form>
                    )}
                    {currentPlan === "pro" && (
                      <Text variant="bodyMd" tone="success" as="p" fontWeight="bold">Current plan — all features active</Text>
                    )}
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </div>
        </InlineStack>

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
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="rescan" />
                  <Button variant="secondary" submit fullWidth>Rescan Now</Button>
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
