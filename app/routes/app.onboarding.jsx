import { useLoaderData, redirect } from "react-router";
import { useState } from "react";
import { Page, Card, Text, BlockStack, Button, Banner, RadioButton, InlineStack } from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { getOrCreateStore } = await import("../services/store.server");
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

const THRESHOLD_OPTIONS = [
  { value: 30, label: "30 days", description: "For fast-moving consumer goods" },
  { value: 60, label: "60 days", description: "Recommended for most stores" },
  { value: 90, label: "90 days", description: "For seasonal or slow-moving inventory" },
];

export default function Onboarding() {
  const { threshold: initialThreshold } = useLoaderData();
  const [threshold, setThreshold] = useState(initialThreshold || 60);
  const [error, setError] = useState(null);

  const loc = typeof window !== "undefined" ? new URL(window.location.href) : null;
  const shop = loc?.searchParams.get("shop") || "";
  const host = loc?.searchParams.get("host") || "";

  return (
    <Page title="Welcome to Dead Stock Finder">
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

        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        <InlineStack gap="300">
          <form method="POST" action={`/app/start?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}>
            <input type="hidden" name="threshold" value={threshold} />
            <Button variant="primary" submit>
              Start Scanning
            </Button>
          </form>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}

export const headers = async (headersArgs) => {
  const { boundary } = await import("@shopify/shopify-app-react-router/server");
  return boundary.headers(headersArgs);
};
