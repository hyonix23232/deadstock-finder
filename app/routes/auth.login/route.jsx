import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  return await login(request);
};

export const action = async ({ request }) => {
  return await login(request);
};

export default function Auth() {
  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", maxWidth: 600, margin: "40px auto", padding: "0 20px", textAlign: "center" }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: "#202223", marginBottom: 8 }}>GenieStock</h1>
      <p style={{ fontSize: 16, color: "#6d7175" }}>Redirecting to Shopify...</p>
    </div>
  );
}
