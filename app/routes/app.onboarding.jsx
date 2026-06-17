import { redirect, useLoaderData, useNavigation } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { scanStore } from "../services/scanner.server";
import { detectDeadStock } from "../services/detection.server";
import prisma from "../db.server";

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
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const threshold = parseInt(formData.get("threshold") || "60", 10);

  await prisma.store.update({
    where: { shop: session.shop },
    data: { threshold, onboardingDone: true, scanStatus: "scanning", scanProgress: 0 },
  });

  const result = await scanStore(admin, session.shop);

  await detectDeadStock(session.shop);

  await prisma.store.update({
    where: { shop: session.shop },
    data: { scanStatus: "completed", scanProgress: 100 },
  });

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || session.shop;
  const host = url.searchParams.get("host");
  const locale = url.searchParams.get("locale") || "en-US";
  const params = new URLSearchParams({ shop, host, embedded: "1", locale });
  return redirect(`/app?${params.toString()}`);
};

export default function Onboarding() {
  const { threshold } = useLoaderData();
  const navigation = useNavigation();
  const isScanning = navigation.state === "submitting";

  useEffect(() => {
    if (isScanning) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch("/app/scan-status");
          const data = await res.json();
          const progressEl = document.getElementById("scan-progress");
          if (progressEl) progressEl.value = data.scanProgress || 0;
          const textEl = document.getElementById("scan-text");
          if (textEl) textEl.textContent = `Scanning your catalog... ${data.scanProgress || 0}%`;
        } catch {}
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isScanning]);

  if (isScanning) {
    return (
      <div style={{ padding: "24px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Scanning Your Store</h1>
        <p style={{ marginBottom: 16, color: "#6d7175" }}>
          We're analyzing your products and order history. This usually takes 2–5 minutes.
        </p>
        <progress id="scan-progress" value="0" max="100" style={{ width: "100%", height: 20, borderRadius: 8 }}></progress>
        <p id="scan-text" style={{ textAlign: "center", marginTop: 8, color: "#6d7175" }}>Starting scan...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Welcome to Dead Stock Finder</h1>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>Choose your detection threshold</h2>
        <p style={{ marginBottom: 16, color: "#6d7175" }}>
          Dead Stock Finder will flag any product that hasn't sold within your chosen time window.
          You can change this at any time from Settings.
        </p>
        <form method="post">
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 12, cursor: "pointer", padding: 12, border: "1px solid #d2d5d8", borderRadius: 8 }}>
              <input type="radio" name="threshold" value="30" />
              <strong style={{ marginLeft: 8 }}>30 days</strong>
              <span style={{ marginLeft: 4, color: "#6d7175" }}>— For fast-moving consumer goods</span>
            </label>
            <label style={{ display: "block", marginBottom: 12, cursor: "pointer", padding: 12, border: "1px solid #008060", borderRadius: 8, backgroundColor: "#f1f8f5" }}>
              <input type="radio" name="threshold" value="60" defaultChecked />
              <strong style={{ marginLeft: 8 }}>60 days</strong>
              <span style={{ marginLeft: 4, color: "#6d7175" }}>— Recommended for most stores</span>
            </label>
            <label style={{ display: "block", marginBottom: 12, cursor: "pointer", padding: 12, border: "1px solid #d2d5d8", borderRadius: 8 }}>
              <input type="radio" name="threshold" value="90" />
              <strong style={{ marginLeft: 8 }}>90 days</strong>
              <span style={{ marginLeft: 4, color: "#6d7175" }}>— For seasonal or slow-moving inventory</span>
            </label>
          </div>
          <button type="submit" style={{ padding: "10px 24px", fontSize: 14, fontWeight: 500, color: "#fff", backgroundColor: "#008060", border: "none", borderRadius: 6, cursor: "pointer" }}>
            Start Scanning
          </button>
        </form>
      </div>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
