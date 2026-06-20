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
