-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN     "blockReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inboundSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastSentAt" TIMESTAMP(3),
ADD COLUMN     "supportUserId" UUID;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "imageId" UUID,
ADD COLUMN     "orderId" UUID,
ADD COLUMN     "orderVersion" INTEGER,
ADD COLUMN     "snapshot" JSONB;

-- CreateTable
CREATE TABLE "ChatRead" (
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "readSeq" INTEGER NOT NULL DEFAULT 0,
    "unread" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChatRead_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "title" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverySlip" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "previousSnapshots" JSONB NOT NULL DEFAULT '[]',
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverySlip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductImage_productId_createdAt_idx" ON "ProductImage"("productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverySlip_orderId_key" ON "DeliverySlip"("orderId");

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_supportUserId_fkey" FOREIGN KEY ("supportUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ProductImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRead" ADD CONSTRAINT "ChatRead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRead" ADD CONSTRAINT "ChatRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverySlip" ADD CONSTRAINT "DeliverySlip_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverySlip" ADD CONSTRAINT "DeliverySlip_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill existing conversations without interpreting unsent attempts as replies.
UPDATE "ChatConversation" c SET "inboundSeq" = (SELECT count(*)::integer FROM "ChatMessage" m WHERE m."conversationId"=c.id AND m.direction='INBOUND'), "lastSentAt" = (SELECT max(m."sourceAt") FROM "ChatMessage" m WHERE m."conversationId"=c.id AND m.direction='OUTBOUND' AND m.state='SENT');
ALTER TABLE "ChatConversation" ADD CONSTRAINT "chat_inbound_seq_nonnegative" CHECK ("inboundSeq" >= 0);
ALTER TABLE "ChatMessage" ADD CONSTRAINT "chat_content_references" CHECK (("imageId" IS NULL OR "orderId" IS NULL) AND (("orderId" IS NULL AND "orderVersion" IS NULL) OR ("orderId" IS NOT NULL AND "orderVersion" > 0 AND snapshot IS NOT NULL)));
