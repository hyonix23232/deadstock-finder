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
      <s-page heading="Scanning Your Store">
        <s-section>
          <s-paragraph>We're analyzing your products and order history. This usually takes 2–5 minutes.</s-paragraph>
          <progress id="scan-progress" value="0" max="100" style={{ width: "100%", height: 20, borderRadius: 8 }}></progress>
          <p id="scan-text" style={{ textAlign: "center", marginTop: 8, color: "#6d7175" }}>Starting scan...</p>
        </s-section>
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
        <form method="post">
          <s-choice-list name="threshold" title="Detection threshold">
            <s-choice-list-item value="30">
              <s-text><strong>30 days</strong> — For fast-moving consumer goods</s-text>
            </s-choice-list-item>
            <s-choice-list-item value="60" checked>
              <s-text><strong>60 days</strong> — Recommended for most stores</s-text>
            </s-choice-list-item>
            <s-choice-list-item value="90">
              <s-text><strong>90 days</strong> — For seasonal or slow-moving inventory</s-text>
            </s-choice-list-item>
          </s-choice-list>
          <s-button-group>
            <s-button type="submit" variant="primary">
              Start Scanning
            </s-button>
          </s-button-group>
        </form>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
