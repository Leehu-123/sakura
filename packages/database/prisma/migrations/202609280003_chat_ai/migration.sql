CREATE TABLE "ChatAiPage" (
 "pageId" TEXT PRIMARY KEY, "enabled" BOOLEAN NOT NULL DEFAULT false, "instructions" TEXT NOT NULL DEFAULT '',
 "greeting" TEXT NOT NULL DEFAULT 'Dạ, anh/chị tham khảo thông tin bên dưới nhé.', "policy" TEXT NOT NULL DEFAULT '',
 "productIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[], "version" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "ChatAiDraft" (
 "id" UUID PRIMARY KEY, "conversationId" UUID NOT NULL REFERENCES "ChatConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorId" UUID NOT NULL, "fingerprint" TEXT NOT NULL, "variantIds" UUID[] NOT NULL,
 "reply" TEXT NOT NULL, "summary" TEXT NOT NULL, "warnings" TEXT[] NOT NULL, "products" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ChatAiDraft_conversationId_actorId_createdAt_idx" ON "ChatAiDraft"("conversationId","actorId","createdAt");
ALTER TABLE "ChatMessage" ADD COLUMN "aiDraftId" UUID REFERENCES "ChatAiDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ChatMessage_aiDraftId_key" ON "ChatMessage"("aiDraftId");
