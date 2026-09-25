-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "expectedProducts" TEXT[] DEFAULT ARRAY[]::TEXT[];
