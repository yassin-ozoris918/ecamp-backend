/*
  Warnings:

  - You are about to drop the column `lectureId` on the `ActivationCode` table. All the data in the column will be lost.
  - You are about to drop the column `lectureId` on the `ActivationCodeHistory` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ActivationCodeType" AS ENUM ('LECTURE', 'COURSE');

-- DropForeignKey
ALTER TABLE "ActivationCode" DROP CONSTRAINT "ActivationCode_lectureId_fkey";

-- DropForeignKey
ALTER TABLE "ActivationCodeHistory" DROP CONSTRAINT "ActivationCodeHistory_lectureId_fkey";

-- DropIndex
DROP INDEX "ActivationCode_lectureId_idx";

-- DropIndex
DROP INDEX "ActivationCodeHistory_lectureId_idx";

-- AlterTable
ALTER TABLE "ActivationCode" DROP COLUMN "lectureId",
ADD COLUMN     "educationLevel" "EducationLevel" NOT NULL DEFAULT 'UNIVERSITY',
ADD COLUMN     "redeemedCourseId" TEXT,
ADD COLUMN     "redeemedLectureId" TEXT,
ADD COLUMN     "targetType" "ActivationCodeType" NOT NULL DEFAULT 'LECTURE';

-- AlterTable
ALTER TABLE "ActivationCodeHistory" DROP COLUMN "lectureId",
ADD COLUMN     "redeemedCourseId" TEXT,
ADD COLUMN     "redeemedLectureId" TEXT;

-- AlterTable
ALTER TABLE "Chapter" ALTER COLUMN "isPublished" SET DEFAULT true;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "validityDays" INTEGER;

-- AlterTable
ALTER TABLE "Exam" ALTER COLUMN "isPublished" SET DEFAULT true;

-- AlterTable
ALTER TABLE "Lecture" ALTER COLUMN "isPublished" SET DEFAULT true;

-- AlterTable
ALTER TABLE "Quiz" ALTER COLUMN "isPublished" SET DEFAULT true;

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "isPublished" SET DEFAULT true;

-- AlterTable
ALTER TABLE "StudentLectureAccess" ADD COLUMN     "timerPausedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StudentCourseAccess" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StudentCourseAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentCourseAccess_courseId_idx" ON "StudentCourseAccess"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCourseAccess_studentId_courseId_key" ON "StudentCourseAccess"("studentId", "courseId");

-- CreateIndex
CREATE INDEX "ActivationCode_redeemedLectureId_idx" ON "ActivationCode"("redeemedLectureId");

-- CreateIndex
CREATE INDEX "ActivationCode_redeemedCourseId_idx" ON "ActivationCode"("redeemedCourseId");

-- CreateIndex
CREATE INDEX "ActivationCodeHistory_redeemedLectureId_idx" ON "ActivationCodeHistory"("redeemedLectureId");

-- CreateIndex
CREATE INDEX "ActivationCodeHistory_redeemedCourseId_idx" ON "ActivationCodeHistory"("redeemedCourseId");

-- AddForeignKey
ALTER TABLE "ActivationCode" ADD CONSTRAINT "ActivationCode_redeemedLectureId_fkey" FOREIGN KEY ("redeemedLectureId") REFERENCES "Lecture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationCode" ADD CONSTRAINT "ActivationCode_redeemedCourseId_fkey" FOREIGN KEY ("redeemedCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationCodeHistory" ADD CONSTRAINT "ActivationCodeHistory_redeemedLectureId_fkey" FOREIGN KEY ("redeemedLectureId") REFERENCES "Lecture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationCodeHistory" ADD CONSTRAINT "ActivationCodeHistory_redeemedCourseId_fkey" FOREIGN KEY ("redeemedCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCourseAccess" ADD CONSTRAINT "StudentCourseAccess_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCourseAccess" ADD CONSTRAINT "StudentCourseAccess_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
