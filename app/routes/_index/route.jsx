import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", maxWidth: 600, margin: "40px auto", padding: "0 20px" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#202223", marginBottom: 8 }}>Dead Stock Finder</h1>
        <p style={{ fontSize: 16, color: "#6d7175", marginBottom: 32 }}>
          Find dead stock before it drains your profit. Get clear insights and actionable suggestions — automatically.
        </p>
      </div>
      {showForm && (
        <Form method="post" action="/auth/login" style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#202223", marginBottom: 4 }}>
              Shop domain
            </label>
            <input
              type="text"
              name="shop"
              placeholder="my-store.myshopify.com"
              style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #c9cccf", borderRadius: 6, boxSizing: "border-box" }}
            />
          </div>
          <button
            type="submit"
            style={{ width: "100%", padding: "10px 16px", fontSize: 14, fontWeight: 500, color: "#fff", backgroundColor: "#008060", border: "none", borderRadius: 6, cursor: "pointer" }}
          >
            Log in
          </button>
        </Form>
      )}
      <ul style={{ listStyle: "none", padding: 0 }}>
        <li style={{ padding: "12px 0", borderBottom: "1px solid #e1e3e5" }}>
          <strong style={{ color: "#202223" }}>Instant Inventory Scan</strong>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#6d7175" }}>Scans your entire catalog in minutes. No setup required.</p>
        </li>
        <li style={{ padding: "12px 0", borderBottom: "1px solid #e1e3e5" }}>
          <strong style={{ color: "#202223" }}>Dead Stock Detection</strong>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#6d7175" }}>Flags products with zero sales in 30, 60, or 90 days.</p>
        </li>
        <li style={{ padding: "12px 0", borderBottom: "1px solid #e1e3e5" }}>
          <strong style={{ color: "#202223" }}>"Why" Insights</strong>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#6d7175" }}>Understand why each product was flagged, with clear explanations.</p>
        </li>
        <li style={{ padding: "12px 0" }}>
          <strong style={{ color: "#202223" }}>Action Suggestions</strong>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#6d7175" }}>Get discount, bundle, or archive recommendations automatically.</p>
        </li>
      </ul>
    </div>
  );
}
