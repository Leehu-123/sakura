ALTER TABLE "ProductImage" ALTER COLUMN "data" SET DEFAULT '';
ALTER TABLE "ProductImage" ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "byteSize" INTEGER,
  ADD COLUMN "sourceKey" TEXT,
  ADD COLUMN "sourceUrl" TEXT;
CREATE UNIQUE INDEX "ProductImage_sourceKey_key" ON "ProductImage"("sourceKey");
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_storage_valid"
  CHECK (("storageKey" IS NULL) OR ("storageKey" ~ '^[a-f0-9]{64}$' AND "byteSize" > 0 AND "data" = ''));
