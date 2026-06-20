import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const shopify = await import("../shopify.server");
  const sessionStorage = shopify.sessionStorage;

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) return new Response("Missing shop", { status: 400 });

  await sessionStorage.deleteSession(`offline_${shop}`);
  console.log(`Deleted session for ${shop}, redirecting back`);

  const installUrl = `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/oauth/install?client_id=${process.env.SHOPIFY_API_KEY}`;
  return redirect(installUrl);
};

export default function Reauthorize() {
  return null;
}
