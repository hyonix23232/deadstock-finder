import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
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
  const shopify = useAppBridge();
  const fetcher = useFetcher();

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show(fetcher.data.message);
    }
    if (fetcher.data?.confirmationUrl) {
      window.open(fetcher.data.confirmationUrl, "_top");
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Settings">
      <s-section heading="Detection Threshold">
        <s-paragraph>Currently set to {store.threshold} days. Change when a product is considered dead stock.</s-paragraph>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="update-threshold" />
          <s-choice-list name="threshold" value={String(store.threshold)}>
            <s-choice-list-item value="30">30 days</s-choice-list-item>
            <s-choice-list-item value="60">60 days (Recommended)</s-choice-list-item>
            <s-choice-list-item value="90">90 days</s-choice-list-item>
          </s-choice-list>
          <s-button type="submit" variant="primary" size="small">Save</s-button>
        </fetcher.Form>
      </s-section>

      <s-section heading="Plan">
        <s-paragraph>Current plan: <s-badge variant={currentPlan === "free" ? "info" : "success"}>{currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}</s-badge></s-paragraph>
        {currentPlan === "free" && (
          <s-flex gap="base" wrap="wrap">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="subscribe" />
              <input type="hidden" name="plan" value="Starter" />
              <s-button type="submit" variant="primary">Upgrade to Starter — $15/mo</s-button>
            </fetcher.Form>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="subscribe" />
              <input type="hidden" name="plan" value="Pro" />
              <s-button type="submit" variant="primary">Upgrade to Pro — $29/mo (7-day free trial)</s-button>
            </fetcher.Form>
          </s-flex>
        )}
        {currentPlan === "starter" && (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="subscribe" />
            <input type="hidden" name="plan" value="Pro" />
            <s-button type="submit" variant="primary">Upgrade to Pro — $29/mo (7-day free trial)</s-button>
          </fetcher.Form>
        )}
      </s-section>

      <s-section heading="Email Alerts">
        {canEmail ? (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="toggle-email" />
            <s-checkbox name="email" checked={store.emailEnabled}>
              Receive weekly Monday morning email summaries
            </s-checkbox>
            <s-button type="submit" variant="primary" size="small">Save</s-button>
          </fetcher.Form>
        ) : (
          <s-banner status="warning">
            Email alerts are available on Starter and Pro plans.{currentPlan === "free" ? " Upgrade to enable." : ""}
          </s-banner>
        )}
      </s-section>

      <s-section heading="Excluded Products">
        {excludedProducts.length === 0 ? (
          <s-paragraph>No excluded products. Products you ignore on the dashboard will appear here.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header>
              <s-table-header-cell>Product</s-table-header-cell>
              <s-table-header-cell>Reason</s-table-header-cell>
              <s-table-header-cell>Action</s-table-header-cell>
            </s-table-header>
            <s-table-body>
              {excludedProducts.map((ep) => (
                <s-table-row key={ep.id}>
                  <s-table-cell>{ep.product?.title || "Unknown"}</s-table-cell>
                  <s-table-cell>{ep.reason || "Manual exclusion"}</s-table-cell>
                  <s-table-cell>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="remove-exclusion" />
                      <input type="hidden" name="exclusionId" value={ep.id} />
                      <s-button type="submit" variant="tertiary" size="small">Restore</s-button>
                    </fetcher.Form>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Manual Rescan">
        <s-paragraph>Trigger a full rescan of your inventory now.</s-paragraph>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="rescan" />
          <s-button type="submit" variant="secondary" size="small">Rescan Now</s-button>
        </fetcher.Form>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
