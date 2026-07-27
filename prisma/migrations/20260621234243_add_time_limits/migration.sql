-- AlterTable
ALTER TABLE "Lecture" ADD COLUMN     "validityDays" INTEGER;

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "timeLimit" INTEGER;

-- AlterTable
ALTER TABLE "QuizAttempt" ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StudentLectureAccess" ADD COLUMN     "startedAt" TIMESTAMP(3);
