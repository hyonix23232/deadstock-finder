import { Outlet, useLoaderData, useRouteError, NavLink } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";

const navStyle = {
  borderBottom: "1px solid #e1e3e5",
  background: "#fff",
  padding: "0 20px",
  display: "flex",
  justifyContent: "space-between",
  flexWrap: "wrap",
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
  const { session } = await authenticate.admin(request);
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
          <div style={{ display: "flex", flexWrap: "wrap" }}>
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
          <NavLink to="/app/privacy" style={({ isActive }) => ({ ...linkBase, ...(isActive ? linkActive : {}) })}>
            Privacy
          </NavLink>
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
