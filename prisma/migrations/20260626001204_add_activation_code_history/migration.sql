-- CreateTable
CREATE TABLE "ActivationCodeHistory" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "studentId" TEXT,
    "action" TEXT NOT NULL,
    "oldStatus" "CodeStatus",
    "newStatus" "CodeStatus" NOT NULL,
    "actorId" TEXT,
    "ipAddress" TEXT,
    "browser" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationCodeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivationCodeHistory_codeId_idx" ON "ActivationCodeHistory"("codeId");

-- CreateIndex
CREATE INDEX "ActivationCodeHistory_lectureId_idx" ON "ActivationCodeHistory"("lectureId");

-- CreateIndex
CREATE INDEX "ActivationCodeHistory_studentId_idx" ON "ActivationCodeHistory"("studentId");

-- CreateIndex
CREATE INDEX "ActivationCodeHistory_createdAt_idx" ON "ActivationCodeHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "ActivationCodeHistory" ADD CONSTRAINT "ActivationCodeHistory_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "ActivationCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationCodeHistory" ADD CONSTRAINT "ActivationCodeHistory_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "Lecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationCodeHistory" ADD CONSTRAINT "ActivationCodeHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationCodeHistory" ADD CONSTRAINT "ActivationCodeHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
