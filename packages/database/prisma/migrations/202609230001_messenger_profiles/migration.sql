ALTER TABLE "ChatConversation"
  ADD COLUMN "facebookName" TEXT,
  ADD COLUMN "avatarKey" TEXT,
  ADD COLUMN "avatarMime" TEXT,
  ADD COLUMN "avatarBytes" INTEGER,
  ADD COLUMN "profileCheckedAt" TIMESTAMP(3),
  ADD COLUMN "profileState" TEXT NOT NULL DEFAULT 'PENDING';
CREATE INDEX "ChatMessage_direction_createdAt_idx" ON "ChatMessage"("direction", "createdAt");
