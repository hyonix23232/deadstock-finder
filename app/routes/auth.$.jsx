import { redirect } from "react-router";
import { authenticate, login } from "../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  // Direct, non-embedded access without a host param — use login flow
  // (redirects to Shopify OAuth install page)
  if (shop && !url.searchParams.get("host")) {
    return await login(request);
  }

  try {
    await authenticate.admin(request);
    // Authenticated — redirect to app, preserving embedded params
    const host = url.searchParams.get("host");
    const locale = url.searchParams.get("locale");
    const params = new URLSearchParams({ shop, host, embedded: "1", locale });
    throw redirect(`/app?${params.toString()}`);
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    throw e;
  }
};
