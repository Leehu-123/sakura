CREATE TYPE "TaskParticipantRole" AS ENUM ('COLLABORATOR', 'FOLLOWER');
CREATE TABLE "SalesTaskParticipant" (
  "taskId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "TaskParticipantRole" NOT NULL,
  CONSTRAINT "SalesTaskParticipant_pkey" PRIMARY KEY ("taskId", "userId"),
  CONSTRAINT "SalesTaskParticipant_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SalesTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SalesTaskParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SalesTaskParticipant_userId_role_idx" ON "SalesTaskParticipant"("userId", "role");
