-- DropForeignKey
ALTER TABLE "HistoricalOrder" DROP CONSTRAINT "HistoricalOrder_customerId_fkey";

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "sourceData" JSONB,
ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sourceData" JSONB;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "sourceData" JSONB;

-- AlterTable
ALTER TABLE "HistoricalOrder" ADD COLUMN     "linkMethod" TEXT NOT NULL DEFAULT 'SOURCE_ID',
ADD COLUMN     "sourceChannel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sourceCreatedBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sourceCustomerName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sourceData" JSONB,
ALTER COLUMN "customerId" DROP NOT NULL,
ALTER COLUMN "subtotal" DROP NOT NULL,
ALTER COLUMN "discount" DROP NOT NULL,
ALTER COLUMN "shippingFee" DROP NOT NULL,
ALTER COLUMN "paidAmount" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "HistoricalOrder" ADD CONSTRAINT "HistoricalOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HistoricalOrder" ADD CONSTRAINT "HistoricalOrder_total_nonnegative" CHECK ("total" >= 0);
