CREATE TABLE "ReportAiConfig" (
  "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK (id=1),
  "provider" TEXT NOT NULL DEFAULT 'OPENAI' CHECK (provider IN ('OPENAI', 'GEMINI')),
  "allowWeb" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
INSERT INTO "Permission" ("id","code","name","applicationId","allowedScopes")
SELECT gen_random_uuid(),'core.ai.manage','Cấu hình AI báo cáo',id,ARRAY['GLOBAL']::"AccessScope"[]
FROM "Application" WHERE code='core' ON CONFLICT (code) DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId","scope")
SELECT r.id,p.id,'GLOBAL'::"AccessScope" FROM "Role" r CROSS JOIN "Permission" p
WHERE r.code='admin' AND p.code='core.ai.manage' ON CONFLICT DO NOTHING;
