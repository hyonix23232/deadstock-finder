import prisma from "../db.server";
import { getOrCreateStore, updateScanProgress } from "./store.server";

async function shopifyFetch(session, query, variables = {}) {
  const url = `https://${session.shop}/admin/api/2026-04/graphql.json`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": session.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await resp.json();
  if (json.errors) {
    throw new Error(`Shopify API GraphQL error: ${JSON.stringify(json.errors).substring(0, 300)}`);
  }
  return json;
}

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
  query GetOrders($productQuery: String, $cursor: String) {
    orders(first: 250, after: $cursor, query: $productQuery) {
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

async function fetchAllProducts(session) {
  const products = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const json = await shopifyFetch(session, PRODUCTS_QUERY, { cursor });
    const page = json?.data?.products;
    if (!page?.edges) break;
    for (const edge of page.edges) {
      const node = edge.node;
      if (!node) continue;
      products.push({
        id: node.id,
        title: node.title,
        handle: node.handle,
        status: node.status,
        inventoryCount: node.totalInventory || 0,
        category: node.category?.name || null,
        price: parseFloat(node.variants?.edges?.[0]?.node?.price || "0"),
        createdAt: new Date(node.createdAt),
      });
    }
    hasNext = page.pageInfo?.hasNextPage ?? false;
    cursor = page.pageInfo?.endCursor || null;
  }
  return products;
}

async function fetchProductOrders(session, productGid) {
  const orders = [];
  let cursor = null;
  let hasNext = true;
  const numericId = productGid.split("/").pop();

  while (hasNext) {
    const json = await shopifyFetch(session, ORDERS_QUERY, {
      productQuery: `product_id:${numericId}`,
      cursor,
    });
    const page = json?.data?.orders;
    if (!page?.edges) break;
    for (const edge of page.edges) {
      const hasProduct = edge.node.lineItems.edges.some(
        (li) => li.node.product?.id === productGid
      );
      if (hasProduct) {
        orders.push(new Date(edge.node.processedAt));
      }
    }
    hasNext = page.pageInfo?.hasNextPage ?? false;
    cursor = page.pageInfo?.endCursor || null;
  }
  return orders;
}

export async function scanStore(session, shop) {
  const store = await getOrCreateStore(shop);
  await updateScanProgress(shop, "scanning", 0);

  const products = await fetchAllProducts(session);
  const total = products.length;
  await updateScanProgress(shop, "scanning", 5, 0, total);

  const excludedIds = new Set(
    (await prisma.excludedProduct.findMany({ where: { shop }, select: { productId: true } })).map(e => e.productId)
  );

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const progress = 5 + Math.round(((i + 1) / total) * 85);
    await updateScanProgress(shop, "scanning", progress, i + 1, total);

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
      const orders = await fetchProductOrders(session, p.id);
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
