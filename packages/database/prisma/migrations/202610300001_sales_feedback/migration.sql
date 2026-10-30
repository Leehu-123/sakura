ALTER TABLE "Order"
  ADD COLUMN "salesTeamName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "salesChannel" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "salesSourceName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "sourcePageId" TEXT,
  ADD COLUMN "deliveryRegion" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "promisedDeliveryAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "codStatus" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "Employee"
  ADD COLUMN "jobTitle" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "workEmail" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "phone" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Order" ADD CONSTRAINT "Order_sales_channel" CHECK ("salesChannel" IN ('UNKNOWN','PAGE','ZALO','SELF','OTHER'));
ALTER TABLE "Order" ADD CONSTRAINT "Order_delivery_region" CHECK ("deliveryRegion" IN ('UNKNOWN','NORTH','CENTRAL','SOUTH','HIGHLANDS'));
ALTER TABLE "Order" ADD CONSTRAINT "Order_cod_status" CHECK ("codStatus" IN ('UNKNOWN','NOT_COD','WAITING_COLLECTION','COLLECTED','REMITTED'));
CREATE TABLE "CompanyProfile" (
  "id" INTEGER NOT NULL DEFAULT 1 PRIMARY KEY,
  "name" TEXT NOT NULL DEFAULT 'Sakura',
  "address" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "Permission" (id,code,name,"allowedScopes","applicationId")
  SELECT '36ccd017-1c14-47f2-97df-bb76eb38e537','sales.staff.manage','Cấp vai trò Sale vùng',ARRAY['GLOBAL']::"AccessScope"[],id FROM "Application" WHERE code='sales' ON CONFLICT (code) DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId",scope)
  SELECT r.id,p.id,'GLOBAL'::"AccessScope" FROM "Role" r CROSS JOIN "Permission" p WHERE r.code IN ('admin','sales_lead') AND p.code='sales.staff.manage' ON CONFLICT DO NOTHING;
