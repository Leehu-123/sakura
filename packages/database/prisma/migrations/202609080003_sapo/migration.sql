-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "plan" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SapoReference" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,

    CONSTRAINT "SapoReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalOrder" (
    "id" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "sourceStatus" TEXT NOT NULL,
    "sourcePaymentStatus" TEXT NOT NULL,
    "sourceShippingStatus" TEXT NOT NULL,
    "sourceClosedBy" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "shippingAddress" TEXT NOT NULL,
    "subtotal" DECIMAL(18,0) NOT NULL,
    "discount" DECIMAL(18,0) NOT NULL,
    "shippingFee" DECIMAL(18,0) NOT NULL,
    "total" DECIMAL(18,0) NOT NULL,
    "paidAmount" DECIMAL(18,0) NOT NULL,
    "items" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_createdAt_idx" ON "ImportBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SapoReference_kind_externalId_key" ON "SapoReference"("kind", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalOrder_externalId_key" ON "HistoricalOrder"("externalId");

-- CreateIndex
CREATE INDEX "HistoricalOrder_customerId_orderedAt_idx" ON "HistoricalOrder"("customerId", "orderedAt");

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalOrder" ADD CONSTRAINT "HistoricalOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Import state and historical money must remain valid independently of API validation.
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_status_valid" CHECK (
  ("status" = 'PREVIEW' AND "committedAt" IS NULL) OR ("status" = 'COMMITTED' AND "committedAt" IS NOT NULL)
);
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_kind_valid" CHECK ("kind" IN ('CUSTOMERS', 'PRODUCTS', 'ORDERS'));
ALTER TABLE "SapoReference" ADD CONSTRAINT "SapoReference_kind_valid" CHECK ("kind" IN ('CUSTOMERS', 'PRODUCTS', 'ORDERS', 'PRODUCT_GROUP'));
ALTER TABLE "HistoricalOrder" ADD CONSTRAINT "HistoricalOrder_money_valid" CHECK (
 "subtotal" >= 0 AND "discount" >= 0 AND "discount" <= "subtotal" AND "shippingFee" >= 0
 AND "total" = "subtotal" - "discount" + "shippingFee" AND "paidAmount" >= 0 AND "paidAmount" <= "total"
);
