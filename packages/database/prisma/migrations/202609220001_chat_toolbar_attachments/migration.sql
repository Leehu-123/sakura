ALTER TABLE "ChatConversation" ADD COLUMN "taggedDate" TEXT;
CREATE TABLE "ChatToolbar" (
  "id" INTEGER PRIMARY KEY,
  "version" INTEGER NOT NULL DEFAULT 1,
  "days" INTEGER NOT NULL DEFAULT 8,
  "labels" JSONB NOT NULL
);
CREATE TABLE "ChatAttachment" (
  "id" UUID PRIMARY KEY,
  "conversationId" UUID NOT NULL REFERENCES "ChatConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdById" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ChatAttachment_conversationId_createdAt_idx" ON "ChatAttachment"("conversationId", "createdAt");
ALTER TABLE "ChatMessage" ADD COLUMN "attachmentId" UUID;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "ChatAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
