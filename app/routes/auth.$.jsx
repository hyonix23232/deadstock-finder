import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  try {
    await authenticate.admin(request);
    // Authenticated — redirect to app, preserving embedded params
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const host = url.searchParams.get("host");
    const locale = url.searchParams.get("locale");
    const params = new URLSearchParams({ shop, host, embedded: "1", locale });
    throw redirect(`/app?${params.toString()}`);
  } catch (e) {
    // authenticate.admin throws a Response when auth is needed
    if (e instanceof Response) {
      return e;
    }
    throw e;
  }
};
