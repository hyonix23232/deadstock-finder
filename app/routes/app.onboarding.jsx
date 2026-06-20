import { useLoaderData, redirect } from "react-router";
import { useState, useEffect, useRef } from "react";
import { Page, Card, Text, BlockStack, Button, Banner, RadioButton, InlineStack, ProgressBar, Box } from "@shopify/polaris";

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
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanCurrent, setScanCurrent] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [scanDone, setScanDone] = useState(false);
  const pollRef = useRef(null);

  const loc = typeof window !== "undefined" ? new URL(window.location.href) : null;
  const shop = loc?.searchParams.get("shop") || "";
  const host = loc?.searchParams.get("host") || "";

  // Poll scan status while scanning
  useEffect(() => {
    if (!scanning || scanDone) return;
    const interval = setInterval(async () => {
      try {
        const url = `/app/scan-status?shop=${encodeURIComponent(shop)}&t=${Date.now()}`;
        const res = await fetch(url);
        const data = await res.json();
        setScanProgress(data.scanProgress || 0);
        setScanCurrent(data.scanCurrentProduct || 0);
        setScanTotal(data.scanTotalProducts || 0);
        if (data.scanStatus === "completed" || data.scanStatus?.startsWith?.("error") || data.scanStatus === "error") {
          clearInterval(interval);
          setScanDone(true);
          const params = new URLSearchParams({ shop, host, embedded: "1", locale: "en-US" });
          window.location.href = `/app?${params.toString()}`;
        }
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, [scanning, scanDone, shop, host]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("shop", shop);
      formData.append("threshold", String(threshold));
      const res = await fetch("/app/start", { method: "POST", body: formData });
      if (!res.ok) {
        throw new Error(await res.text().catch(() => "Request failed"));
      }
    } catch (e) {
      setError(e?.message || "Could not start scan");
      setLoading(false);
      return;
    }
    setLoading(false);
    setScanning(true);
  };

  if (scanning) {
    return (
      <Page title="Analyzing your inventory">
        <Card>
          <Box padding="800">
            <BlockStack gap="400" align="center">
              <Text variant="headingLg" as="h2" alignment="center">
                Analyzing your inventory
              </Text>
              <ProgressBar progress={scanProgress} size="large" color="success" />
              <Text variant="bodyMd" as="p" tone="subdued" alignment="center">
                {scanTotal > 0
                  ? `Scanning product ${scanCurrent} of ${scanTotal}`
                  : "Starting scan..."}
              </Text>
            </BlockStack>
          </Box>
        </Card>
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
          <Button variant="primary" onClick={handleStart} loading={loading}>
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
