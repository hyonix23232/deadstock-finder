import prisma from "../db.server";

export async function getOrCreateStore(shop) {
  return prisma.store.upsert({
    where: { shop },
    update: {},
    create: { shop },
  });
}

export async function updateStorePlan(shop, plan) {
  return prisma.store.update({
    where: { shop },
    data: { plan },
  });
}

export async function updateScanProgress(shop, status, progress) {
  return prisma.store.update({
    where: { shop },
    data: { scanStatus: status, scanProgress: progress ?? 0 },
  });
}

export async function getStore(shop) {
  return prisma.store.findUnique({ where: { shop } });
}
