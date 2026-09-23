CREATE TABLE "MessengerConfiguration" (
  "id" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "config" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessengerConfiguration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessengerConfiguration_singleton" CHECK ("id" = 1)
);
