import { useLoaderData, useFetcher } from "react-router";
import { useEffect, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Card, Text, BlockStack, InlineStack, Button, ButtonGroup, Banner, ChoiceList, DataTable, Badge } from "@shopify/polaris";
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

  const planBadge = {
    free: { tone: "info" },
    starter: { tone: "success" },
    pro: { tone: "success" },
  }[currentPlan] || { tone: "info" };

  return (
    <Page title="Settings">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Detection Threshold</Text>
            <Text variant="bodySm" as="p" tone="subdued">
              Currently set to {store.threshold} days. Change when a product is considered dead stock.
            </Text>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="update-threshold" />
              <BlockStack gap="200">
                <ChoiceList
                  title="Threshold"
                  titleHidden
                  name="threshold"
                  choices={[
                    { label: "30 days", value: "30" },
                    { label: "60 days (Recommended)", value: "60" },
                    { label: "90 days", value: "90" },
                  ]}
                  selected={[threshold]}
                  onChange={([val]) => setThreshold(val)}
                />
                <Button variant="primary" size="slim" submit>Save</Button>
              </BlockStack>
            </fetcher.Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Plan</Text>
            <InlineStack gap="200" align="start" blockAlign="center">
              <Text variant="bodyMd" as="span">Current plan:</Text>
              <Badge tone={planBadge.tone}>
                {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
              </Badge>
            </InlineStack>
            {currentPlan === "free" && (
              <ButtonGroup>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="subscribe" />
                  <input type="hidden" name="plan" value="Starter" />
                  <Button variant="primary" submit>Upgrade to Starter — $15/mo</Button>
                </fetcher.Form>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="subscribe" />
                  <input type="hidden" name="plan" value="Pro" />
                  <Button variant="primary" submit>Upgrade to Pro — $29/mo (7-day free trial)</Button>
                </fetcher.Form>
              </ButtonGroup>
            )}
            {currentPlan === "starter" && (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="subscribe" />
                <input type="hidden" name="plan" value="Pro" />
                <Button variant="primary" submit>Upgrade to Pro — $29/mo (7-day free trial)</Button>
              </fetcher.Form>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Email Alerts</Text>
            {canEmail ? (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="toggle-email" />
                <Text variant="bodyMd" as="span">
                  <input type="checkbox" name="email" defaultChecked={store.emailEnabled} />
                  {" "}Receive weekly Monday morning email summaries
                </Text>
                <div style={{ marginTop: 12 }}>
                  <Button variant="primary" size="slim" submit>Save</Button>
                </div>
              </fetcher.Form>
            ) : (
              <Banner tone="warning">
                <Text variant="bodyMd" as="p">
                  Email alerts are available on Starter and Pro plans.
                  {currentPlan === "free" ? " Upgrade to enable." : ""}
                </Text>
              </Banner>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Excluded Products</Text>
            {excludedProducts.length === 0 ? (
              <Text variant="bodyMd" as="p" tone="subdued">
                No excluded products. Products you ignore on the dashboard will appear here.
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

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Manual Rescan</Text>
            <Text variant="bodySm" as="p" tone="subdued">
              Trigger a full rescan of your inventory now.
            </Text>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="rescan" />
              <Button variant="secondary" size="slim" submit>Rescan Now</Button>
            </fetcher.Form>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
