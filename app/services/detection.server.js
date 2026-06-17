import prisma from "../db.server";
import { getStore } from "./store.server";

export async function detectDeadStock(shop) {
  const store = await getStore(shop);
  if (!store) return [];

  const threshold = store.threshold;
  const cutoffDate = new Date(Date.now() - threshold * 24 * 60 * 60 * 1000);

  const excludedIds = (
    await prisma.excludedProduct.findMany({ where: { shop }, select: { productId: true } })
  ).map((e) => e.productId);

  const products = await prisma.product.findMany({
    where: {
      shop,
      status: "ACTIVE",
      id: { notIn: excludedIds },
    },
  });

  const deadStockEntries = [];

  for (const product of products) {
    const lastOrder = product.lastOrderAt;
    const daysSince = lastOrder
      ? Math.floor((Date.now() - new Date(lastOrder).getTime()) / (1000 * 60 * 60 * 24))
      : product.createdAt
        ? Math.floor((Date.now() - new Date(product.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

    if (daysSince >= threshold) {
      const reason = generateWhy(product, daysSince, lastOrder);
      const suggestion = generateSuggestion(product, daysSince);

      const existing = await prisma.deadStockEntry.findFirst({
        where: { productId: product.id, shop, resolved: false },
      });

      if (!existing) {
        await prisma.deadStockEntry.create({
          data: {
            productId: product.id,
            shop,
            threshold,
            daysSinceSale: daysSince,
            reason,
            suggestedAction: suggestion.action,
            suggestedData: suggestion.data ? JSON.stringify(suggestion.data) : null,
          },
        });
      }

      deadStockEntries.push({
        id: product.id,
        title: product.title,
        handle: product.handle,
        price: product.price,
        inventoryCount: product.inventoryCount,
        daysSince,
        reason,
        suggestion,
      });
    } else {
      await prisma.deadStockEntry.updateMany({
        where: { productId: product.id, shop, resolved: false },
        data: { resolved: true, resolvedAt: new Date() },
      });
    }
  }

  return deadStockEntries;
}

function generateWhy(product, daysSince, lastOrder) {
  if (!lastOrder) {
    const daysSinceCreated = Math.floor(
      (Date.now() - new Date(product.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceCreated < 60) {
      return `Never sold since added to store ${daysSinceCreated} days ago`;
    }
    return `Never sold since added to store ${daysSinceCreated} days ago — consider archiving`;
  }

  if (product.totalSales > 0 && daysSince > 45) {
    const prevDays = daysSince - 45;
    return `Sold well until ${prevDays} days ago — may be seasonal`;
  }

  if (product.price > 50 && product.inventoryCount > 5) {
    return `Had limited views but 0 purchases — price may be too high`;
  }

  return `Last sold ${daysSince} days ago`;
}

function generateSuggestion(product, daysSince) {
  if (daysSince >= 90 || (!product.lastOrderAt && daysSince >= 60)) {
    return {
      action: "archive",
      data: { message: "Recommend removing from active catalog" },
    };
  }

  if (daysSince >= 45) {
    const discountPct = Math.min(20 + Math.floor((daysSince - 45) / 15) * 10, 70);
    return {
      action: "discount",
      data: { percentage: discountPct, message: `Suggest ${discountPct}% discount` },
    };
  }

  return {
    action: "bundle",
    data: { message: "Pair with a bestseller in the same category" },
  };
}

export async function getDashboardStats(shop) {
  const store = await getStore(shop);
  const deadStock = await prisma.deadStockEntry.findMany({
    where: { shop, resolved: false },
    include: { product: true },
  });

  const totalDeadStock = deadStock.length;
  const totalValue = deadStock.reduce(
    (sum, entry) => sum + entry.product.price * entry.product.inventoryCount,
    0
  );

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const lastWeekCount = await prisma.deadStockEntry.count({
    where: { shop, flaggedAt: { lte: sevenDaysAgo }, resolved: false },
  });

  const trend = lastWeekCount > 0
    ? Math.round(((totalDeadStock - lastWeekCount) / lastWeekCount) * 100)
    : 0;

  return {
    totalDeadStock,
    totalValue,
    trend,
    threshold: store.threshold,
    plan: store.plan,
    lastScanAt: store.lastScanAt,
  };
}

export async function refreshDeadStock(shop) {
  await detectDeadStock(shop);
  return getDashboardStats(shop);
}
