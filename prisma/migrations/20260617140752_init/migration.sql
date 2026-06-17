-- CreateTable
CREATE TABLE "Store" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "threshold" INTEGER NOT NULL DEFAULT 60,
    "scanStatus" TEXT NOT NULL DEFAULT 'pending',
    "scanProgress" INTEGER NOT NULL DEFAULT 0,
    "lastScanAt" DATETIME,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "category" TEXT,
    "inventoryCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "lastOrderAt" DATETIME,
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "totalViews" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Product_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Store" ("shop") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeadStockEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "daysSinceSale" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "suggestedAction" TEXT NOT NULL,
    "suggestedData" TEXT,
    "flaggedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DeadStockEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeadStockEntry_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Store" ("shop") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExcludedProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExcludedProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExcludedProduct_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Store" ("shop") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScanHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productsScanned" INTEGER NOT NULL DEFAULT 0,
    "deadStockFound" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "ScanHistory_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Store" ("shop") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Product_shop_idx" ON "Product"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Product_shop_handle_key" ON "Product"("shop", "handle");

-- CreateIndex
CREATE INDEX "DeadStockEntry_shop_resolved_idx" ON "DeadStockEntry"("shop", "resolved");

-- CreateIndex
CREATE INDEX "DeadStockEntry_shop_flaggedAt_idx" ON "DeadStockEntry"("shop", "flaggedAt");

-- CreateIndex
CREATE INDEX "ExcludedProduct_shop_idx" ON "ExcludedProduct"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ExcludedProduct_shop_productId_key" ON "ExcludedProduct"("shop", "productId");

-- CreateIndex
CREATE INDEX "ScanHistory_shop_startedAt_idx" ON "ScanHistory"("shop", "startedAt");
