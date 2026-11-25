-- CreateEnum
CREATE TYPE "SupportBotOutcome" AS ENUM ('ANSWERED', 'NO_MATCH', 'REFUSED');

-- CreateTable
CREATE TABLE "SupportFaq" (
    "id" TEXT NOT NULL,
    "questionEn" TEXT NOT NULL,
    "questionAr" TEXT NOT NULL,
    "answerEn" TEXT NOT NULL,
    "answerAr" TEXT NOT NULL,
    "phrasings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "linkUrl" TEXT,
    "linkLabelEn" TEXT,
    "linkLabelAr" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "timesShown" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "unhelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportFaq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportBotQuery" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "outcome" "SupportBotOutcome" NOT NULL,
    "matchedBy" TEXT,
    "faqId" TEXT,
    "helpful" BOOLEAN,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportBotQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportFaq_isActive_sortOrder_idx" ON "SupportFaq"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "SupportBotQuery_outcome_resolved_createdAt_idx" ON "SupportBotQuery"("outcome", "resolved", "createdAt");

-- CreateIndex
CREATE INDEX "SupportBotQuery_createdAt_idx" ON "SupportBotQuery"("createdAt");

-- AddForeignKey
ALTER TABLE "SupportBotQuery" ADD CONSTRAINT "SupportBotQuery_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "SupportFaq"("id") ON DELETE SET NULL ON UPDATE CASCADE;
