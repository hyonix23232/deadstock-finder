import { redirect } from "react-router";
import { authenticate, login } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop && !url.searchParams.get("host")) {
    return await login(request);
  }

  try {
    const { session } = await authenticate.admin(request);

    // Detect OAuth callback (new install / reinstall) and reset onboarding
    if (url.searchParams.has("code") && session?.shop) {
      await prisma.store.upsert({
        where: { shop: session.shop },
        update: { onboardingDone: false, scanStatus: "pending", scanProgress: 0 },
        create: { shop: session.shop, onboardingDone: false },
      });
    }

    const params = new URLSearchParams();
    params.set("shop", session?.shop || shop);
    params.set("embedded", "1");
    if (url.searchParams.get("host")) params.set("host", url.searchParams.get("host"));
    if (url.searchParams.get("locale")) params.set("locale", url.searchParams.get("locale"));
    throw redirect(`/app?${params.toString()}`);
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    throw e;
  }
};
