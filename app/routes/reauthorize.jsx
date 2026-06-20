export const loader = async ({ request }) => {
  const shopify = await import("../shopify.server");
  const sessionStorage = shopify.sessionStorage;

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) return new Response("Missing shop", { status: 400 });

  await sessionStorage.deleteSession(`offline_${shop}`);
  console.log(`Deleted session for ${shop}, navigating to shop admin`);

  const storefront = shop.replace(".myshopify.com", "");
  const shopUrl = `https://admin.shopify.com/store/${storefront}/apps/${process.env.SHOPIFY_API_KEY}`;

  return new Response(
    `<!DOCTYPE html>
<html><head><title>Reauthorizing</title></head><body>
<p>Reauthorizing your session...</p>
<script>
  window.open(${JSON.stringify(shopUrl)}, '_top');
</script>
</body></html>`,
    {
      status: 200,
      headers: { "content-type": "text/html;charset=utf-8" },
    }
  );
};

export default function Reauthorize() {
  return null;
}
