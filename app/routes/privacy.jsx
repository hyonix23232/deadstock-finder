export const loader = () => {
  return { ok: true };
};

export default function PublicPrivacy() {
  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: "#1a1a2e" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Privacy Policy for Dead Stock Finder</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>Last updated: June 2026</p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Data We Collect</h2>
      <p style={{ lineHeight: 1.6 }}>
        When you install Dead Stock Finder, we access your Shopify store's product catalog, order history,
        and basic store information (shop domain, plan) solely for the purpose of detecting dead stock.
        We do not collect personal information about your customers.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>How We Use Your Data</h2>
      <p style={{ lineHeight: 1.6 }}>
        Your product and order data is used to scan inventory and flag unsold products, generate
        dead stock insights and action suggestions, and generate downloadable reports.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Data Storage</h2>
      <p style={{ lineHeight: 1.6 }}>
        All store data is stored securely and is only accessible to your store and our application.
        We retain your data for as long as your app is installed. Upon uninstallation, all data
        associated with your store is permanently deleted within 30 days.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Third-Party Sharing</h2>
      <p style={{ lineHeight: 1.6 }}>
        We do not sell, trade, or share your data with third parties. Data is processed solely
        within the Shopify ecosystem and our secure hosting infrastructure.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Contact</h2>
      <p style={{ lineHeight: 1.6 }}>
        For privacy-related inquiries, contact the app developer through the Shopify App Store listing.
      </p>
    </div>
  );
}
