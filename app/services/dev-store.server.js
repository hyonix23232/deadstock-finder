export async function isDevStore(session) {
  if (process.env.AUTO_UNLOCK_PRO === "true") return true;
  try {
    const url = `https://${session.shop}/admin/api/2026-04/graphql.json`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": session.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query { shop { name plan { displayName partnerDevelopment } } }`,
      }),
    });
    const json = await resp.json();
    if (json?.data?.shop?.plan?.partnerDevelopment === true) return true;
    const displayName = json?.data?.shop?.plan?.displayName || "";
    if (/development|staff|partner/i.test(displayName)) return true;
    return false;
  } catch (e) {
    return false;
  }
}
