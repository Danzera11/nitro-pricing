CREATE TYPE "AiLearningStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AiLearning" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" "AiLearningStatus" NOT NULL DEFAULT 'PENDING',
  "active" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "sourceQuoteId" TEXT,
  "evidenceJson" JSONB NOT NULL DEFAULT '{}',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiLearning_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiLearning_status_active_idx" ON "AiLearning"("status", "active");
CREATE INDEX "AiLearning_sourceQuoteId_idx" ON "AiLearning"("sourceQuoteId");
