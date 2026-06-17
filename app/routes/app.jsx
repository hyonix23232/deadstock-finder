import { Outlet, useLoaderData, useRouteError, NavLink, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";

const navStyle = {
  borderBottom: "1px solid #e1e3e5",
  background: "#fff",
  padding: "0 20px",
};

const linkBase = {
  display: "inline-block",
  padding: "12px 16px",
  textDecoration: "none",
  fontWeight: "500",
  fontSize: "14px",
  color: "#5c5f62",
  borderBottom: "2px solid transparent",
  marginBottom: "-1px",
};

const linkActive = {
  color: "#2c6eec",
  borderBottomColor: "#2c6eec",
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const { session } = await authenticate.admin(request);

  const store = await getOrCreateStore(session.shop);
  if (!store.onboardingDone && url.pathname === "/app") {
    const shop = url.searchParams.get("shop") || session.shop;
    const host = url.searchParams.get("host");
    const locale = url.searchParams.get("locale") || "en-US";
    return redirect(`/app/onboarding?${new URLSearchParams({ shop, host, embedded: "1", locale }).toString()}`);
  }

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <PolarisProvider i18n={enTranslations}>
      <AppProvider embedded apiKey={apiKey}>
        <div style={navStyle}>
          <div style={{ display: "flex", gap: 0 }}>
            <NavLink to="/app" end style={({ isActive }) => ({ ...linkBase, ...(isActive ? linkActive : {}) })}>
              Dashboard
            </NavLink>
            <NavLink to="/app/settings" style={({ isActive }) => ({ ...linkBase, ...(isActive ? linkActive : {}) })}>
              Settings
            </NavLink>
            <NavLink to="/app/reports" style={({ isActive }) => ({ ...linkBase, ...(isActive ? linkActive : {}) })}>
              Reports
            </NavLink>
          </div>
        </div>
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
