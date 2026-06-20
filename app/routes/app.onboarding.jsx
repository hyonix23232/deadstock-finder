import { useLoaderData, redirect } from "react-router";
import { useState } from "react";
import { Page, Card, Text, BlockStack, Button, Banner, RadioButton, InlineStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import prisma from "../db.server";
import { scanStore } from "../services/scanner.server";
import { detectDeadStock } from "../services/detection.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);

  if (store.onboardingDone) {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop") || session.shop;
    const host = url.searchParams.get("host");
    const locale = url.searchParams.get("locale") || "en-US";
    const params = new URLSearchParams({ shop, host, embedded: "1", locale });
    return redirect(`/app?${params.toString()}`);
  }

  return { threshold: store.threshold };
};

export const action = async ({ request }) => {
  const { session, redirect } = await authenticate.admin(request);
  const formData = await request.formData();
  const threshold = parseInt(formData.get("threshold") || "60", 10);
  const shop = session.shop;

  await prisma.store.upsert({
    where: { shop },
    update: { threshold, onboardingDone: true, scanStatus: "scanning", scanProgress: 0, scanCurrentProduct: 0, scanTotalProducts: 0 },
    create: { shop, threshold: Number(threshold), onboardingDone: true, scanStatus: "scanning", scanProgress: 0, scanCurrentProduct: 0, scanTotalProducts: 0 },
  });

  const dbSessions = await prisma.session.findMany({ where: { shop } });
  for (const s of dbSessions) {
    try {
      const testUrl = `https://${s.shop}/admin/api/2026-04/graphql.json`;
      const testResp = await fetch(testUrl, {
        method: "POST",
        headers: { "X-Shopify-Access-Token": s.accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "query { shop { name } }" }),
      });
      if (testResp.ok) {
        (async () => {
          try {
            await scanStore(s, shop);
            await detectDeadStock(shop);
            await prisma.store.update({ where: { shop }, data: { scanStatus: "completed", scanProgress: 100 } });
          } catch (e) {
            const msg = e?.message || String(e);
            console.error("Background scan error:", msg, e?.stack || "");
            await prisma.store.update({ where: { shop }, data: { scanStatus: `error: ${msg.substring(0, 300)}` } });
          }
        })();
        break;
      }
    } catch {}
  }

  return redirect("/app");
};

const THRESHOLD_OPTIONS = [
  { value: 30, label: "30 days", description: "For fast-moving consumer goods" },
  { value: 60, label: "60 days", description: "Recommended for most stores" },
  { value: 90, label: "90 days", description: "For seasonal or slow-moving inventory" },
];

export default function Onboarding() {
  const { threshold: initialThreshold } = useLoaderData();
  const [threshold, setThreshold] = useState(initialThreshold || 60);

  return (
    <Page title="Welcome to Dead Stock Finder">
      <form method="POST">
        <input type="hidden" name="threshold" value={threshold} />
        <BlockStack gap="400">
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Choose your detection threshold</Text>
              <Text variant="bodySm" as="p" tone="subdued">
                Dead Stock Finder will flag any product that hasn't sold within your chosen time window.
                You can change this at any time from Settings.
              </Text>
              <BlockStack gap="200">
                {THRESHOLD_OPTIONS.map((opt) => (
                  <Card key={opt.value} padding="300">
                    <RadioButton
                      label={
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="bold" as="span">{opt.label}</Text>
                          <Text variant="bodySm" tone="subdued" as="span">{opt.description}</Text>
                        </BlockStack>
                      }
                      checked={threshold === opt.value}
                      onChange={() => setThreshold(opt.value)}
                      id={`threshold-${opt.value}`}
                      name="threshold"
                    />
                  </Card>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>

          <InlineStack gap="300">
            <Button variant="primary" submit>
              Start Scanning
            </Button>
          </InlineStack>
        </BlockStack>
      </form>
    </Page>
  );
}

export const headers = async (headersArgs) => {
  const { boundary } = await import("@shopify/shopify-app-react-router/server");
  return boundary.headers(headersArgs);
};
