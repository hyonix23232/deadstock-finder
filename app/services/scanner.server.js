import prisma from "../db.server";
import { getOrCreateStore, updateScanProgress } from "./store.server";

const PRODUCTS_QUERY = `#graphql
  query GetProducts($cursor: String) {
    products(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          status
          totalInventory
          category { name }
          createdAt
          variants(first: 1) {
            edges { node { price } }
          }
        }
      }
    }
  }
`;

const ORDERS_QUERY = `#graphql
  query GetOrders($productId: ID!, $cursor: String) {
    orders(first: 250, after: $cursor, query: $productId) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          processedAt
          lineItems(first: 10) {
            edges { node { product { id } } }
          }
        }
      }
    }
  }
`;

async function fetchAllProducts(admin) {
  const products = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const result = await admin.graphql(PRODUCTS_QUERY, {
      variables: { cursor },
    });
    const json = await result.json();
    const page = json.data.products;
    for (const edge of page.edges) {
      const node = edge.node;
      products.push({
        id: node.id,
        title: node.title,
        handle: node.handle,
        status: node.status,
        inventoryCount: node.totalInventory || 0,
        category: node.category?.name || null,
        price: parseFloat(node.variants.edges[0]?.node?.price || "0"),
        createdAt: new Date(node.createdAt),
      });
    }
    hasNext = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }
  return products;
}

async function fetchProductOrders(admin, productGid, shop) {
  const orders = [];
  let cursor = null;
  let hasNext = true;
  const productId = productGid.split("/").pop();

  while (hasNext) {
    const result = await admin.graphql(ORDERS_QUERY, {
      variables: { productId: `gid://shopify/Product/${productId}`, cursor },
    });
    const json = await result.json();
    const page = json.data.orders;
    for (const edge of page.edges) {
      const hasProduct = edge.node.lineItems.edges.some(
        (li) => li.node.product?.id === productGid
      );
      if (hasProduct) {
        orders.push(new Date(edge.node.processedAt));
      }
    }
    hasNext = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }
  return orders;
}

export async function scanStore(admin, shop) {
  const store = await getOrCreateStore(shop);
  await updateScanProgress(shop, "scanning", 0);

  const products = await fetchAllProducts(admin);
  const total = products.length;
  await updateScanProgress(shop, "scanning", 5);

  const excludedIds = new Set(
    (await prisma.excludedProduct.findMany({ where: { shop }, select: { productId: true } })).map(e => e.productId)
  );

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const progress = 5 + Math.round(((i + 1) / total) * 85);
    await updateScanProgress(shop, "scanning", progress);

    const existingProduct = await prisma.product.findUnique({
      where: { id: p.id },
    });

    if (!existingProduct) {
      await prisma.product.create({
        data: {
          id: p.id,
          shop,
          title: p.title,
          handle: p.handle,
          price: p.price,
          category: p.category,
          inventoryCount: p.inventoryCount,
          status: p.status,
          createdAt: p.createdAt,
        },
      });
    } else {
      await prisma.product.update({
        where: { id: p.id },
        data: {
          title: p.title,
          handle: p.handle,
          price: p.price,
          category: p.category,
          inventoryCount: p.inventoryCount,
          status: p.status,
        },
      });
    }

    if (store.plan !== "free" || i < 50) {
      const orders = await fetchProductOrders(admin, p.id, shop);
      const lastOrder = orders.length > 0 ? orders.sort((a, b) => b - a)[0] : null;
      const totalSales = orders.length;

      await prisma.product.update({
        where: { id: p.id },
        data: {
          lastOrderAt: lastOrder,
          totalSales,
        },
      });
    }
  }

  await updateScanProgress(shop, "completed", 100);

  const history = await prisma.scanHistory.create({
    data: {
      shop,
      productsScanned: total,
      deadStockFound: 0,
      status: "completed",
      completedAt: new Date(),
    },
  });

  await prisma.store.update({
    where: { shop },
    data: { lastScanAt: new Date(), scanStatus: "completed" },
  });

  return { total, history };
}
