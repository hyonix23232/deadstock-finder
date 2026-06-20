import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const result = await prisma.session.deleteMany({
  where: { shop: "deadstock-finder.myshopify.com", isOnline: false },
});
console.log(`Deleted ${result.count} offline sessions`);
await prisma.$disconnect();
