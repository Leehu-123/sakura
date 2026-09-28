ALTER TABLE "Order"
  ADD COLUMN "carrierEstimatedFee" DECIMAL(18,0),
  ADD COLUMN "shippingCost" DECIMAL(18,0),
  ADD COLUMN "shippingCostNote" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "carrierStatusCode" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "carrierStatusLabel" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "carrierUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "shippingSyncedAt" TIMESTAMP(3),
  ADD COLUMN "shippingSyncError" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "shippingNextSyncAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD CONSTRAINT "Order_shipping_money_valid" CHECK (("shippingCost" IS NULL OR "shippingCost">=0) AND ("carrierEstimatedFee" IS NULL OR "carrierEstimatedFee">=0));
CREATE TABLE "ShippingConnection" (
  "id" INTEGER NOT NULL DEFAULT 1 PRIMARY KEY,
  "customerCode" TEXT NOT NULL,
  "tokenEncrypted" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'PRODUCTION',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShippingConnection_singleton" CHECK (id=1),
  CONSTRAINT "ShippingConnection_environment" CHECK (environment='PRODUCTION')
);
CREATE TABLE "ShippingEvent" (
  "id" UUID NOT NULL PRIMARY KEY,
  "orderId" UUID NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "trackingCode" TEXT NOT NULL,
  "statusCode" TEXT NOT NULL,
  "statusLabel" TEXT NOT NULL,
  "estimatedFee" DECIMAL(18,0),
  "carrierUpdatedAt" TIMESTAMP(3) NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fingerprint" TEXT NOT NULL
);
CREATE UNIQUE INDEX "ShippingEvent_orderId_fingerprint_key" ON "ShippingEvent"("orderId","fingerprint");
CREATE INDEX "ShippingEvent_orderId_observedAt_idx" ON "ShippingEvent"("orderId","observedAt");
INSERT INTO "Permission" ("id","code","name","applicationId","allowedScopes")
SELECT gen_random_uuid(),'core.shipping.manage','Cấu hình kết nối vận chuyển',id,ARRAY['GLOBAL']::"AccessScope"[]
FROM "Application" WHERE code='core' ON CONFLICT (code) DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId","scope")
SELECT r.id,p.id,'GLOBAL'::"AccessScope" FROM "Role" r CROSS JOIN "Permission" p
WHERE r.code='admin' AND p.code='core.shipping.manage' ON CONFLICT DO NOTHING;
