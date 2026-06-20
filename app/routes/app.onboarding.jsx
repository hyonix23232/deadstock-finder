import { useLoaderData, useNavigate, redirect } from "react-router";
import { useEffect, useState, useCallback } from "react";
import { Page, Card, Text, BlockStack, Button, Banner, ProgressBar, RadioButton, InlineStack } from "@shopify/polaris";

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
  const [scanning, setScanning] = useState(false);
  const [threshold, setThreshold] = useState(initialThreshold || 60);
  const [error, setError] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanCurrent, setScanCurrent] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!scanning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/app/scan-status");
        const data = await res.json();
        setScanProgress(data.scanProgress || 0);
        setScanCurrent(data.scanCurrentProduct || 0);
        setScanTotal(data.scanTotalProducts || 0);
        if (data.scanStatus === "completed") {
          clearInterval(interval);
          const loc = new URL(window.location.href);
          let shop = loc.searchParams.get("shop");
          let host = loc.searchParams.get("host");
          if (shop === "null" || !shop) {
            shop = "deadstock-finder.myshopify.com";
          }
          if ((!host || host === "null") && shop) {
            host = btoa(`admin.shopify.com/store/${shop}`).replace(/=+$/, "");
          }
          const params = new URLSearchParams({ shop, host, embedded: "1", locale: "en-US" });
          navigate(`/app?${params.toString()}`, { replace: true });
        }
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, [scanning, navigate]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const loc = new URL(window.location.href);
      let shop = loc.searchParams.get("shop");
      let host = loc.searchParams.get("host");
      if (shop === "null" || !shop) {
        shop = "deadstock-finder.myshopify.com";
      }
      if ((!host || host === "null") && shop) {
        const storeName = shop.replace(".myshopify.com", "");
        host = btoa(`admin.shopify.com/store/${storeName}`).replace(/=+$/, "");
      }
      const params = new URLSearchParams({ shop, host, embedded: "1", locale: "en-US" });
      const scanUrl = `/app/scan?${params.toString()}`;
      const res = await fetch(scanUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold }),
      });
      if (!res.ok) {
        const err = await res.text();
        setError(`Scan failed (${res.status}): ${err}`);
        setScanning(false);
      }
    } catch (err) {
      setError(err.message || String(err));
      setScanning(false);
    }
  }, [threshold]);

  if (scanning) {
    return (
      <Page title="Scanning your store">
        <Card>
          <BlockStack gap="400" align="center">
            <Text variant="headingMd" as="h2" alignment="center">
              We're analyzing your products and orders
            </Text>
            <Text variant="bodySm" as="p" tone="subdued" alignment="center">
              This usually takes 2–5 minutes depending on catalog size
            </Text>
            <ProgressBar
              progress={scanProgress}
              size="large"
              color="success"
            />
            <Text variant="bodySm" as="p" tone="subdued" alignment="center">
              {scanTotal > 0
                ? `Scanning ${scanCurrent} of ${scanTotal} products... ${scanProgress}% complete`
                : `Analyzing your catalog... ${scanProgress}%`}
            </Text>
          </BlockStack>
        </Card>
        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}
      </Page>
    );
  }

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
                <Card
                  key={opt.value}
                  padding="300"
                >
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
          <Button variant="primary" onClick={handleScan}>
            Start Scanning
          </Button>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}

export const headers = async (headersArgs) => {
  const { boundary } = await import("@shopify/shopify-app-react-router/server");
  return boundary.headers(headersArgs);
};
