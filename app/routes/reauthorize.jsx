import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const shopify = await import("../shopify.server");
  const sessionStorage = shopify.sessionStorage;

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) return new Response("Missing shop", { status: 400 });

  await sessionStorage.deleteSession(`offline_${shop}`);
  console.log(`Deleted session for ${shop}, redirecting back`);

  const appUrl = process.env.SHOPIFY_APP_URL || "";
  const host = url.searchParams.get("host");
  const returnUrl = host
    ? `/auth/session-token?shop=${shop}&host=${host}&shopify-reload=${encodeURIComponent(appUrl + "/app/settings?shop=" + shop)}`
    : `/app/settings?shop=${shop}`;
  return redirect(returnUrl);
};

export default function Reauthorize() {
  return null;
}
