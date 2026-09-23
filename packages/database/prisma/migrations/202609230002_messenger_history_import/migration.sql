ALTER TABLE "ChatMessage" ADD COLUMN "imported" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_state_valid";
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_state_valid" CHECK (
  ("direction"='INBOUND' AND "state"='RECEIVED' AND "remoteKey" IS NOT NULL) OR
  ("direction"='OUTBOUND' AND NOT "imported" AND "state" IN ('SENDING','SENT','FAILED','UNKNOWN') AND "actorId" IS NOT NULL AND "requestKey" IS NOT NULL) OR
  ("direction"='OUTBOUND' AND "imported" AND "state"='SENT' AND "remoteKey" IS NOT NULL AND "actorId" IS NULL AND "requestKey" IS NULL)
);
CREATE TABLE "ChatHistoryImport" (
  "pageId" TEXT PRIMARY KEY,
  "cursor" JSONB NOT NULL DEFAULT '{}',
  "complete" BOOLEAN NOT NULL DEFAULT false,
  "importedMessages" INTEGER NOT NULL DEFAULT 0,
  "conversations" INTEGER NOT NULL DEFAULT 0,
  "leaseUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
