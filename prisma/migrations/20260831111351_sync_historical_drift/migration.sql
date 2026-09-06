-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "ActivationCode" ADD COLUMN     "isCopied" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "isFree" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StudentLectureAccess" ADD COLUMN     "isStarted" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "activatedAt" DROP NOT NULL,
ALTER COLUMN "activatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ProfileUpdateRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "requestedFullName" TEXT,
    "requestedPhoneNumber" TEXT,
    "requestedParentPhone" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "ProfileUpdateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileUpdateRequest_studentId_idx" ON "ProfileUpdateRequest"("studentId");

-- CreateIndex
CREATE INDEX "ProfileUpdateRequest_status_idx" ON "ProfileUpdateRequest"("status");

-- AddForeignKey
ALTER TABLE "ProfileUpdateRequest" ADD CONSTRAINT "ProfileUpdateRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileUpdateRequest" ADD CONSTRAINT "ProfileUpdateRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
