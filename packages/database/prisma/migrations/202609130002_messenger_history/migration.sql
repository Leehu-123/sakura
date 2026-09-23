CREATE INDEX "ChatMessage_direction_sourceAt_id_idx" ON "ChatMessage"("direction", "sourceAt", "id");
CREATE INDEX "ChatMessage_actorId_direction_sourceAt_id_idx" ON "ChatMessage"("actorId", "direction", "sourceAt", "id");
