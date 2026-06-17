import prisma from "../db.server";

export async function getOrCreateStore(shop) {
  let store = await prisma.store.findUnique({ where: { shop } });
  if (!store) {
    store = await prisma.store.create({
      data: { shop },
    });
  }
  return store;
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
