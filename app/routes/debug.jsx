import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const authResult = await authenticate.admin(request);
  if (authResult instanceof Response) return authResult;
  const { session, admin } = authResult;

  const results = [];

  results.push({
    step: "session",
    shop: session.shop,
    scope: session.scope,
    hasToken: !!session.accessToken,
    tokenPrefix: session.accessToken?.substring(0, 10),
    isOnline: session.isOnline,
  });

  try {
    const restUrl = `https://${session.shop}/admin/api/2026-04/shop.json`;
    const restResp = await fetch(restUrl, {
      headers: {
        "X-Shopify-Access-Token": session.accessToken,
        "Content-Type": "application/json",
      },
    });
    const restBody = await restResp.text();
    results.push({
      step: "rest",
      status: restResp.status,
      statusText: restResp.statusText,
      body: restBody.substring(0, 300),
    });
  } catch (e) {
    results.push({ step: "rest_error", error: e.message });
  }

  try {
    const gqlResp = await admin.graphql(
      `#graphql
      query { shop { name } }`
    );
    const gqlBody = await gqlResp.json();
    results.push({
      step: "graphql",
      status: gqlResp.status,
      body: JSON.stringify(gqlBody).substring(0, 300),
    });
  } catch (e) {
    results.push({ step: "graphql_error", error: e.message || String(e) });
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};
