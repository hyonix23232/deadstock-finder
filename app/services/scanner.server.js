import prisma from "../db.server";
import { getOrCreateStore, updateScanProgress } from "./store.server";
import { getProductLimit } from "./billing.server";

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
          images(first: 1) {
            edges { node { url } }
          }
          variants(first: 50) {
            edges { node { price inventoryItem { tracked } } }
          }
        }
      }
    }
  }
`;

const ALL_ORDERS_QUERY = `#graphql
  query GetAllOrders($cursor: String) {
    orders(first: 250, after: $cursor, sortKey: PROCESSED_AT) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          processedAt
          lineItems(first: 100) {
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
      const firstImage = node.images?.edges?.[0]?.node?.url || null;
      products.push({
        id: node.id,
        title: node.title,
        handle: node.handle,
        status: node.status,
        inventoryCount: node.variants?.edges?.some(e => e.node?.inventoryItem?.tracked === true)
          ? (node.totalInventory ?? 0) : -1,
        category: node.category?.name || null,
        price: parseFloat(node.variants?.edges?.[0]?.node?.price || "0"),
        imageUrl: firstImage,
        createdAt: new Date(node.createdAt),
      });
    }
    hasNext = page.pageInfo?.hasNextPage ?? false;
    cursor = page.pageInfo?.endCursor || null;
  }
  return products;
}

async function fetchAllOrders(session, onPage) {
  const productOrders = {};
  let cursor = null;
  let hasNext = true;
  let pageNum = 0;

  while (hasNext) {
    pageNum++;
    if (onPage) onPage(pageNum);
    const json = await shopifyFetch(session, ALL_ORDERS_QUERY, { cursor });
    const page = json?.data?.orders;
    if (!page?.edges) break;
    for (const edge of page.edges) {
      const processedAt = new Date(edge.node.processedAt);
      for (const li of edge.node.lineItems.edges) {
        const pid = li.node.product?.id;
        if (!pid) continue;
        if (!productOrders[pid]) productOrders[pid] = [];
        productOrders[pid].push(processedAt);
      }
    }
    hasNext = page.pageInfo?.hasNextPage ?? false;
    cursor = page.pageInfo?.endCursor || null;
  }
  return productOrders;
}

export async function scanStore(session, shop) {
  const store = await getOrCreateStore(shop);
  await updateScanProgress(shop, "scanning", 0);

  let allProducts = await fetchAllProducts(session);
  const limit = getProductLimit(store.plan);
  const products = limit === Infinity ? allProducts : allProducts.slice(0, limit);
  const total = products.length;
  await updateScanProgress(shop, "scanning", 5, 0, total);

  const excludedIds = new Set(
    (await prisma.excludedProduct.findMany({ where: { shop }, select: { productId: true } })).map(e => e.productId)
  );

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const progress = 5 + Math.round(((i + 1) / total) * 40);
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
          imageUrl: p.imageUrl,
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
          imageUrl: p.imageUrl,
        },
      });
    }
  }

  await prisma.store.update({ where: { shop }, data: { scanProgress: 50, scanCurrentProduct: total, scanTotalProducts: total } });

  const scannedIds = new Set(products.map(p => p.id));
  let fetchPageCount = 0;
  const productOrders = await fetchAllOrders(session, () => {
    fetchPageCount++;
    const progress = Math.min(89, 50 + fetchPageCount);
    prisma.store.update({ where: { shop }, data: { scanProgress: progress } }).catch(() => {});
  });

  const orderKeys = Object.keys(productOrders).filter(pid => scannedIds.has(pid));
  const orderTotal = orderKeys.length;

  for (let i = 0; i < orderKeys.length; i++) {
    const pid = orderKeys[i];
    const dates = productOrders[pid];
    dates.sort((a, b) => b - a);
    const lastOrder = dates[0];
    const totalSales = dates.length;

    await prisma.product.updateMany({
      where: { id: pid, shop },
      data: { lastOrderAt: lastOrder, totalSales },
    });

    const progress = 90 + Math.round(((i + 1) / orderTotal) * 9);
    await prisma.store.update({ where: { shop }, data: { scanProgress: progress, scanCurrentProduct: i + 1 } });
  }

  await prisma.store.update({ where: { shop }, data: { scanProgress: 100 } });

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
    data: { lastScanAt: new Date(), scanTotalProducts: allProducts.length },
  });

  return { total, history };
}
