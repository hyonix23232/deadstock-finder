import { Outlet, useLoaderData, useRouteError, NavLink, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";

const navStyle = {
  background: "#fff",
  borderBottom: "1px solid #e2e8f0",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 20px",
  height: 52,
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

function TabIcon({ name, active }) {
  const c = active ? "#2563eb" : "#94a3b8";
  const s = { stroke: c, strokeWidth: "1.3", fill: "none" };
  switch (name) {
    case "Dashboard":
      return <svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="5" height="5" rx="1" {...s}/><rect x="8" y="1" width="5" height="5" rx="1" {...s}/><rect x="1" y="8" width="5" height="5" rx="1" {...s}/><rect x="8" y="8" width="5" height="5" rx="1" {...s}/></svg>;
    case "Settings":
      return <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="2.3" {...s}/><path d="M7 1v2.5M7 10.5V13M1 7h2.5M10.5 7H13M3.2 3.2l1.8 1.8M9 9l1.8 1.8M3.2 10.8L5 9M9 5l1.8-1.8" {...s} strokeLinecap="round"/></svg>;
    case "Reports":
      return <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" rx="1.5" {...s}/><line x1="4.5" y1="5.5" x2="9.5" y2="5.5" {...s} strokeLinecap="round"/><line x1="4.5" y1="8.5" x2="8" y2="8.5" {...s} strokeLinecap="round"/></svg>;
    case "Privacy":
      return <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1.5L2 3.8v4c0 3 5 5.2 5 5.2s5-2.2 5-5.2v-4L7 1.5z" {...s}/><line x1="5" y1="7.5" x2="6.5" y2="9" {...s} strokeLinecap="round"/><line x1="6.5" y1="9" x2="9" y2="6" {...s} strokeLinecap="round"/></svg>;
    default:
      return null;
  }
}

export default function App() {
  const { apiKey } = useLoaderData();
  const location = useLocation();
  const search = location.search;

  const tabs = [
    { to: "/app", name: "Dashboard", end: true },
    { to: "/app/settings", name: "Settings" },
    { to: "/app/reports", name: "Reports" },
  ];

  function Tab({ to, name, end }) {
    return (
      <NavLink to={{ pathname: to, search }} end={end} style={{ textDecoration: "none" }}>
        {({ isActive, isPending }) => (
          <span style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: isActive ? 600 : 450,
            color: isActive ? "#2563eb" : "#64748b",
            background: isActive ? "#eff6ff" : "transparent",
            borderRadius: 7,
            transition: "all 0.15s",
            ...(isPending ? { opacity: 0.7 } : {}),
          }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#f1f5f9"; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
          >
            <TabIcon name={name} active={isActive} />
            {name}
          </span>
        )}
      </NavLink>
    );
  }

  return (
    <PolarisProvider i18n={enTranslations}>
      <AppProvider embedded apiKey={apiKey}>
        <div style={navStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {tabs.map((tab) => <Tab key={tab.to} {...tab} />)}
          </div>
          <NavLink to={{ pathname: "/app/privacy", search }} style={{ textDecoration: "none" }}>
            {({ isActive }) => (
              <span style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "6px 14px",
                fontSize: 12.5,
                fontWeight: 500,
                color: isActive ? "#2563eb" : "#94a3b8",
                background: isActive ? "#eff6ff" : "#f8fafc",
                border: "1px solid",
                borderColor: isActive ? "#bfdbfe" : "#e2e8f0",
                borderRadius: 20,
                transition: "all 0.15s",
              }}>
                <TabIcon name="Privacy" active={isActive} />
                Privacy
              </span>
            )}
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
