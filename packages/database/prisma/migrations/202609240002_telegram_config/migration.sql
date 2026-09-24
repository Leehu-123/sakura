-- AlterTable
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;

-- CreateTable
CREATE TABLE "TelegramConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "botToken" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramConfig_pkey" PRIMARY KEY ("id")
);

-- Seed default config
INSERT INTO "TelegramConfig" ("id", "botToken", "enabled", "updatedAt")
VALUES (1, '', false, NOW())
ON CONFLICT ("id") DO NOTHING;
