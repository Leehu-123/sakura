ALTER TABLE "Customer" ADD COLUMN "closingProbability" INTEGER, ADD COLUMN "expectedItems" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_closingProbability_range" CHECK ("closingProbability" IS NULL OR "closingProbability" BETWEEN 0 AND 100);
