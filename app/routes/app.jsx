import { Outlet, useLoaderData, useRouteError, useNavigate, redirect } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);

  const shop = url.searchParams.get("shop") || session.shop;
  const host = url.searchParams.get("host");
  const locale = url.searchParams.get("locale") || "en-US";

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    onboardingRequired: !store.onboardingDone && !url.pathname.includes("/onboarding"),
    onboardingParams: new URLSearchParams({ shop, host, embedded: "1", locale }).toString(),
  };
};

export default function App() {
  const { apiKey, onboardingRequired, onboardingParams } = useLoaderData();
  const navigate = useNavigate();

  useEffect(() => {
    if (onboardingRequired) {
      navigate(`/app/onboarding?${onboardingParams}`, { replace: true });
    }
  }, [onboardingRequired, onboardingParams, navigate]);

  if (onboardingRequired) return null;

  return (
    <PolarisProvider i18n={enTranslations}>
      <AppProvider embedded apiKey={apiKey}>
        <ui-nav-menu>
          <a href="/app" rel="home">Dashboard</a>
          <a href="/app/settings">Settings</a>
          <a href="/app/reports">Reports</a>
        </ui-nav-menu>
        <Outlet />
      </AppProvider>
    </PolarisProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
