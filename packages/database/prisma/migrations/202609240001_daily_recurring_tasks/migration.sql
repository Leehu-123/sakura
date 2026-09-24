-- AlterTable: SalesTask – add isRecurring
ALTER TABLE "SalesTask" ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "SalesTask_userId_isRecurring_idx" ON "SalesTask"("userId", "isRecurring");
