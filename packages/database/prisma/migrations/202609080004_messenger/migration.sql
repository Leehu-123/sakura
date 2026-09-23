-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" UUID NOT NULL,
    "pageId" TEXT NOT NULL,
    "psid" TEXT NOT NULL,
    "customerId" UUID,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastInboundAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "actorId" UUID,
    "remoteKey" TEXT,
    "requestKey" UUID,
    "direction" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attachmentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatTemplate" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ChatTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatConversation_customerId_lastActivityAt_idx" ON "ChatConversation"("customerId", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_pageId_psid_key" ON "ChatConversation"("pageId", "psid");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_remoteKey_key" ON "ChatMessage"("remoteKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_requestKey_key" ON "ChatMessage"("requestKey");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_sourceAt_id_idx" ON "ChatMessage"("conversationId", "sourceAt", "id");

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_state_valid" CHECK (("direction" = 'INBOUND' AND "state" = 'RECEIVED' AND "remoteKey" IS NOT NULL) OR ("direction" = 'OUTBOUND' AND "state" IN ('SENDING','SENT','FAILED','UNKNOWN') AND "actorId" IS NOT NULL AND "requestKey" IS NOT NULL));
