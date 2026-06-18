import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PLAN_MAP = {
  Starter: "starter",
  Pro: "pro",
};

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);
  const subscription = payload?.app_subscription;

  if (!subscription) return new Response();

  const planKey = PLAN_MAP[subscription.name];
  if (!planKey) return new Response();

  const isActive = subscription.status === "ACTIVE";
  const newPlan = isActive ? planKey : "free";

  await prisma.store.updateMany({
    where: { shop },
    data: { plan: newPlan },
  });

  console.log(`Updated ${shop} to plan "${newPlan}" via ${subscription.status} webhook`);
  return new Response();
};
