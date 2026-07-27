-- CreateTable
CREATE TABLE "AIExtractionLog" (
    "id" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedTokens" INTEGER NOT NULL DEFAULT 0,
    "isSuccess" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIExtractionLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AIExtractionLog" ADD CONSTRAINT "AIExtractionLog_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
