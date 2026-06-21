export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    productLimit: 50,
    trialDays: 0,
    features: ["scan", "detection", "insights", "suggestions", "exclude", "dashboard", "badge", "mobile"],
  },
  starter: {
    name: "Starter",
    price: 15,
    productLimit: 500,
    trialDays: 7,
    features: ["scan", "detection", "insights", "suggestions", "exclude", "dashboard", "badge", "mobile"],
  },
  pro: {
    name: "Pro",
    price: 29,
    productLimit: Infinity,
    trialDays: 7,
    features: ["scan", "detection", "insights", "suggestions", "exclude", "dashboard", "badge", "mobile", "bulk", "reports"],
  },
};

export function hasFeature(plan, feature) {
  return PLANS[plan]?.features?.includes(feature) ?? false;
}

export function getProductLimit(plan) {
  return PLANS[plan]?.productLimit ?? 0;
}

export const BILLING_PLANS = [
  {
    name: "Starter",
    amount: 1500,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS",
    trialDays: 7,
    replacementBehavior: "IMMEDIATELY",
  },
  {
    name: "Pro",
    amount: 2900,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS",
    trialDays: 7,
    replacementBehavior: "IMMEDIATELY",
  },
];
