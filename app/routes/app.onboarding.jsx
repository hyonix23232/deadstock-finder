import { useLoaderData, useNavigate, redirect } from "react-router";
import { useEffect, useState } from "react";

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

export default function Onboarding() {
  const { threshold: initialThreshold } = useLoaderData();
  const [scanning, setScanning] = useState(false);
  const [threshold, setThreshold] = useState(initialThreshold || 60);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!scanning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/app/scan-status");
        const data = await res.json();
        const progressEl = document.getElementById("scan-progress");
        if (progressEl) progressEl.value = data.scanProgress || 0;
        const textEl = document.getElementById("scan-text");
        if (textEl) textEl.textContent = `Scanning your catalog... ${data.scanProgress || 0}%`;
        if (data.scanStatus === "completed") {
          clearInterval(interval);
          const search = window.location.search;
          navigate(`/app?${search}`, { replace: true });
        }
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, [scanning, navigate]);

  if (scanning) {
    return (
      <s-page heading="Scanning Your Store">
        <s-section>
          <s-card padding="base">
            <s-flex gap="base" direction="column" align="center">
              <s-text size="large" variant="strong" style={{ marginBottom: 8 }}>
                We're analyzing your products and orders
              </s-text>
              <s-text size="small" color="subdued" style={{ marginBottom: 16 }}>
                This usually takes 2–5 minutes depending on catalog size
              </s-text>
              <progress
                id="scan-progress"
                value="0"
                max="100"
                style={{
                  width: "100%", height: 12, borderRadius: 6,
                  accentColor: "#008060",
                }}
              ></progress>
              <s-text id="scan-text" size="small" color="subdued">
                Starting scan...
              </s-text>
            </s-flex>
          </s-card>
        </s-section>
        {error && (
          <s-section>
            <s-banner status="critical">{error}</s-banner>
          </s-section>
        )}
      </s-page>
    );
  }

  return (
    <s-page heading="Welcome to Dead Stock Finder">
      <s-section heading="Choose your detection threshold">
        <s-paragraph>
          Dead Stock Finder will flag any product that hasn't sold within your chosen time window.
          You can change this at any time from Settings.
        </s-paragraph>
        <s-flex gap="base" direction="column" style={{ marginTop: 16 }}>
          {[
            { value: 30, label: "30 days", desc: "For fast-moving consumer goods" },
            { value: 60, label: "60 days", desc: "Recommended for most stores" },
            { value: 90, label: "90 days", desc: "For seasonal or slow-moving inventory" },
          ].map((opt) => (
            <s-card
              key={opt.value}
              padding="base"
              onClick={() => setThreshold(opt.value)}
              style={{
                cursor: "pointer",
                border: threshold === opt.value ? "2px solid #008060" : "2px solid transparent",
                backgroundColor: threshold === opt.value ? "#f1f8f5" : undefined,
              }}
            >
              <s-flex gap="base" align="center">
                <input
                  type="radio"
                  name="threshold"
                  value={opt.value}
                  checked={threshold === opt.value}
                  onChange={() => setThreshold(opt.value)}
                  style={{ margin: 0 }}
                />
                <s-flex direction="column" gap="none">
                  <s-text variant="strong">{opt.label}</s-text>
                  <s-text size="small" color="subdued">{opt.desc}</s-text>
                </s-flex>
              </s-flex>
            </s-card>
          ))}
        </s-flex>
      </s-section>

      {error && (
        <s-section>
          <s-banner status="critical">{error}</s-banner>
        </s-section>
      )}

      <s-section>
        <s-button
          variant="primary"
          onClick={async () => {
            setScanning(true);
            setError(null);
            try {
              const res = await fetch("/app/onboarding/scan", {
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
          }}
        >
          Start Scanning
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers = async (headersArgs) => {
  const { boundary } = await import("@shopify/shopify-app-react-router/server");
  return boundary.headers(headersArgs);
};
